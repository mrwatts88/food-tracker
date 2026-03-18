import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { WeightEntry } from '@/types'
import { useCalorieStore } from '@/stores/calorie'
import { weightApi } from '@/services/api'

export const useWeightStore = defineStore('weight', () => {
  const entries = ref<WeightEntry[]>([])
  const loading = ref(false)
  const submittingEntry = ref(false)

  const todayWeight = computed(() => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return entries.value.find((entry) => entry.createdAt === today) || null
  })

  async function fetchEntries() {
    try {
      loading.value = true
      const response = await weightApi.getEntries()
      entries.value = response.data
    } catch (error) {
      console.error('Failed to fetch weight entries:', error)
    } finally {
      loading.value = false
    }
  }

  async function refreshDataAfterMutation() {
    const calorieStore = useCalorieStore()
    const [weightResult, tdeeResult] = await Promise.allSettled([
      weightApi.getEntries(),
      calorieStore.fetchTDEE()
    ])

    if (weightResult.status === 'rejected') {
      throw weightResult.reason
    }

    entries.value = weightResult.value.data

    if (tdeeResult.status === 'rejected') {
      console.error('Failed to refresh TDEE after weight mutation:', tdeeResult.reason)
    }
  }

  async function addEntry(amount: number) {
    try {
      submittingEntry.value = true
      await weightApi.addEntry(amount)
      await refreshDataAfterMutation()
    } catch (error) {
      console.error('Failed to add weight entry:', error)
    } finally {
      submittingEntry.value = false
    }
  }

  async function deleteEntry(date: string) {
    try {
      loading.value = true
      await weightApi.deleteEntry(date)
      await refreshDataAfterMutation()
    } catch (error) {
      console.error('Failed to delete weight entry:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    entries,
    loading,
    submittingEntry,
    todayWeight,
    fetchEntries,
    addEntry,
    deleteEntry
  }
})
