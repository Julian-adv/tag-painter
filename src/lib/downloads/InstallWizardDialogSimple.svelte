<script lang="ts">
  import type { StepController } from './stepInterface'
  import { INSTALLATION_STEPS } from './stepConfig'

  interface Props {
    isOpen: boolean
    onClose?: () => void
  }

  let { isOpen = $bindable(), onClose }: Props = $props()

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
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
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

      <!-- Progress indicator -->
      <div class="mb-6">
        <div class="flex items-center gap-2">
          {#each INSTALLATION_STEPS as step, idx}
            <div class="flex items-center gap-2">
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
                {step.name}
              </span>
              {#if idx < INSTALLATION_STEPS.length - 1}
                <div class="mx-2 h-0.5 w-8 bg-gray-300 dark:bg-gray-600"></div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Step content -->
      <div class="mb-6">
        <currentStep.component
          bind:controller={currentController}
        />
      </div>

      <!-- Action buttons -->
      <div class="flex items-center justify-between gap-2">
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
              onclick={handleConfirmStep}
            >
              Next Step
            </button>
          {/if}

          {#if isLastStep && canProceed()}
            <button
              type="button"
              class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              onclick={handleClose}
            >
              Complete
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
