import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { CalorieEntry, TDEEResponse, UnlockStatus } from '@/types'
import { calorieApi, tdeeApi } from '@/services/api'

const CALORIE_DEFICIT = 250

export const useCalorieStore = defineStore('calorie', () => {
  const entries = ref<CalorieEntry[]>([])
  const tdee = ref<number>(0)
  const lossIn2Weeks = ref<number>(0)
  const eatenPerDay = ref<number | null>(null)
  const unlockStatus = ref<UnlockStatus | null>(null)
  const unlockStatusReceivedAt = ref<number>(0)
  const loading = ref(false)
  const submittingEntry = ref(false)

  const totalCalories = computed(() => {
    return entries.value.reduce((sum, entry) => sum + entry.amount, 0)
  })

  const effectiveDailyTarget = computed(() => {
    return unlockStatus.value?.dailyTargetCalories ?? calorieGoal.value
  })

  const calorieGoal = computed(() => {
    return tdee.value - CALORIE_DEFICIT
  })

  const remainingCalories = computed(() => {
    return effectiveDailyTarget.value - totalCalories.value
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

  function applyUnlockStatus(data: UnlockStatus) {
    unlockStatus.value = data
    unlockStatusReceivedAt.value = Date.now()
  }

  async function fetchEntries() {
    try {
      loading.value = true
      const [entriesResponse, unlockStatusResponse] = await Promise.all([
        calorieApi.getEntries(),
        calorieApi.getUnlockStatus()
      ])
      entries.value = entriesResponse.data
      applyUnlockStatus(unlockStatusResponse.data)
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

  async function fetchUnlockStatus(options: { setLoading?: boolean } = {}) {
    const { setLoading = false } = options

    try {
      if (setLoading) {
        loading.value = true
      }

      const response = await calorieApi.getUnlockStatus()
      applyUnlockStatus(response.data)
    } catch (error) {
      console.error('Failed to fetch calorie unlock status:', error)
    } finally {
      if (setLoading) {
        loading.value = false
      }
    }
  }

  async function refreshData(options: { setLoading?: boolean } = {}) {
    const { setLoading = true } = options

    try {
      if (setLoading) {
        loading.value = true
      }

      const [entriesResult, tdeeResult, unlockStatusResult] = await Promise.allSettled([
        calorieApi.getEntries(),
        tdeeApi.getTDEE(),
        calorieApi.getUnlockStatus()
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

      if (unlockStatusResult.status === 'fulfilled') {
        applyUnlockStatus(unlockStatusResult.value.data)
      } else {
        console.error('Failed to refresh calorie unlock status:', unlockStatusResult.reason)
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
    unlockStatus,
    unlockStatusReceivedAt,
    loading,
    submittingEntry,
    totalCalories,
    effectiveDailyTarget,
    calorieGoal,
    remainingCalories,
    fetchEntries,
    fetchTDEE,
    fetchUnlockStatus,
    refreshData,
    addEntry,
    deleteEntry
  }
})
