import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Mode, NutritionMetric, TrackMode } from '@/types'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const trackMode = ref<TrackMode>('calorie')
  const nutritionMetric = ref<NutritionMetric>('protein')
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
  }

  function setTrackMode(newTrackMode: TrackMode) {
    if (newTrackMode === 'nutrition' && trackMode.value !== 'nutrition') {
      nutritionMetric.value = 'protein'
    }

    trackMode.value = newTrackMode
  }

  function setNutritionMetric(newNutritionMetric: NutritionMetric) {
    nutritionMetric.value = newNutritionMetric
  }

  function toggleDrawer() {
    isDrawerOpen.value = !isDrawerOpen.value
  }

  function closeDrawer() {
    isDrawerOpen.value = false
  }

  function openDrawer() {
    isDrawerOpen.value = true
  }

  return {
    mode,
    trackMode,
    nutritionMetric,
    isDrawerOpen,
    setMode,
    setTrackMode,
    setNutritionMetric,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
