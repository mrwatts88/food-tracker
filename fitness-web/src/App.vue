<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import ModeToggle from '@/components/ModeToggle.vue'
import CalorieMode from '@/components/CalorieMode.vue'
import EntryDrawer from '@/components/EntryDrawer.vue'
import StatsMode from './components/StatsMode.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()

onMounted(async () => {
  await Promise.all([
    calorieStore.refreshData(),
    nutritionStore.refreshData(),
    weightStore.fetchEntries()
  ])

  if (!weightStore.todayWeight) {
    appStore.setMode('calorie')
    appStore.setActiveMetric('weight')
  }
})
</script>

<template>
  <div class="app-container">
    <ModeToggle />
    <CalorieMode v-if="appStore.mode === 'calorie'" />
    <StatsMode v-if="appStore.mode === 'stats'" />
    <EntryDrawer />
  </div>
</template>

<style>
:root {
  --color-calorie-primary: #10b981;
  --color-protein-primary: #3b82f6;
  --color-sugar-primary: #f97316;
  --color-caffeine-primary: #14b8a6;
  --color-weight-primary: #f59e0b;
  --color-background: #1f2937;
  --color-surface: #374151;
  --color-text: #f9fafb;
  --color-text-secondary: #9ca3af;
  --border-radius: 12px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
    sans-serif;
  background: var(--color-background);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  touch-action: manipulation;
}

#app {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--color-background);
}

.app-container {
  width: 100%;
  max-width: 428px;
  height: 100vh;
  max-height: 844px;
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  position: relative;
  overflow: hidden;
}

@media (min-width: 431px) {
  #app {
    padding: var(--spacing-md) 0;
  }

  .app-container {
    border-radius: var(--border-radius);
    height: calc(100vh - 32px);
  }
}

@media (min-width: 900px) {
  .app-container {
    border-radius: var(--border-radius);
  }
}
</style>
