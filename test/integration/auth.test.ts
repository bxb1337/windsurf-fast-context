import { describe, expect, it } from 'vitest'

import { JwtManager } from '../../src/auth/jwt-manager.js'

const itIfApiKey = process.env.WINDSURF_API_KEY ? it : it.skip

describe('integration auth', () => {
  itIfApiKey(
    'exchanges api key for jwt',
    async () => {
      const apiKey = process.env.WINDSURF_API_KEY
      expect(apiKey).toBeTruthy()

      const jwtManager = new JwtManager()
      const jwt = await jwtManager.getJwt(apiKey as string)

      expect(typeof jwt).toBe('string')
      expect(jwt.length).toBeGreaterThan(0)
      expect(jwt.split('.')).toHaveLength(3)
    },
    60_000,
  )
})
