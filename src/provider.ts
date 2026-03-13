import { DevstralLanguageModel } from './model/devstral-language-model.js'
import type { WindsurfProviderOptions } from './types/index.js'

export function createWindsurfProvider(options: WindsurfProviderOptions = {}) {
  return (modelId?: string) => {
    const opts = { ...options, modelId }
    return new DevstralLanguageModel(opts)
  }
}

export const windsurf = createWindsurfProvider()

export default windsurf
