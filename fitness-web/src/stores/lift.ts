import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'

import { liftApi } from '@/services/api'
import type { Lift, LiftUpdate } from '@/types'

type LiftSetKey = keyof LiftUpdate

const changedSetsStorageKey = 'fitness:lifts:changed-sets'

function getLocalDateKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getChangedSetId(slug: string, setKey: LiftSetKey) {
  return `${slug}:${setKey}`
}

function readStoredChangedSets() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(changedSetsStorageKey)

    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue) as { date?: string; setIds?: unknown }

    if (parsed.date !== getLocalDateKey() || !Array.isArray(parsed.setIds)) {
      window.localStorage.removeItem(changedSetsStorageKey)
      return []
    }

    return parsed.setIds.filter((setId): setId is string => typeof setId === 'string')
  } catch {
    window.localStorage.removeItem(changedSetsStorageKey)
    return []
  }
}

export const useLiftStore = defineStore('lift', () => {
  const lifts = ref<Lift[]>([])
  const changedSetIds = ref<string[]>(readStoredChangedSets())
  const loading = ref(false)
  const submittingBySlug = reactive<Record<string, boolean>>({})

  const hasLifts = computed(() => lifts.value.length > 0)
  const hasChangedSets = computed(() => changedSetIds.value.length > 0)

  function persistChangedSets() {
    if (typeof window === 'undefined') {
      return
    }

    if (changedSetIds.value.length === 0) {
      window.localStorage.removeItem(changedSetsStorageKey)
      return
    }

    window.localStorage.setItem(
      changedSetsStorageKey,
      JSON.stringify({
        date: getLocalDateKey(),
        setIds: changedSetIds.value
      })
    )
  }

  function markSetChanged(slug: string, setKey: LiftSetKey) {
    const setId = getChangedSetId(slug, setKey)

    if (changedSetIds.value.includes(setId)) {
      return
    }

    changedSetIds.value = [...changedSetIds.value, setId]
    persistChangedSets()
  }

  function isSetChanged(slug: string, setKey: LiftSetKey) {
    return changedSetIds.value.includes(getChangedSetId(slug, setKey))
  }

  function resetWorkoutChanges() {
    changedSetIds.value = []
    persistChangedSets()
  }

  async function fetchLifts() {
    try {
      loading.value = true
      const response = await liftApi.getLifts()
      lifts.value = response.data
    } catch (error) {
      console.error('Failed to fetch lifts:', error)
    } finally {
      loading.value = false
    }
  }

  async function updateLift(slug: string, input: LiftUpdate, changedSetKey?: LiftSetKey) {
    try {
      submittingBySlug[slug] = true
      const response = await liftApi.updateLift(slug, input)
      const index = lifts.value.findIndex(lift => lift.slug === slug)

      if (index >= 0) {
        lifts.value[index] = response.data
      }

      if (changedSetKey) {
        markSetChanged(slug, changedSetKey)
      }
    } catch (error) {
      console.error(`Failed to update lift ${slug}:`, error)
    } finally {
      submittingBySlug[slug] = false
    }
  }

  return {
    lifts,
    changedSetIds,
    loading,
    submittingBySlug,
    hasLifts,
    hasChangedSets,
    fetchLifts,
    updateLift,
    isSetChanged,
    resetWorkoutChanges
  }
})
