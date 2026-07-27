#!/usr/bin/env node
// fit — log fitness entries from any terminal.
//
//   fit 30                    → 30 calories
//   fit protein 40            → 40g protein
//   fit ate a bagel and a coke→ LLM-estimated, logged across metrics
//   fit -n <anything>         → dry run, show the estimate without logging
//
// Estimation runs through local headless Claude Code by default, falling back to the
// API's OpenAI key. Force one with FIT_ESTIMATOR=claude|api.
//
// Defaults to production. Override with FIT_API_URL, or ~/.config/fit/config:
//   echo 'FIT_API_URL=http://localhost:3000/api' > ~/.config/fit/config

import { spawn } from 'node:child_process'
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

const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'warnings'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', ...METRICS],
        properties: {
          name: { type: 'string' },
          ...Object.fromEntries(METRICS.map(metric => [metric, { type: 'integer' }]))
        }
      }
    },
    warnings: { type: 'array', items: { type: 'string' } }
  }
}

const ESTIMATE_RULES =
  'Extract nutrition tracking entries from the text below. Only populate a metric that is explicitly named; never infer calories from a protein, sugar, or caffeine statement. For food and drink items, estimate all four metrics from general nutrition knowledge. Units: calorie in kcal, protein and sugar in grams, caffeine in milligrams. Use 0 for anything you are not estimating. If something is too ambiguous to log, omit it and add a warning. Answer immediately from nutrition knowledge; do not deliberate. Warn only when genuinely ambiguous, and keep each warning under 12 words.'

// Local Claude Code, headless. Needs no OpenAI key — the estimating happens on this machine.
function estimateWithClaude(text) {
  return new Promise(resolve => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--model', 'haiku',
        '--output-format', 'json',
        '--json-schema', JSON.stringify(ESTIMATE_SCHEMA),
        '--strict-mcp-config',
        '--setting-sources', ''
      ],
      // Thinking is pure latency here — the estimate is recall, not reasoning.
      { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, MAX_THINKING_TOKENS: '0' } }
    )

    let stdout = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.on('error', () => resolve(null))
    child.on('close', () => {
      try {
        const envelope = JSON.parse(stdout)

        if (envelope.is_error) {
          return resolve(null)
        }

        const parsed = JSON.parse(envelope.result)

        resolve({
          items: parsed.items.map(item => ({
            label: item.name,
            totals: Object.fromEntries(METRICS.map(metric => [metric, item[metric] ?? 0]))
          })),
          warnings: parsed.warnings ?? []
        })
      } catch {
        resolve(null)
      }
    })

    child.stdin.end(`${ESTIMATE_RULES}\n\nText: ${text}`)
  })
}

// Server-side fallback: same extraction, but via the deployment's OpenAI key.
async function estimateWithApi(text) {
  const parsed = await request('/text/parse', { text })

  return {
    items: parsed.items.map(item => ({
      label: item.name ?? item.rawText,
      totals: item.estimated.reduce((acc, e) => ({ ...acc, [e.metric]: e.amount }), { ...emptyTotals })
    })),
    warnings: parsed.warnings
  }
}

async function estimate(text) {
  const backend = process.env.FIT_ESTIMATOR ?? 'auto'
  const result = backend === 'api' ? null : await estimateWithClaude(text)

  if (result) {
    return { ...result, totals: sumTotals(result.items) }
  }

  if (backend === 'claude') {
    fail('claude estimation failed (is the `claude` CLI installed?)')
  }

  const fallback = await estimateWithApi(text)
  return { ...fallback, totals: sumTotals(fallback.items) }
}

function sumTotals(items) {
  return items.reduce(
    (acc, item) => Object.fromEntries(METRICS.map(metric => [metric, acc[metric] + item.totals[metric]])),
    { ...emptyTotals }
  )
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

const parsed = await estimate(words.join(' '))

for (const item of parsed.items) {
  console.log(`  ${item.label}: ${describe(item.totals) || 'nothing'}`)
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
