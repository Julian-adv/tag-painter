<!-- Component for prompt input forms and checkpoint selection -->
<script lang="ts">
  import LoraSelector from "./LoraSelector.svelte";
  import CompositionSelector from "./CompositionSelector.svelte";
  import TagZones from "./TagZones.svelte";
  import {
    promptsData,
    updateCheckpoint,
    updateUpscale,
    updateFaceDetailer,
    updateSelectedLoras,
    updateLoraWeight,
  } from "./stores/promptsStore";

  interface Props {
    availableCheckpoints: string[];
  }

  let { availableCheckpoints }: Props = $props();

  function handleLoraChange(loras: string[]) {
    updateSelectedLoras(loras);
  }

  function handleLoraWeightChange(weight: number) {
    updateLoraWeight(weight);
  }
</script>

<div class="prompt-form">
  <CompositionSelector />

  <TagZones />


  <div class="form-section">
    <div class="field">
      <label for="checkpoint">Checkpoint</label>
      <select
        id="checkpoint"
        value={$promptsData.selectedCheckpoint || ""}
        onchange={(e) =>
          updateCheckpoint((e.target as HTMLSelectElement).value)}
      >
        <option value="">Select checkpoint...</option>
        {#each availableCheckpoints as checkpoint (checkpoint)}
          <option value={checkpoint}>{checkpoint}</option>
        {/each}
      </select>
    </div>

    <!-- LoRA Selector -->
    <div class="field">
      <LoraSelector
        selectedLoras={$promptsData.selectedLoras}
        onLoraChange={handleLoraChange}
        loraWeight={$promptsData.loraWeight}
        onWeightChange={handleLoraWeightChange}
      />
    </div>

    <div class="field">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={$promptsData.useUpscale}
          onchange={(e) =>
            updateUpscale((e.target as HTMLInputElement).checked)}
        />
        Use Upscale
      </label>
    </div>

    <div class="field">
      <label class="checkbox-label">
        <input
          type="checkbox"
          class="accent-sky-600"
          checked={$promptsData.useFaceDetailer}
          onchange={(e) =>
            updateFaceDetailer((e.target as HTMLInputElement).checked)}
        />
        Use Face Detailer
      </label>
    </div>
  </div>
</div>


<style>
  .prompt-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    overflow-y: auto;
    max-height: calc(100vh - 630px);
    padding-right: 4px;
  }

  .form-section::-webkit-scrollbar {
    width: 4px;
  }

  .form-section::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 2px;
  }

  .form-section::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 2px;
  }

  .form-section::-webkit-scrollbar-thumb:hover {
    background: #a1a1a1;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .field label {
    font-weight: bold;
    font-size: 14px;
    color: #000;
    text-align: left;
  }

  .field select {
    width: 100%;
    padding: 4px;
    border-radius: 4px;
    border: 1px solid #ddd;
    font-size: 13px;
    background-color: #fff;
    box-sizing: border-box;
    transition: border-color 0.2s ease;
  }

  .field select:focus {
    outline: none;
    border-color: #4caf50;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
  }

  .field .checkbox-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: normal;
    font-size: 13px;
  }

  .checkbox-label input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
  }

</style>
