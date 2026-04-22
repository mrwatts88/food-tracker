import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { EntryMetric, Mode, TrackMetric } from '@/types'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const activeMetric = ref<EntryMetric>('calorie')
  const lastTrackMetric = ref<TrackMetric>('calorie')
  const drawerMetric = ref<EntryMetric | null>(null)
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
  }

  function setActiveMetric(newActiveMetric: EntryMetric) {
    activeMetric.value = newActiveMetric

    if (newActiveMetric !== 'weight') {
      lastTrackMetric.value = newActiveMetric
    }
  }

  function activateTrackMetric() {
    activeMetric.value = lastTrackMetric.value
  }

  function toggleDrawer() {
    isDrawerOpen.value = !isDrawerOpen.value

    if (isDrawerOpen.value) {
      drawerMetric.value = activeMetric.value
      return
    }

    drawerMetric.value = null
  }

  function closeDrawer() {
    isDrawerOpen.value = false
    drawerMetric.value = null
  }

  function openDrawer(metric: EntryMetric = activeMetric.value) {
    drawerMetric.value = metric
    isDrawerOpen.value = true
  }

  return {
    mode,
    activeMetric,
    lastTrackMetric,
    drawerMetric,
    isDrawerOpen,
    setMode,
    setActiveMetric,
    activateTrackMetric,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
