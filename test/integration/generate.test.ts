import { describe, expect, it } from 'vitest'

import { createWindsurfProvider } from '../../src/provider.js'

const itIfApiKey = process.env.WINDSURF_API_KEY ? it : it.skip

describe('integration generate', () => {
  itIfApiKey(
    'returns content from real doGenerate call',
    async () => {
      const apiKey = process.env.WINDSURF_API_KEY
      expect(apiKey).toBeTruthy()

      const provider = createWindsurfProvider({ apiKey })
      const model = provider('MODEL_SWE_1_6_FAST')
      const result = await model.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Respond with one short sentence about TypeScript.',
              },
            ],
          },
        ],
      })

      expect(result.content.length).toBeGreaterThan(0)

      const hasContent = result.content.some((part) => {
        if (part.type === 'text') {
          return part.text.trim().length > 0
        }

        return part.toolName.trim().length > 0
      })

      expect(hasContent).toBe(true)
    },
    90_000,
  )
})
