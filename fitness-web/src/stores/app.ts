import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Mode, TrackMode } from '@/types'

export type InputMode = 'keyboard' | 'quickadd'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const trackMode = ref<TrackMode>('calorie')
  const inputMode = ref<InputMode>('keyboard')
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
  }

  function setTrackMode(newTrackMode: TrackMode) {
    trackMode.value = newTrackMode
  }

  function toggleInputMode() {
    inputMode.value = inputMode.value === 'keyboard' ? 'quickadd' : 'keyboard'
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
    inputMode,
    isDrawerOpen,
    setMode,
    setTrackMode,
    toggleInputMode,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
