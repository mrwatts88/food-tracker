<script setup lang="ts">
import { onMounted } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useEntryDividerStore } from '@/stores/entryDivider'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import ModeToggle from '@/components/ModeToggle.vue'
import CalorieMode from '@/components/CalorieMode.vue'
import EntryDrawer from '@/components/EntryDrawer.vue'
import StatsMode from '@/components/StatsMode.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const entryDividerStore = useEntryDividerStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()

onMounted(async () => {
  await Promise.all([
    calorieStore.refreshData(),
    entryDividerStore.fetchEntries(),
    nutritionStore.refreshData(),
    weightStore.fetchEntries()
  ])

  if (!weightStore.todayWeight) {
    appStore.setMode('weight')
    appStore.setActiveMetric('weight')
  }
})
</script>

<template>
  <ModeToggle />
  <CalorieMode v-if="appStore.mode === 'calorie' || appStore.mode === 'weight'" />
  <StatsMode v-if="appStore.mode === 'stats'" />
  <EntryDrawer />
</template>
