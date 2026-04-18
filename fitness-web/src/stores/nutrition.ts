import { computed, reactive } from 'vue'
import { defineStore } from 'pinia'

import { nutritionApi } from '@/services/api'
import { useAppStore } from '@/stores/app'
import type { NutritionEntry, NutritionMetric } from '@/types'
import { nutritionMetrics } from '@/lib/nutrition'

type MetricEntryMap = Record<NutritionMetric, NutritionEntry[]>
type MetricFlagMap = Record<NutritionMetric, boolean>

function createMetricEntryMap(): MetricEntryMap {
  return {
    protein: [],
    sugar: [],
    caffeine: []
  }
}

function createMetricFlagMap(): MetricFlagMap {
  return {
    protein: false,
    sugar: false,
    caffeine: false
  }
}

export const useNutritionStore = defineStore('nutrition', () => {
  const appStore = useAppStore()
  const entriesByMetric = reactive<MetricEntryMap>(createMetricEntryMap())
  const loadingByMetric = reactive<MetricFlagMap>(createMetricFlagMap())
  const submittingByMetric = reactive<MetricFlagMap>(createMetricFlagMap())

  const totalsByMetric = computed<Record<NutritionMetric, number>>(() => ({
    protein: entriesByMetric.protein.reduce((sum, entry) => sum + entry.amount, 0),
    sugar: entriesByMetric.sugar.reduce((sum, entry) => sum + entry.amount, 0),
    caffeine: entriesByMetric.caffeine.reduce((sum, entry) => sum + entry.amount, 0)
  }))

  const currentMetric = computed(() => appStore.nutritionMetric)
  const currentEntries = computed(() => entriesByMetric[currentMetric.value])
  const currentTotal = computed(() => totalsByMetric.value[currentMetric.value])
  const currentLoading = computed(() => loadingByMetric[currentMetric.value])
  const currentSubmitting = computed(() => submittingByMetric[currentMetric.value])

  async function fetchEntries(metric: NutritionMetric) {
    try {
      loadingByMetric[metric] = true
      const response = await nutritionApi.getEntries(metric)
      entriesByMetric[metric] = response.data
    } catch (error) {
      console.error(`Failed to fetch ${metric} entries:`, error)
    } finally {
      loadingByMetric[metric] = false
    }
  }

  async function refreshMetric(metric: NutritionMetric, options: { setLoading?: boolean } = {}) {
    const { setLoading = true } = options

    try {
      if (setLoading) {
        loadingByMetric[metric] = true
      }

      const response = await nutritionApi.getEntries(metric)
      entriesByMetric[metric] = response.data
    } catch (error) {
      console.error(`Failed to refresh ${metric} entries:`, error)
    } finally {
      if (setLoading) {
        loadingByMetric[metric] = false
      }
    }
  }

  async function refreshData(options: { setLoading?: boolean } = {}) {
    const { setLoading = true } = options

    if (setLoading) {
      for (const metric of nutritionMetrics) {
        loadingByMetric[metric] = true
      }
    }

    const results = await Promise.allSettled(
      nutritionMetrics.map(async metric => ({
        metric,
        response: await nutritionApi.getEntries(metric)
      }))
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        entriesByMetric[result.value.metric] = result.value.response.data
      } else {
        console.error('Failed to refresh nutrition entries:', result.reason)
      }
    }

    if (setLoading) {
      for (const metric of nutritionMetrics) {
        loadingByMetric[metric] = false
      }
    }
  }

  async function addEntry(amount: number, metric = currentMetric.value) {
    try {
      submittingByMetric[metric] = true
      await nutritionApi.addEntry(metric, amount)
      await refreshMetric(metric, { setLoading: false })
    } catch (error) {
      console.error(`Failed to add ${metric} entry:`, error)
    } finally {
      submittingByMetric[metric] = false
    }
  }

  async function deleteEntry(id: number, metric = currentMetric.value) {
    try {
      loadingByMetric[metric] = true
      await nutritionApi.deleteEntry(metric, id)
      await refreshMetric(metric, { setLoading: false })
    } catch (error) {
      console.error(`Failed to delete ${metric} entry:`, error)
    } finally {
      loadingByMetric[metric] = false
    }
  }

  return {
    entriesByMetric,
    loadingByMetric,
    submittingByMetric,
    totalsByMetric,
    currentMetric,
    currentEntries,
    currentTotal,
    currentLoading,
    currentSubmitting,
    fetchEntries,
    refreshMetric,
    refreshData,
    addEntry,
    deleteEntry
  }
})
