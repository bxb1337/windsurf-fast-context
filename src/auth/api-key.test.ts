import { describe, it, expect, afterEach } from 'vitest'
import { resolveApiKey } from './api-key'

describe('api key resolver', () => {
  const ORIGINAL = process.env.WINDSURF_API_KEY

  afterEach(() => {
    // restore original env to avoid leakage
    if (ORIGINAL === undefined) {
      delete process.env.WINDSURF_API_KEY
    } else {
      process.env.WINDSURF_API_KEY = ORIGINAL
    }
  })

  it('constructor', () => {
    const key = resolveApiKey({ apiKey: 'ctor-key' })
    expect(key).toBe('ctor-key')
  })

  it('env', () => {
    process.env.WINDSURF_API_KEY = 'test-key'
    const key = resolveApiKey()
    expect(key).toBe('test-key')
  })

  it('missing', () => {
    delete process.env.WINDSURF_API_KEY
    expect(() => resolveApiKey()).toThrowError(new Error('WINDSURF_API_KEY is required'))
  })
})
