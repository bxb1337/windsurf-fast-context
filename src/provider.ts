import { DevstralLanguageModel } from './model/devstral-language-model.js'
import type { WindsurfProviderOptions, WindsurfProvider } from './types/index.js'

export function createWindsurfProvider(options: WindsurfProviderOptions = {}): WindsurfProvider {
  const createLanguageModel = (modelId?: string) => {
    const opts = { ...options, modelId }
    return new DevstralLanguageModel(opts)
  }

  const provider = createLanguageModel as WindsurfProvider
  provider.languageModel = createLanguageModel

  return provider
}

export const windsurf = createWindsurfProvider()

export default windsurf
