import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { EntryMetric, Mode } from '@/types'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const activeMetric = ref<EntryMetric>('calorie')
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
  }

  function setActiveMetric(newActiveMetric: EntryMetric) {
    activeMetric.value = newActiveMetric
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
    activeMetric,
    isDrawerOpen,
    setMode,
    setActiveMetric,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
