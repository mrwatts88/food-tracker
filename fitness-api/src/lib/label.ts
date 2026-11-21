import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

import type { AppConfig } from '../config'

export type LabelMetric = 'calorie' | 'protein' | 'sugar' | 'carbs' | 'sodium' | 'fiber'

export type LabelParseResult = {
  productName: string | null
  servingSizeText: string | null
  // Grams per serving when the label states the serving as a mass; null when it
  // only gives a volume or a count, in which case the client asks for servings.
  servingGrams: number | null
  perServing: Record<LabelMetric, number | null>
  warnings: string[]
}

export interface LabelParser {
  parseImage(file: File): Promise<LabelParseResult>
}

type LabelParserDependencies = {
  anthropic?: Pick<Anthropic, 'beta'>
}

export const supportedLabelImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type SupportedLabelImageType = (typeof supportedLabelImageTypes)[number]

const massUnitSchema = z.enum(['g', 'mg', 'kg', 'oz', 'lb'])
type MassUnit = z.infer<typeof massUnitSchema>

const gramsPerUnit: Record<MassUnit, number> = {
  g: 1,
  mg: 0.001,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237
}

const nutrientSchema = z.number().nonnegative().nullable()

const parsedLabelSchema = z.object({
  isNutritionLabel: z.boolean(),
  productName: z.string().nullable(),
  servingSizeText: z.string().nullable(),
  servingMass: z
    .object({
      amount: z.number().positive(),
      unit: massUnitSchema
    })
    .nullable(),
  perServing: z.object({
    calorie: nutrientSchema,
    protein: nutrientSchema,
    sugar: nutrientSchema,
    carbs: nutrientSchema,
    sodium: nutrientSchema,
    fiber: nutrientSchema
  }),
  warnings: z.array(z.string())
})

const SYSTEM_PROMPT = `You read photos of nutrition facts labels and transcribe the per-serving values exactly as printed. Never estimate or use outside nutrition knowledge: if a value is not printed, or you cannot read it confidently, return null for it. Add a short warning only for calories, carbs, sodium, protein, sugar, or fiber that you could not read; a missing product name is normal and needs no warning.

Fields:
- servingSizeText: the serving size line as printed, e.g. "2/3 cup (55g)".
- servingMass: the serving's weight if the label states one in g, mg, kg, oz, or lb (often in parentheses), as the number and unit printed. Null if the serving is given only as a volume (mL, cups, fl oz) or a count with no weight. Fluid ounces (fl oz) are volume, not weight.
- calorie: kcal per serving.
- protein, carbs, sugar: grams per serving. carbs is Total Carbohydrate. sugar is Total Sugars, not Added Sugars.
- sodium: milligrams per serving; convert if printed in grams.
- fiber: grams of Dietary Fiber per serving. Use the Dietary Fiber line, not Soluble or Insoluble Fiber sub-lines.
- Treat "<1g" or "less than 1g" as 0. Keep decimals as printed.
- If the label has multiple columns (per serving and per container, or prepared and unprepared), use the per-serving, as-packaged column and add a warning saying so.
- If the image is not a nutrition facts label, set isNutritionLabel to false and leave everything else null.
- productName: the product name only if visible in the photo, else null.`

export function createLabelParser(
  config: AppConfig,
  dependencies: LabelParserDependencies = {}
): LabelParser | null {
  if (!config.anthropicApiKey && !dependencies.anthropic) {
    return null
  }

  const anthropic = dependencies.anthropic ?? new Anthropic({ apiKey: config.anthropicApiKey })

  return {
    async parseImage(file) {
      const mediaType = file.type as SupportedLabelImageType
      const data = Buffer.from(await file.arrayBuffer()).toString('base64')

      const response = await anthropic.beta.messages.parse({
        model: config.anthropicLabelModel,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'low',
          format: betaZodOutputFormat(parsedLabelSchema)
        },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: 'Transcribe this nutrition label.' }
            ]
          }
        ]
      })

      if (response.stop_reason === 'refusal') {
        return emptyResult(['The label could not be read. Try another photo.'])
      }

      const parsed = response.parsed_output

      if (!parsed) {
        return emptyResult(['The label could not be read. Try another photo.'])
      }

      return toLabelParseResult(parsed)
    }
  }
}

export function toLabelParseResult(parsed: z.infer<typeof parsedLabelSchema>): LabelParseResult {
  if (!parsed.isNutritionLabel) {
    return emptyResult(['That does not look like a nutrition facts label.'])
  }

  const warnings = [...parsed.warnings]
  const servingGrams =
    parsed.servingMass === null
      ? null
      : roundTo(parsed.servingMass.amount * gramsPerUnit[parsed.servingMass.unit], 1)

  if (Object.values(parsed.perServing).every(value => value === null)) {
    warnings.push('No nutrition values could be read from the label.')
  }

  return {
    productName: parsed.productName?.trim() || null,
    servingSizeText: parsed.servingSizeText?.trim() || null,
    servingGrams: servingGrams !== null && servingGrams > 0 ? servingGrams : null,
    perServing: parsed.perServing,
    warnings
  }
}

function emptyResult(warnings: string[]): LabelParseResult {
  return {
    productName: null,
    servingSizeText: null,
    servingGrams: null,
    perServing: {
      calorie: null,
      protein: null,
      sugar: null,
      carbs: null,
      sodium: null,
      fiber: null
    },
    warnings
  }
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
