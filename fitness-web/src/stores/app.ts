import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Mode, TrackMode } from '@/types'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const trackMode = ref<TrackMode>('calorie')
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
  }

  function setTrackMode(newTrackMode: TrackMode) {
    trackMode.value = newTrackMode
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
    isDrawerOpen,
    setMode,
    setTrackMode,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
