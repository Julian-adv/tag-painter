<script lang="ts">
  import { tick } from 'svelte'
  import type { StepController } from './stepInterface'
  import { INSTALLATION_STEPS } from './stepConfig'

  interface Props {
    isOpen: boolean
    onClose?: () => void
  }

  let { isOpen = $bindable(), onClose }: Props = $props()

  let stepRefs: Array<HTMLElement | null> = []
  let stepsContainer = $state<HTMLDivElement | null>(null)

  // Single controller for the current active step
  let currentController: StepController | undefined = $state(undefined)

  // Current active step
  let currentStepIndex = $state(0)

  const currentStep = $derived(INSTALLATION_STEPS[currentStepIndex])
  const isLastStep = $derived(currentStepIndex === INSTALLATION_STEPS.length - 1)

  // Initialize current step when dialog opens or step changes
  $effect(() => {
    if (isOpen && currentController) {
      currentController.init()
    }
  })

  async function handleExecuteStep() {
    if (currentController) {
      await currentController.execute()
    }
  }

  function handleSkipStep() {
    if (currentController) {
      currentController.skip()
      moveToNextStep()
    }
  }

  function handleConfirmStep() {
    if (currentController) {
      currentController.confirmStep()
      moveToNextStep()
    }
  }

  function moveToNextStep() {
    if (currentStepIndex < INSTALLATION_STEPS.length - 1) {
      currentStepIndex++
      // Controller will be updated by the new step component's bind
      // and initialized by the $effect above
    }
  }

  function handleClose() {
    isOpen = false
    onClose?.()
  }

  async function handleReset() {
    // Reset current controller
    currentController?.reset()

    // Reset to first step
    currentStepIndex = 0

    // Controller will be re-initialized by $effect
  }

  // Check if current step can proceed
  const canProceed = $derived(() => {
    return currentController?.canProceed() ?? false
  })

  const showExecuteButton = $derived(() => {
    return currentController?.getStatus() === 'pending' || currentController?.getStatus() === 'error'
  })

  const showNextButton = $derived(() => {
    return currentController?.isComplete() && currentController?.requiresUserConfirmation() && !currentController?.getUserConfirmed()
  })

  const showSkipButton = $derived(() => {
    return currentController?.getStatus() === 'pending'
  })

  let hasScrolledOnce = false

  async function scrollCurrentStepIntoView(): Promise<void> {
    await tick()
    const currentEl = stepRefs[currentStepIndex]
    const shouldScroll = currentStepIndex > 0 || hasScrolledOnce
    if (!shouldScroll) {
      return
    }
    if (currentEl && stepsContainer) {
      currentEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start'
      })
      hasScrolledOnce = true
    }
  }

  function registerStep(el: HTMLElement, idx: number) {
    stepRefs[idx] = el
    return {
      destroy() {
        stepRefs[idx] = null
      }
    }
  }

  $effect(() => {
    currentStepIndex
    stepsContainer
    void scrollCurrentStepIntoView()
  })

  $effect(() => {
    if (isOpen && stepsContainer) {
      hasScrolledOnce = false
      stepsContainer.scrollTo({ left: 0, behavior: 'auto' })
    }
  })
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="h-[40vh] max-h-[65vh] w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
      <div class="flex h-full flex-col overflow-hidden p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
            Installation Wizard
          </h2>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            onclick={handleClose}
          >
            ✕
          </button>
        </div>

        <div class="flex-1 overflow-y-auto pr-2">
          <!-- Progress indicator -->
          <div class="mb-6">
            <div class="overflow-x-auto no-scrollbar" bind:this={stepsContainer}>
              <div class="flex items-center gap-2 min-w-max pr-2">
                {#each INSTALLATION_STEPS as step, idx}
                  <div class="flex items-center gap-2 step-indicator" use:registerStep={idx}>
                    <div
                      class={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                        idx === currentStepIndex
                          ? 'bg-blue-600 text-white'
                          : idx < currentStepIndex
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span class={`text-sm ${idx === currentStepIndex ? 'font-semibold' : ''}`}>
                        {step.name()}
                    </span>
                    {#if idx < INSTALLATION_STEPS.length - 1}
                      <div class="mx-2 h-0.5 w-8 bg-gray-300 dark:bg-gray-600"></div>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          </div>

          <!-- Step content -->
          <div class="mb-6">
            <currentStep.component
              bind:controller={currentController}
            />
          </div>
        </div>

        <!-- Action buttons -->
        <div class="mt-2 flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-400 dark:hover:bg-gray-800"
            onclick={handleReset}
          >
            Reset
          </button>

          <div class="flex items-center gap-2">
            {#if showSkipButton()}
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-400 dark:hover:bg-gray-800"
                onclick={handleSkipStep}
              >
                Skip
              </button>
            {/if}

            {#if showExecuteButton()}
              <button
                type="button"
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                onclick={handleExecuteStep}
              >
                Execute
              </button>
            {/if}

            {#if showNextButton()}
              <button
                type="button"
                class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
                onclick={isLastStep ? handleClose : handleConfirmStep}
              >
                {isLastStep ? 'Done' : 'Next Step'}
              </button>
            {:else if canProceed()}
              <button
                type="button"
                class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                onclick={moveToNextStep}
                disabled={!canProceed() || isLastStep}
              >
                Next
              </button>
            {/if}

          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .no-scrollbar {
    scrollbar-width: none;
  }

  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }

  .step-indicator {
    scroll-margin-left: 24px;
  }
</style>
