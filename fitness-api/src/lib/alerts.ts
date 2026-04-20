import nodemailer from 'nodemailer'

import type { AppConfig } from '../config'
import type { UnlockStatus } from './calorie-unlock'
import { formatTimestamp } from './time'

export type AlertEmail = {
  subject: string
  text: string
}

export type AlertNotifier = {
  send(message: AlertEmail): Promise<void>
}

type NutritionAlertOptions = {
  label: 'Sugar' | 'Caffeine'
  unit: 'g' | 'mg'
  entryAmount: number
  dailyTotal: number
  limit: number
  occurredAt: Date
  timezone: string
}

type CalorieAlertOptions = {
  entryAmount: number
  status: UnlockStatus
  borrowCrossed: boolean
  dailyLimitCrossed: boolean
  occurredAt: Date
  timezone: string
}

export function createAlertNotifier(
  config: Pick<AppConfig, 'gmailAlertAddress' | 'gmailAlertAppPassword'>
): AlertNotifier | null {
  if (!config.gmailAlertAddress || !config.gmailAlertAppPassword) {
    return null
  }

  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.gmailAlertAddress,
      pass: config.gmailAlertAppPassword
    }
  })

  return {
    async send(message) {
      await transport.sendMail({
        from: config.gmailAlertAddress,
        to: config.gmailAlertAddress,
        subject: message.subject,
        text: message.text
      })
    }
  }
}

export function buildNutritionLimitAlertEmail(options: NutritionAlertOptions): AlertEmail {
  const { label, unit, entryAmount, dailyTotal, limit, occurredAt, timezone } = options

  return {
    subject: `${label} limit exceeded`,
    text: [
      `Time: ${formatTimestamp(occurredAt, timezone)}`,
      `Entry: ${entryAmount} ${unit}`,
      `Daily total: ${dailyTotal} ${unit}`,
      `Limit: ${limit} ${unit}`
    ].join('\n')
  }
}

export function buildCalorieAlertEmail(options: CalorieAlertOptions): AlertEmail {
  const { entryAmount, status, borrowCrossed, dailyLimitCrossed, occurredAt, timezone } = options
  const body = [
    `Time: ${formatTimestamp(occurredAt, timezone)}`,
    `Entry: ${entryAmount} calories`,
    `Daily total: ${status.consumedCalories} calories`,
    `Daily target: ${status.dailyTargetCalories} calories`
  ]

  if (borrowCrossed) {
    body.push(
      `Unlocked so far: ${status.unlockedCalories} calories`,
      `Overdrawn: ${status.overdrawCalories} calories`,
      `Next scheduled unlock: ${status.nextScheduledUnlockCalories} calories`,
      `Next effective unlock: ${status.nextEffectiveUnlockCalories} calories`
    )
  }

  if (dailyLimitCrossed) {
    body.push(`Over daily target by: ${status.consumedCalories - status.dailyTargetCalories} calories`)
  }

  return {
    subject: 'Calorie alert',
    text: body.join('\n')
  }
}
