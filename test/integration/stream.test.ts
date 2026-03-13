import { describe, expect, it } from 'vitest'

import { createWindsurfProvider } from '../../src/provider.js'

type StreamPart = {
  type: string
}

const itIfApiKey = process.env.WINDSURF_API_KEY ? it : it.skip

describe('integration stream', () => {
  itIfApiKey(
    'emits stream-start and finish from real doStream call',
    async () => {
      const apiKey = process.env.WINDSURF_API_KEY
      expect(apiKey).toBeTruthy()

      const provider = createWindsurfProvider({ apiKey })
      const model = provider('MODEL_SWE_1_6_FAST')
      const result = await model.doStream({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Give a brief one-line answer about testing.',
              },
            ],
          },
        ],
      })

      const reader = result.stream.getReader()
      const parts: StreamPart[] = []

      while (true) {
        const next = await reader.read()
        if (next.done) {
          break
        }

        parts.push(next.value as StreamPart)
      }

      const types = parts.map((part) => part.type)

      expect(types).toContain('stream-start')
      expect(types).toContain('finish')
      expect(parts.length).toBeGreaterThanOrEqual(3)
    },
    90_000,
  )
})
