import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { CalorieEntry, TDEEResponse } from '@/types'
import { calorieApi, tdeeApi } from '@/services/api'

const CALORIE_DEFICIT = 250

export const useCalorieStore = defineStore('calorie', () => {
  const entries = ref<CalorieEntry[]>([])
  const tdee = ref<number>(0)
  const lossIn2Weeks = ref<number>(0)
  const eatenPerDay = ref<number | null>(null)
  const loading = ref(false)
  const submittingEntry = ref(false)

  const totalCalories = computed(() => {
    return entries.value.reduce((sum, entry) => sum + entry.amount, 0)
  })

  const calorieGoal = computed(() => {
    return tdee.value - CALORIE_DEFICIT
  })

  const remainingCalories = computed(() => {
    return calorieGoal.value - totalCalories.value
  })

  function applyTdeeData(data: TDEEResponse) {
    tdee.value = typeof data.amount === 'number' && Number.isFinite(data.amount) ? data.amount : 0
    lossIn2Weeks.value =
      typeof data.lossIn2Weeks === 'number' && Number.isFinite(data.lossIn2Weeks)
        ? data.lossIn2Weeks
        : 0
    eatenPerDay.value =
      typeof data.eatenPerDay === 'number' && Number.isFinite(data.eatenPerDay)
        ? data.eatenPerDay
        : null
  }

  async function fetchEntries() {
    try {
      loading.value = true
      const response = await calorieApi.getEntries()
      entries.value = response.data
    } catch (error) {
      console.error('Failed to fetch calorie entries:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchTDEE() {
    try {
      const response = await tdeeApi.getTDEE()
      applyTdeeData(response.data)
    } catch (error) {
      console.error('Failed to fetch TDEE:', error)
    }
  }

  async function refreshData(options: { setLoading?: boolean } = {}) {
    const { setLoading = true } = options

    try {
      if (setLoading) {
        loading.value = true
      }

      const [entriesResult, tdeeResult] = await Promise.allSettled([
        calorieApi.getEntries(),
        tdeeApi.getTDEE()
      ])

      if (entriesResult.status === 'fulfilled') {
        entries.value = entriesResult.value.data
      } else {
        console.error('Failed to refresh calorie entries:', entriesResult.reason)
      }

      if (tdeeResult.status === 'fulfilled') {
        applyTdeeData(tdeeResult.value.data)
      } else {
        console.error('Failed to refresh TDEE data:', tdeeResult.reason)
      }
    } catch (error) {
      console.error('Failed to refresh calorie data:', error)
    } finally {
      if (setLoading) {
        loading.value = false
      }
    }
  }

  async function addEntry(amount: number) {
    try {
      submittingEntry.value = true
      await calorieApi.addEntry(amount)
      await refreshData({ setLoading: false })
    } catch (error) {
      console.error('Failed to add calorie entry:', error)
    } finally {
      submittingEntry.value = false
    }
  }

  async function deleteEntry(id: number) {
    try {
      loading.value = true
      await calorieApi.deleteEntry(id)
      await refreshData({ setLoading: false })
    } catch (error) {
      console.error('Failed to delete calorie entry:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    entries,
    tdee,
    lossIn2Weeks,
    eatenPerDay,
    loading,
    submittingEntry,
    totalCalories,
    calorieGoal,
    remainingCalories,
    fetchEntries,
    fetchTDEE,
    refreshData,
    addEntry,
    deleteEntry
  }
})
