import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { QuickAddFood } from '@/types'
import { useCalorieStore } from '@/stores/calorie'
import { quickAddApi } from '@/services/api'

export const useQuickAddStore = defineStore('quickadd', () => {
  const calorieStore = useCalorieStore()
  const foods = ref<QuickAddFood[]>([])
  const pendingTaps = ref<Map<number, number>>(new Map())
  const loading = ref(false)
  const submitting = ref(false)

  const pendingCalories = computed(() => {
    let total = 0
    for (const [foodId, count] of pendingTaps.value) {
      const food = foods.value.find(f => f.id === foodId)
      if (food) {
        total += food.calories * count
      }
    }
    return total
  })

  const hasPendingTaps = computed(() => pendingTaps.value.size > 0)

  async function fetchFoods() {
    try {
      loading.value = true
      const response = await quickAddApi.getFoods()
      foods.value = response.data
    } catch (error) {
      console.error('Failed to fetch quick add foods:', error)
    } finally {
      loading.value = false
    }
  }

  async function createFood(food: Omit<QuickAddFood, 'id' | 'createdAt'>) {
    try {
      loading.value = true
      await quickAddApi.createFood(food)
      await fetchFoods()
    } catch (error) {
      console.error('Failed to create quick add food:', error)
    } finally {
      loading.value = false
    }
  }

  async function updateFood(id: number, food: Omit<QuickAddFood, 'id' | 'createdAt'>) {
    try {
      loading.value = true
      await quickAddApi.updateFood(id, food)
      await fetchFoods()
    } catch (error) {
      console.error('Failed to update quick add food:', error)
    } finally {
      loading.value = false
    }
  }

  async function deleteFood(id: number) {
    try {
      loading.value = true
      await quickAddApi.deleteFood(id)
      pendingTaps.value.delete(id)
      await fetchFoods()
    } catch (error) {
      console.error('Failed to delete quick add food:', error)
    } finally {
      loading.value = false
    }
  }

  function incrementTap(foodId: number) {
    const current = pendingTaps.value.get(foodId) || 0
    pendingTaps.value.set(foodId, current + 1)
  }

  function decrementTap(foodId: number) {
    const current = pendingTaps.value.get(foodId) || 0
    if (current > 1) {
      pendingTaps.value.set(foodId, current - 1)
    } else {
      pendingTaps.value.delete(foodId)
    }
  }

  function clearTaps() {
    pendingTaps.value = new Map()
  }

  async function submitTaps() {
    if (pendingTaps.value.size === 0) return

    let shouldRefreshCalorieData = false

    try {
      submitting.value = true
      for (const [foodId, count] of pendingTaps.value) {
        shouldRefreshCalorieData = true
        await quickAddApi.consumeFood(foodId, count)
      }
      clearTaps()
    } catch (error) {
      console.error('Failed to submit quick add entries:', error)
    } finally {
      if (shouldRefreshCalorieData) {
        await calorieStore.refreshData()
      }
      submitting.value = false
    }
  }

  return {
    foods,
    pendingTaps,
    loading,
    submitting,
    pendingCalories,
    hasPendingTaps,
    fetchFoods,
    createFood,
    updateFood,
    deleteFood,
    incrementTap,
    decrementTap,
    clearTaps,
    submitTaps
  }
})
