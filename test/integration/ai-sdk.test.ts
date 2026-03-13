import { generateText, streamText } from 'ai'
import { describe, expect, it } from 'vitest'

import { createWindsurfProvider } from '../../src/provider.js'

const itIfApiKey = process.env.WINDSURF_API_KEY ? it : it.skip
type SdkModel = Parameters<typeof generateText>[0]['model']

function toSdkModel(model: ReturnType<ReturnType<typeof createWindsurfProvider>>): SdkModel {
  return model as unknown as SdkModel
}

describe('integration ai sdk', () => {
  itIfApiKey(
    'returns non-empty text from generateText',
    async () => {
      const apiKey = process.env.WINDSURF_API_KEY
      expect(apiKey).toBeTruthy()

      const windsurf = createWindsurfProvider({ apiKey })
      const result = await generateText({
        model: toSdkModel(windsurf('MODEL_SWE_1_6_FAST')),
        prompt: 'Respond with one short sentence about TypeScript.',
      })
      console.log(result.text);


      expect(result.text.trim().length).toBeGreaterThan(0)
    },
    90_000,
  )

  itIfApiKey(
    'returns non-empty streamed text from streamText',
    async () => {
      const apiKey = process.env.WINDSURF_API_KEY
      expect(apiKey).toBeTruthy()

      const windsurf = createWindsurfProvider({ apiKey })
      const result = streamText({
        model: toSdkModel(windsurf('MODEL_SWE_1_6_FAST')),
        prompt: 'Respond with one short sentence about TypeScript.',
      })

      let text = ''
      for await (const chunk of result.textStream) {
        text += chunk
      }
      console.log(text);

      expect(text.trim().length).toBeGreaterThan(0)
    },
    90_000,
  )
})
