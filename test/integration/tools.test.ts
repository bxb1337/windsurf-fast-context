import { describe, expect, it } from 'vitest'

import { createWindsurfProvider } from '../../src/provider.js'

type GeneratePart =
  | {
      type: 'text'
      text: string
    }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      input: string
    }

const itIfApiKey = process.env.WINDSURF_API_KEY ? it : it.skip

describe('integration tools', () => {
  itIfApiKey(
    'detects tool-call shape when model emits one',
    async () => {
      const apiKey = process.env.WINDSURF_API_KEY
      expect(apiKey).toBeTruthy()

      const provider = createWindsurfProvider({ apiKey })
      const model = provider('MODEL_SWE_1_6_FAST')
      const result = await model.doGenerate({
        prompt: [
          {
            role: 'system',
            content: 'Prefer tool use when a matching tool is provided.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Use the searchRepo tool with query "jwt manager" if possible.',
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            name: 'searchRepo',
            description: 'Searches files in a repository by query text.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        ],
      })

      expect(result.content.length).toBeGreaterThan(0)

      const toolCalls = (result.content as GeneratePart[]).filter(
        (part): part is Extract<GeneratePart, { type: 'tool-call' }> => part.type === 'tool-call',
      )

      if (toolCalls.length === 0) {
        const hasText = (result.content as GeneratePart[]).some(
          (part) => part.type === 'text' && part.text.trim().length > 0,
        )
        expect(hasText).toBe(true)
        return
      }

      const firstToolCall = toolCalls[0]
      if (!firstToolCall) {
        throw new Error('Expected at least one tool call')
      }

      expect(firstToolCall.toolCallId.length).toBeGreaterThan(0)
      expect(firstToolCall.toolName.length).toBeGreaterThan(0)
      expect(typeof firstToolCall.input).toBe('string')
    },
    90_000,
  )
})
