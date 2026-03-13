import { describe, it, expect } from 'vitest'
import { createWindsurfProvider, windsurf } from './provider.js'
import { DevstralLanguageModel } from './model/devstral-language-model.js'

// Helper to narrow the returned model in tests without using `any`.
function providerShape(m: unknown) {
  return m as {
    apiKey?: string
    baseURL?: string
    headers?: Record<string, string>
  }
}

describe('provider factory', () => {
  it('with-api-key: constructs model when apiKey passed explicitly', () => {
    const factory = createWindsurfProvider({ apiKey: 'explicit-key' })
    const model = factory('MODEL_SWE_1_6_FAST')
    expect(model).toBeInstanceOf(DevstralLanguageModel)
    expect(providerShape(model).apiKey).toBe('explicit-key')
  })

  it('env-var: uses WINDSURF_API_KEY when apiKey not provided', () => {
    const old = process.env.WINDSURF_API_KEY
    try {
      process.env.WINDSURF_API_KEY = 'env-key'
      const factory = createWindsurfProvider()
      const model = factory('MODEL_SWE_1_6_FAST')
      expect(providerShape(model).apiKey).toBe('env-key')
    } finally {
      if (old === undefined) delete process.env.WINDSURF_API_KEY
      else process.env.WINDSURF_API_KEY = old
    }
  })

  it('no-key: throws when no api key available', () => {
    const old = process.env.WINDSURF_API_KEY
    try {
      delete process.env.WINDSURF_API_KEY
      const factory = createWindsurfProvider()
      expect(() => factory('MODEL_SWE_1_6_FAST')).toThrow('WINDSURF_API_KEY is required')
    } finally {
      if (old === undefined) delete process.env.WINDSURF_API_KEY
      else process.env.WINDSURF_API_KEY = old
    }
  })

  it('custom-baseurl: passes baseURL and trims trailing slash', () => {
    const factory = createWindsurfProvider({ apiKey: 'k', baseURL: 'https://example.com/' })
    const model = factory('MODEL_SWE_1_6_FAST')
    expect(providerShape(model).baseURL).toBe('https://example.com')
  })

  it('custom-headers: passes headers through to model', () => {
    const headers = { 'x-foo': 'bar' }
    const factory = createWindsurfProvider({ apiKey: 'k', headers })
    const model = factory('MODEL_SWE_1_6_FAST')
    expect(providerShape(model).headers!['x-foo']).toBe('bar')
  })

  it('exports: named factory and default windsurf', () => {
    expect(typeof createWindsurfProvider).toBe('function')
    expect(windsurf).toBeDefined()
  })
})
