import { json } from '@sveltejs/kit'

export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:8188/object_info')
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    // Extract LoRA models from object_info
    const loraLoader = data.LoraLoader || data.LoraLoaderModelOnly
    const loras = loraLoader?.input?.required?.lora_name?.[0] || []
    
    return json({ loras })
  } catch (error) {
    console.error('Failed to fetch LoRAs:', error)
    return json({ loras: [], error: 'Failed to fetch LoRA models' }, { status: 500 })
  }
}