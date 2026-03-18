<script setup lang="ts">
import StatsDisplay from './StatsDisplay.vue'

</script>

<template>
  <!-- todo: make this a reusable 'screen display' wrapper -->
  <div class="weight-mode">
    <StatsDisplay />
  </div>
</template>

<style scoped>
.weight-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
