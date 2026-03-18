<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import CalorieEntryList from './CalorieEntryList.vue'
import WeightEntryList from './WeightEntryList.vue'

const appStore = useAppStore()

function handleBackdropClick() {
  appStore.closeDrawer()
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="appStore.isDrawerOpen" class="drawer-overlay" @click="handleBackdropClick">
      <div class="drawer-content" @click.stop>
        <div class="drawer-header">
          <h2 class="drawer-title">
            {{ appStore.mode === 'calorie' ? 'Today\'s Entries' : 'Weight History' }}
          </h2>
          <button class="close-button" @click="appStore.closeDrawer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div class="drawer-body">
          <CalorieEntryList v-if="appStore.mode === 'calorie'" />
          <WeightEntryList v-if="appStore.mode === 'weight'" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.drawer-content {
  width: 100%;
  max-width: 428px;
  max-height: 70vh;
  background: var(--color-surface);
  border-radius: var(--border-radius) var(--border-radius) 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.drawer-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.close-button {
  padding: 8px;
  background: transparent;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.close-button:active {
  background: rgba(255, 255, 255, 0.1);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
}

/* Transition animations */
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s ease;
}

.drawer-enter-active .drawer-content,
.drawer-leave-active .drawer-content {
  transition: transform 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer-content,
.drawer-leave-to .drawer-content {
  transform: translateY(100%);
}
</style>
