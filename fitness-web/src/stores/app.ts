import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Mode } from '@/types'

export type InputMode = 'keyboard' | 'quickadd'

export const useAppStore = defineStore('app', () => {
  const mode = ref<Mode>('calorie')
  const inputMode = ref<InputMode>('keyboard')
  const isDrawerOpen = ref(false)

  function setMode(newMode: Mode) {
    mode.value = newMode
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
    inputMode,
    isDrawerOpen,
    setMode,
    toggleInputMode,
    toggleDrawer,
    closeDrawer,
    openDrawer
  }
})
