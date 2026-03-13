import type { WindsurfProviderOptions } from '../types'

export function resolveApiKey(options?: WindsurfProviderOptions): string {
  if (options?.apiKey) return options.apiKey
  if (process.env.WINDSURF_API_KEY) return process.env.WINDSURF_API_KEY
  throw new Error('WINDSURF_API_KEY is required')
}
