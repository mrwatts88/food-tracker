#!/usr/bin/env node
// fit — log fitness entries from any terminal.
//
//   fit 30                    → 30 calories
//   fit protein 40            → 40g protein
//   fit ate a bagel and a coke→ LLM-estimated, logged across metrics
//   fit -n <anything>         → dry run, show the estimate without logging
//
// Defaults to production. Override with FIT_API_URL, or ~/.config/fit/config:
//   echo 'FIT_API_URL=http://localhost:3000/api' > ~/.config/fit/config

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_API_URL = 'https://food-tracker-weld-six.vercel.app/api'
const METRICS = ['calorie', 'protein', 'sugar', 'caffeine']
const ROUTES = { calorie: 'calories', protein: 'protein', sugar: 'sugar', caffeine: 'caffeine' }
const FORMAT = {
  calorie: amount => `${amount} cal`,
  protein: amount => `${amount}g protein`,
  sugar: amount => `${amount}g sugar`,
  caffeine: amount => `${amount}mg caffeine`
}

function loadApiUrl() {
  if (process.env.FIT_API_URL) {
    return process.env.FIT_API_URL.replace(/\/$/, '')
  }

  const configPath = join(homedir(), '.config', 'fit', 'config')

  try {
    const match = readFileSync(configPath, 'utf8').match(/^\s*FIT_API_URL\s*=\s*(.+?)\s*$/m)

    if (match) {
      return match[1].replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
    }
  } catch {
    // no config file — production default is fine
  }

  return DEFAULT_API_URL
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function request(path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    fail(`POST ${path} failed (${response.status}) ${detail}`)
  }

  return response.json()
}

function describe(totals) {
  return METRICS.filter(metric => totals[metric] > 0)
    .map(metric => FORMAT[metric](totals[metric]))
    .join(', ')
}

async function logTotals(totals) {
  const logged = METRICS.filter(metric => totals[metric] > 0)

  for (const metric of logged) {
    await request(`/${ROUTES[metric]}`, { amount: totals[metric] })
  }

  return logged
}

// Fast path: `fit 30` or `fit protein 40` / `fit 40 protein` — no LLM, no latency.
function parseDirect(words) {
  if (words.length === 1 && /^\d+$/.test(words[0])) {
    return { calorie: Number(words[0]) }
  }

  if (words.length === 2) {
    const [a, b] = words
    const metric = METRICS.find(m => m === a.toLowerCase()) ?? METRICS.find(m => m === b.toLowerCase())
    const amount = /^\d+$/.test(a) ? a : /^\d+$/.test(b) ? b : null

    if (metric && amount) {
      return { [metric]: Number(amount) }
    }
  }

  return null
}

const args = process.argv.slice(2)
const dryRun = args[0] === '-n' || args[0] === '--dry-run'
const words = (dryRun ? args.slice(1) : args).filter(Boolean)

if (words.length === 0) {
  fail('usage: fit [-n] <amount | metric amount | plain english>')
}

const apiUrl = loadApiUrl()
const emptyTotals = { calorie: 0, protein: 0, sugar: 0, caffeine: 0 }
const direct = parseDirect(words)

if (direct) {
  const totals = { ...emptyTotals, ...direct }

  if (dryRun) {
    console.log(`would log ${describe(totals)}`)
    process.exit(0)
  }

  await logTotals(totals)
  console.log(`logged ${describe(totals)}`)
  process.exit(0)
}

const parsed = await request('/text/parse', { text: words.join(' ') })

for (const item of parsed.items) {
  const label = item.name ?? item.rawText
  console.log(`  ${label}: ${describe(item.estimated.reduce((acc, e) => ({ ...acc, [e.metric]: e.amount }), { ...emptyTotals })) || 'nothing'}`)
}

for (const warning of parsed.warnings) {
  console.log(`  ! ${warning}`)
}

const summary = describe(parsed.totals)

if (!summary) {
  fail('nothing to log')
}

if (dryRun) {
  console.log(`would log ${summary}`)
  process.exit(0)
}

await logTotals(parsed.totals)
console.log(`logged ${summary}`)
