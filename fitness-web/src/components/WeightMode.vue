<script setup lang="ts">
import { useWeightStore } from '@/stores/weight'
import WeightDisplay from './WeightDisplay.vue'
import Keyboard from './Keyboard.vue'

const weightStore = useWeightStore()

async function handleSubmit(amount: number) {
  await weightStore.addEntry(amount)
}

</script>

<template>
  <div class="weight-mode">
    <WeightDisplay />
    <Keyboard mode="weight" :submitting="weightStore.submittingEntry" @submit="handleSubmit" />
  </div>
</template>

<style scoped>
.weight-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
