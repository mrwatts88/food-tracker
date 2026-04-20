import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

import type { AppConfig } from '../config'

export type VoiceMetric = 'calorie' | 'protein' | 'sugar' | 'caffeine'
export type VoiceItemKind = 'explicit_metric' | 'food_item'

export type VoiceEstimate = {
  metric: VoiceMetric
  amount: number
}

export type VoiceParseItem = {
  kind: VoiceItemKind
  rawText: string
  name?: string
  quantityText?: string | null
  estimated: VoiceEstimate[]
}

export type VoiceTotals = Record<VoiceMetric, number>

export type VoiceParseResult = {
  transcript: string
  items: VoiceParseItem[]
  totals: VoiceTotals
  warnings: string[]
}

export interface VoiceParser {
  parseAudio(file: File): Promise<VoiceParseResult>
}

type VoiceParserDependencies = {
  openai?: Pick<OpenAI, 'audio' | 'responses'>
}

const voiceMetricSchema = z.enum(['calorie', 'protein', 'sugar', 'caffeine'])

const parsedVoiceItemSchema = z.object({
  kind: z.enum(['explicit_metric', 'food_item']),
  rawText: z.string().trim().min(1),
  name: z.string().trim().min(1).nullable(),
  quantityText: z.string().trim().min(1).nullable(),
  estimated: z.array(
    z.object({
      metric: voiceMetricSchema,
      amount: z.number().int().nonnegative()
    })
  )
})

const parsedVoiceResponseSchema = z.object({
  items: z.array(parsedVoiceItemSchema),
  warnings: z.array(z.string().trim().min(1))
})

export function createVoiceParser(
  config: AppConfig,
  dependencies: VoiceParserDependencies = {}
): VoiceParser | null {
  if (!config.openAiApiKey) {
    return null
  }

  const openai = dependencies.openai ?? new OpenAI({ apiKey: config.openAiApiKey })

  return {
    async parseAudio(file) {
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: config.openAiTranscribeModel,
        response_format: 'text'
      })

      const transcript = transcription.trim()

      if (!transcript) {
        return {
          transcript: '',
          items: [],
          totals: createVoiceTotals(),
          warnings: ['No speech was detected.']
        }
      }

      const response = await openai.responses.parse({
        model: config.openAiParseModel,
        input: [
          {
            role: 'system',
            content:
              'Extract nutrition tracking entries from the transcript. For direct metric statements, only populate the metric explicitly named. Never infer calories from protein, sugar, or caffeine statements. Only include calories when calories were explicitly spoken or when a food item is mentioned and you are estimating its nutrition. Food items may estimate calories, protein, sugar, and caffeine from general nutrition knowledge. Mixed utterances should preserve both explicit metrics and food-derived estimates. If something is unsupported or too ambiguous, omit it and add a warning. Amounts must be integers in these units: calorie in kcal, protein and sugar in grams, caffeine in milligrams.'
          },
          {
            role: 'user',
            content: `Transcript: ${transcript}`
          }
        ],
        text: {
          format: zodTextFormat(parsedVoiceResponseSchema, 'voice_parse_result')
        }
      })

      const parsed = response.output_parsed

      if (!parsed) {
        return {
          transcript,
          items: [],
          totals: createVoiceTotals(),
          warnings: ['The transcript could not be parsed into nutrition entries.']
        }
      }

      const items = parsed.items.map(item => ({
        kind: item.kind,
        rawText: item.rawText,
        name: item.name ?? undefined,
        quantityText: item.quantityText ?? null,
        estimated: item.estimated.filter(estimate => estimate.amount > 0)
      }))
      const totals = sumVoiceTotals(items)
      const warnings = [...parsed.warnings]

      if (items.length === 0 && warnings.length === 0) {
        warnings.push('No nutrition entries were detected in the transcript.')
      }

      return {
        transcript,
        items,
        totals,
        warnings
      }
    }
  }
}

export function createVoiceTotals(): VoiceTotals {
  return {
    calorie: 0,
    protein: 0,
    sugar: 0,
    caffeine: 0
  }
}

function sumVoiceTotals(items: VoiceParseItem[]): VoiceTotals {
  return items.reduce<VoiceTotals>((totals, item) => {
    for (const estimate of item.estimated) {
      totals[estimate.metric] += estimate.amount
    }

    return totals
  }, createVoiceTotals())
}
