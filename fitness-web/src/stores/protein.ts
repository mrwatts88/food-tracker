import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { ProteinEntry } from '@/types'
import { proteinApi } from '@/services/api'

export const useProteinStore = defineStore('protein', () => {
  const entries = ref<ProteinEntry[]>([])
  const loading = ref(false)
  const submittingEntry = ref(false)

  const totalProtein = computed(() => {
    return entries.value.reduce((sum, entry) => sum + entry.amount, 0)
  })

  async function fetchEntries() {
    try {
      loading.value = true
      const response = await proteinApi.getEntries()
      entries.value = response.data
    } catch (error) {
      console.error('Failed to fetch protein entries:', error)
    } finally {
      loading.value = false
    }
  }

  async function refreshData(options: { setLoading?: boolean } = {}) {
    const { setLoading = true } = options

    try {
      if (setLoading) {
        loading.value = true
      }

      const response = await proteinApi.getEntries()
      entries.value = response.data
    } catch (error) {
      console.error('Failed to refresh protein entries:', error)
    } finally {
      if (setLoading) {
        loading.value = false
      }
    }
  }

  async function addEntry(amount: number) {
    try {
      submittingEntry.value = true
      await proteinApi.addEntry(amount)
      await refreshData({ setLoading: false })
    } catch (error) {
      console.error('Failed to add protein entry:', error)
    } finally {
      submittingEntry.value = false
    }
  }

  async function deleteEntry(id: number) {
    try {
      loading.value = true
      await proteinApi.deleteEntry(id)
      await refreshData({ setLoading: false })
    } catch (error) {
      console.error('Failed to delete protein entry:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    entries,
    loading,
    submittingEntry,
    totalProtein,
    fetchEntries,
    refreshData,
    addEntry,
    deleteEntry
  }
})
