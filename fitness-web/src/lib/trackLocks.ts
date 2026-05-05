import { computed, ref, watch } from 'vue'

import { nutritionMetrics } from '@/lib/nutrition'
import type { NutritionMetric, TrackMetric } from '@/types'

const nowTick = ref(Date.now())
const lockedTrackMetrics = ref<Set<TrackMetric>>(new Set())
const trackLockStorageKey = computed(
  () => `nutrition-locks:${formatLocalDate(new Date(nowTick.value))}`,
)

let initialized = false

export function useTrackLocks() {
  if (!initialized) {
    initialized = true
    loadTrackLocks()

    watch(trackLockStorageKey, () => {
      loadTrackLocks()
    })

    if (typeof window !== 'undefined') {
      window.setInterval(() => {
        nowTick.value = Date.now()
      }, 1000)
    }
  }

  function isTrackLocked(metric: TrackMetric) {
    return lockedTrackMetrics.value.has(metric)
  }

  function toggleTrackLock(metric: TrackMetric) {
    const nextLockedMetrics = new Set(lockedTrackMetrics.value)

    if (nextLockedMetrics.has(metric)) {
      nextLockedMetrics.delete(metric)
    } else {
      nextLockedMetrics.add(metric)
    }

    lockedTrackMetrics.value = nextLockedMetrics
    saveTrackLocks()
  }

  function lockTrackMetric(metric: TrackMetric) {
    if (lockedTrackMetrics.value.has(metric)) {
      return
    }

    const nextLockedMetrics = new Set(lockedTrackMetrics.value)
    nextLockedMetrics.add(metric)
    lockedTrackMetrics.value = nextLockedMetrics
    saveTrackLocks()
  }

  return {
    lockedTrackMetrics,
    isTrackLocked,
    toggleTrackLock,
    lockTrackMetric,
  }
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function loadTrackLocks() {
  if (typeof window === 'undefined') {
    lockedTrackMetrics.value = new Set()
    return
  }

  const storedMetrics = window.localStorage.getItem(trackLockStorageKey.value)

  if (!storedMetrics) {
    lockedTrackMetrics.value = new Set()
    return
  }

  try {
    const parsedMetrics = JSON.parse(storedMetrics)

    if (!Array.isArray(parsedMetrics)) {
      lockedTrackMetrics.value = new Set()
      return
    }

    lockedTrackMetrics.value = new Set(
      parsedMetrics.filter(
        (metric): metric is TrackMetric =>
          metric === 'calorie' || nutritionMetrics.includes(metric as NutritionMetric),
      ),
    )
  } catch {
    lockedTrackMetrics.value = new Set()
  }
}

function saveTrackLocks() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    trackLockStorageKey.value,
    JSON.stringify([...lockedTrackMetrics.value]),
  )
}
