import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { EntryDivider } from '@/types'
import { entryDividerApi } from '@/services/api'

export const useEntryDividerStore = defineStore('entryDivider', () => {
  const entries = ref<EntryDivider[]>([])
  const loading = ref(false)
  const submitting = ref(false)

  async function fetchEntries(options: { setLoading?: boolean } = {}) {
    const { setLoading = true } = options

    try {
      if (setLoading) {
        loading.value = true
      }

      const response = await entryDividerApi.getEntries()
      entries.value = response.data
    } catch (error) {
      console.error('Failed to fetch entry dividers:', error)
    } finally {
      if (setLoading) {
        loading.value = false
      }
    }
  }

  async function addDivider() {
    try {
      submitting.value = true
      await entryDividerApi.addDivider()
      await fetchEntries({ setLoading: false })
    } catch (error) {
      console.error('Failed to add entry divider:', error)
    } finally {
      submitting.value = false
    }
  }

  return {
    entries,
    loading,
    submitting,
    fetchEntries,
    addDivider
  }
})
