<script setup lang="ts">
import { onMounted } from 'vue'

import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useEntryDividerStore } from '@/stores/entryDivider'
import { useLiftStore } from '@/stores/lift'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import ModeToggle from '@/components/ModeToggle.vue'
import CalorieMode from '@/components/CalorieMode.vue'
import EntryDrawer from '@/components/EntryDrawer.vue'
import LiftsMode from '@/components/LiftsMode.vue'
import StatsMode from '@/components/StatsMode.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const entryDividerStore = useEntryDividerStore()
const liftStore = useLiftStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()

onMounted(async () => {
  await Promise.all([
    calorieStore.refreshData(),
    entryDividerStore.fetchEntries(),
    liftStore.fetchLifts(),
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
  <LiftsMode v-if="appStore.mode === 'lifts'" />
  <StatsMode v-if="appStore.mode === 'stats'" />
  <EntryDrawer />
</template>
