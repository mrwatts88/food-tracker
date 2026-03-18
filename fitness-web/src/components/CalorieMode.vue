<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'
import QuickAddList from './QuickAddList.vue'
import QuickAddDisplay from './QuickAddDisplay.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()

async function handleSubmit(amount: number) {
  await calorieStore.addEntry(amount)
}
</script>

<template>
  <div class="calorie-mode">
    <CalorieDisplay />
    <div class="input-section">
      <Keyboard
        v-if="appStore.inputMode === 'keyboard'"
        mode="calorie"
        :submitting="calorieStore.submittingEntry"
        @submit="handleSubmit"
      />
      <template v-else>
        <QuickAddList />
        <QuickAddDisplay />
      </template>
    </div>
  </div>
</template>

<style scoped>
.calorie-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.input-section {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}
</style>
