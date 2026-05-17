<script setup lang="ts">
import { computed } from 'vue'

import { useLiftStore } from '@/stores/lift'
import type { Lift, LiftUpdate } from '@/types'

const liftStore = useLiftStore()
const stepSize = 5

const liftSets = [
  { key: 'set1Weight', label: 'Set 1' },
  { key: 'set2Weight', label: 'Set 2' },
  { key: 'set3Weight', label: 'Set 3' }
] as const

const sortedLifts = computed(() =>
  [...liftStore.lifts].sort((left, right) => left.sortOrder - right.sortOrder)
)

function isSubmitting(lift: Lift) {
  return Boolean(liftStore.submittingBySlug[lift.slug])
}

function buildUpdate(lift: Lift, key: keyof LiftUpdate, nextWeight: number): LiftUpdate {
  return {
    set1Weight: key === 'set1Weight' ? nextWeight : lift.set1Weight,
    set2Weight: key === 'set2Weight' ? nextWeight : lift.set2Weight,
    set3Weight: key === 'set3Weight' ? nextWeight : lift.set3Weight
  }
}

async function adjustWeight(lift: Lift, key: keyof LiftUpdate, direction: -1 | 1) {
  if (isSubmitting(lift)) {
    return
  }

  const nextWeight = Math.max(0, lift[key] + stepSize * direction)

  if (nextWeight === lift[key]) {
    return
  }

  await liftStore.updateLift(lift.slug, buildUpdate(lift, key, nextWeight), key)
}
</script>

<template>
  <div class="lifts-mode">
    <div v-if="liftStore.loading && !liftStore.hasLifts" class="lifts-state">
      Loading lifts...
    </div>
    <div v-else-if="!liftStore.hasLifts" class="lifts-state">
      No lifts configured
    </div>
    <div v-else class="lifts-list">
      <div class="lifts-toolbar">
        <div class="lifts-toolbar-copy">
          <span class="lifts-toolbar-label">Workout changes</span>
          <span class="lifts-toolbar-value">
            {{ liftStore.changedSetIds.length }} set{{ liftStore.changedSetIds.length === 1 ? '' : 's' }}
          </span>
        </div>
        <button
          class="reset-button"
          type="button"
          :disabled="!liftStore.hasChangedSets"
          @click="liftStore.resetWorkoutChanges()"
        >
          Reset workout
        </button>
      </div>

      <section v-for="lift in sortedLifts" :key="lift.slug" class="lift-card">
        <div class="lift-header">
          <div>
            <h2>{{ lift.name }}</h2>
            <p>{{ lift.description }}</p>
          </div>
          <span v-if="isSubmitting(lift)" class="saving-label">Saving</span>
        </div>

        <div class="set-list">
          <div v-for="set in liftSets" :key="set.key" class="set-row">
            <span class="set-label">{{ set.label }}</span>
            <div
              :class="[
                'weight-control',
                { 'weight-control--changed': liftStore.isSetChanged(lift.slug, set.key) }
              ]"
            >
              <button
                class="adjust-button"
                type="button"
                :disabled="isSubmitting(lift) || lift[set.key] === 0"
                :aria-label="`Decrease ${lift.name} ${set.label}`"
                @click="adjustWeight(lift, set.key, -1)"
              >
                -
              </button>
              <span class="weight-value">{{ lift[set.key] }} lb</span>
              <button
                class="adjust-button"
                type="button"
                :disabled="isSubmitting(lift)"
                :aria-label="`Increase ${lift.name} ${set.label}`"
                @click="adjustWeight(lift, set.key, 1)"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.lifts-mode {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.lifts-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  border-bottom: 3px solid var(--color-surface);
  border-bottom-left-radius: var(--border-radius);
  border-bottom-right-radius: var(--border-radius);
}

@media (min-width: 429px) {
  .lifts-list {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.lifts-state {
  flex: 1;
  display: grid;
  place-items: center;
  padding: var(--spacing-lg);
  color: var(--color-text-secondary);
  font-size: 16px;
  font-weight: 600;
}

.lifts-toolbar {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--color-lifts-primary) 28%, transparent);
  border-radius: var(--border-radius);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-surface) 94%, white 6%),
    var(--color-surface)
  );
}

.lifts-toolbar-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lifts-toolbar-label {
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.lifts-toolbar-value {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 800;
}

.reset-button {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--color-lifts-primary) 34%, transparent);
  border-radius: var(--border-radius);
  background: color-mix(in srgb, var(--color-lifts-primary) 12%, transparent);
  color: var(--color-lifts-primary);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.reset-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.reset-button:active:not(:disabled) {
  transform: scale(0.98);
}

.lift-card {
  border: 1px solid color-mix(in srgb, var(--color-lifts-primary) 32%, transparent);
  border-radius: var(--border-radius);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-lifts-primary) 10%, transparent),
    var(--color-surface)
  );
  padding: var(--spacing-md);
}

.lift-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.lift-header h2 {
  font-size: 18px;
  line-height: 1.2;
  font-weight: 800;
  color: var(--color-text);
}

.lift-header p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--color-text-secondary);
}

.saving-label {
  flex: 0 0 auto;
  color: var(--color-lifts-primary);
  font-size: 12px;
  font-weight: 700;
}

.set-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.set-row {
  min-height: 48px;
  display: grid;
  grid-template-columns: minmax(60px, 1fr) auto;
  align-items: center;
  gap: var(--spacing-md);
}

.set-label {
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 700;
}

.weight-control {
  width: 184px;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-lifts-primary) 26%, transparent);
  border-radius: var(--border-radius);
  background: rgba(31, 41, 55, 0.52);
}

.weight-control--changed {
  border-color: color-mix(in srgb, #fbbf24 72%, white 8%);
  background: color-mix(in srgb, #f59e0b 20%, rgba(31, 41, 55, 0.52));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #f59e0b 42%, transparent);
}

.weight-control--changed .weight-value {
  color: #fde68a;
}

.adjust-button {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 22px;
  font-weight: 800;
  cursor: pointer;
}

.adjust-button:disabled {
  color: rgba(156, 163, 175, 0.42);
  cursor: not-allowed;
}

.adjust-button:active:not(:disabled) {
  background: rgba(239, 68, 68, 0.18);
}

.weight-value {
  min-width: 0;
  text-align: center;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 44px;
  border-left: 1px solid rgba(249, 250, 251, 0.08);
  border-right: 1px solid rgba(249, 250, 251, 0.08);
}

@media (max-width: 360px) {
  .set-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .weight-control {
    width: 100%;
  }
}
</style>
