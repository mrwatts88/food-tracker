import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { EntryMetric, Mode, TrackDashboardMode } from '@/types'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const activeMetric = ref<EntryMetric>('calorie')
  const trackDashboardMode = ref<TrackDashboardMode>('overview')
  const drawerMetric = ref<EntryMetric | null>(null)
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
  }

  function setActiveMetric(newActiveMetric: EntryMetric) {
    activeMetric.value = newActiveMetric
  }

  function setTrackDashboardMode(newTrackDashboardMode: TrackDashboardMode) {
    trackDashboardMode.value = newTrackDashboardMode
  }

  function toggleTrackDashboardMode() {
    trackDashboardMode.value =
      trackDashboardMode.value === 'overview' ? 'nutrition' : 'overview'
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
    trackDashboardMode,
    drawerMetric,
    isDrawerOpen,
    setMode,
    setActiveMetric,
    setTrackDashboardMode,
    toggleTrackDashboardMode,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
