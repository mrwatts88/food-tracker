import { DateTime } from 'luxon'

// Two-state Kalman filter over daily weigh-ins and calorie totals.
// Hidden state: true (trend) weight in lb, and TDEE in cal/day.
// Each day: weight[d+1] = weight[d] + (eaten[d] - tdee[d]) / 3500, tdee drifts slowly.
// Each weigh-in is the true weight plus scale/water noise.

export const CALORIES_PER_POUND = 3500

export type DailyAmount = {
  date: string
  amount: number
}

export type WeightTrendOptions = {
  // Day-to-day scale noise (water, food in gut) around the true weight, lb.
  scaleNoiseLb: number
  // How far TDEE may drift per day, cal/day.
  tdeeDriftPerDay: number
  // How far true weight may move per day beyond what the calorie log explains, lb.
  weightDriftPerDay: number
  // Logging error on a day with a calorie total, cal.
  loggedIntakeNoise: number
  // Uncertainty about intake on a day with no usable calorie total, cal.
  unloggedIntakeNoise: number
  // A day below this total is treated as partially logged, cal.
  minLoggedCalories: number
  initialTdeeNoise: number
}

export const defaultWeightTrendOptions: WeightTrendOptions = {
  scaleNoiseLb: 1,
  tdeeDriftPerDay: 15,
  weightDriftPerDay: 0.05,
  loggedIntakeNoise: 250,
  unloggedIntakeNoise: 1000,
  minLoggedCalories: 1000,
  initialTdeeNoise: 500
}

export type WeightTrendPoint = {
  date: string
  weight: number
  weightMargin: number
  tdee: number
  tdeeMargin: number
}

type Vector = [number, number]
type Matrix = [[number, number], [number, number]]

type FilterStep = {
  date: string
  predicted: { x: Vector; p: Matrix }
  filtered: { x: Vector; p: Matrix }
  transition: Matrix
}

// Returns one smoothed point per day from the first weigh-in through `today`,
// or an empty array when there is no weight history.
export function estimateWeightTrend(
  weights: DailyAmount[],
  calories: DailyAmount[],
  today: string,
  options: WeightTrendOptions = defaultWeightTrendOptions
): WeightTrendPoint[] {
  const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const firstWeight = sortedWeights[0]
  if (!firstWeight || firstWeight.date > today) {
    return []
  }

  const weightByDate = new Map(sortedWeights.map(entry => [entry.date, entry.amount]))
  const caloriesByDate = new Map(calories.map(entry => [entry.date, entry.amount]))
  const scaleVariance = options.scaleNoiseLb ** 2

  let x: Vector = [firstWeight.amount, initialTdee(calories, firstWeight.date, options)]
  let p: Matrix = [
    [scaleVariance, 0],
    [0, options.initialTdeeNoise ** 2]
  ]
  const steps: FilterStep[] = []
  const identity: Matrix = [
    [1, 0],
    [0, 1]
  ]

  for (let date = firstWeight.date; date <= today; date = addDays(date, 1)) {
    let transition = identity

    if (steps.length > 0) {
      // Calories eaten yesterday show up on this morning's scale.
      const eaten = caloriesByDate.get(addDays(date, -1))
      const isLogged = eaten !== undefined && eaten >= options.minLoggedCalories
      const intake = isLogged ? eaten : x[1]
      const intakeNoise = isLogged ? options.loggedIntakeNoise : options.unloggedIntakeNoise

      transition = [
        [1, -1 / CALORIES_PER_POUND],
        [0, 1]
      ]
      x = [x[0] + (intake - x[1]) / CALORIES_PER_POUND, x[1]]
      p = addMatrix(multiply(multiply(transition, p), transpose(transition)), [
        [options.weightDriftPerDay ** 2 + (intakeNoise / CALORIES_PER_POUND) ** 2, 0],
        [0, options.tdeeDriftPerDay ** 2]
      ])
    }

    const predicted = { x, p }
    const measured = weightByDate.get(date)

    if (measured !== undefined) {
      const innovation = measured - x[0]
      const innovationVariance = p[0][0] + scaleVariance
      const gain: Vector = [p[0][0] / innovationVariance, p[1][0] / innovationVariance]

      x = [x[0] + gain[0] * innovation, x[1] + gain[1] * innovation]
      p = [
        [(1 - gain[0]) * p[0][0], (1 - gain[0]) * p[0][1]],
        [p[1][0] - gain[1] * p[0][0], p[1][1] - gain[1] * p[0][1]]
      ]
    }

    steps.push({ date, predicted, filtered: { x, p }, transition })
  }

  return smooth(steps).map(({ date, x: state, p: covariance }) => ({
    date,
    weight: state[0],
    weightMargin: Math.sqrt(Math.max(0, covariance[0][0])),
    tdee: state[1],
    tdeeMargin: Math.sqrt(Math.max(0, covariance[1][1]))
  }))
}

// Rauch-Tung-Striebel pass: lets later weigh-ins refine earlier days so the
// chart's trend line is not lagged. The last day is unchanged by smoothing.
function smooth(steps: FilterStep[]) {
  const last = steps[steps.length - 1]
  if (!last) {
    return []
  }

  let later = { date: last.date, ...last.filtered }
  const smoothed = [later]

  for (let index = steps.length - 2; index >= 0; index -= 1) {
    const current = steps[index]
    const next = steps[index + 1]
    if (!current || !next) {
      continue
    }

    const gain = multiply(multiply(current.filtered.p, transpose(next.transition)), invert(next.predicted.p))
    const stateCorrection = subtract(later.x, next.predicted.x)
    const covarianceCorrection = subtractMatrix(later.p, next.predicted.p)

    later = {
      date: current.date,
      x: addVector(current.filtered.x, apply(gain, stateCorrection)),
      p: addMatrix(current.filtered.p, multiply(multiply(gain, covarianceCorrection), transpose(gain)))
    }
    smoothed.push(later)
  }

  return smoothed.reverse()
}

// Starts TDEE at the average logged intake around the first weigh-in; the
// filter corrects it within a few weeks.
function initialTdee(calories: DailyAmount[], startDate: string, options: WeightTrendOptions) {
  const windowEnd = addDays(startDate, 14)
  const logged = calories.filter(
    entry =>
      entry.date >= startDate && entry.date < windowEnd && entry.amount >= options.minLoggedCalories
  )

  if (logged.length === 0) {
    return 2500
  }

  return logged.reduce((sum, entry) => sum + entry.amount, 0) / logged.length
}

function addDays(date: string, days: number) {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate() ?? date
}

function addVector(a: Vector, b: Vector): Vector {
  return [a[0] + b[0], a[1] + b[1]]
}

function addMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1]]
  ]
}

function subtract(a: Vector, b: Vector): Vector {
  return [a[0] - b[0], a[1] - b[1]]
}

function subtractMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    [a[0][0] - b[0][0], a[0][1] - b[0][1]],
    [a[1][0] - b[1][0], a[1][1] - b[1][1]]
  ]
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]]
  ]
}

function apply(a: Matrix, v: Vector): Vector {
  return [a[0][0] * v[0] + a[0][1] * v[1], a[1][0] * v[0] + a[1][1] * v[1]]
}

function transpose(a: Matrix): Matrix {
  return [
    [a[0][0], a[1][0]],
    [a[0][1], a[1][1]]
  ]
}

function invert(a: Matrix): Matrix {
  const determinant = a[0][0] * a[1][1] - a[0][1] * a[1][0]
  return [
    [a[1][1] / determinant, -a[0][1] / determinant],
    [-a[1][0] / determinant, a[0][0] / determinant]
  ]
}
