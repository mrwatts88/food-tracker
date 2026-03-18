<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useWeightStore } from '@/stores/weight'
import { useQuickAddStore } from '@/stores/quickadd'
import ModeToggle from '@/components/ModeToggle.vue'
import CalorieMode from '@/components/CalorieMode.vue'
import WeightMode from '@/components/WeightMode.vue'
import EntryDrawer from '@/components/EntryDrawer.vue'
import StatsMode from './components/StatsMode.vue';
import QuickAddConfig from './components/QuickAddConfig.vue';

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const weightStore = useWeightStore()
const quickAddStore = useQuickAddStore()

onMounted(async () => {
  await Promise.all([
    calorieStore.refreshData(),
    weightStore.fetchEntries(),
    quickAddStore.fetchFoods()
  ])

  if (!weightStore.todayWeight) {
    appStore.setMode("weight");
  }
})
</script>

<template>
  <div class="app-container">
    <ModeToggle />
    <CalorieMode v-if="appStore.mode === 'calorie'" />
    <WeightMode v-if="appStore.mode === 'weight'" />
    <StatsMode v-if="appStore.mode === 'stats'" />
    <EntryDrawer />
  </div>
  <QuickAddConfig class="config-panel" />
</template>

<style>
:root {
  --color-calorie-primary: #10b981;
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
  gap: 0;
}

.config-panel {
  display: none;
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
  .config-panel {
    display: flex;
    height: calc(100vh - 32px);
    max-height: 844px;
    border-radius: var(--border-radius);
    margin-left: var(--spacing-md);
  }

  .app-container {
    border-radius: var(--border-radius);
  }
}
</style>
