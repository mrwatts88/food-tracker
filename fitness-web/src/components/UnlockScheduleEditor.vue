<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { calorieApi } from '@/services/api'
import { useCalorieStore } from '@/stores/calorie'
import type { UnlockSchedule } from '@/types'

type DraftSlot = {
  key: number
  time: string
  percent: string
}

const calorieStore = useCalorieStore()
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const isDefault = ref(true)
const savedSignature = ref('')
const slots = ref<DraftSlot[]>([])
let nextKey = 0

const dailyTarget = computed(() => calorieStore.effectiveDailyTarget)

const totalPercent = computed(() =>
  roundPercent(slots.value.reduce((sum, slot) => sum + (Number(slot.percent) || 0), 0)),
)

const sortedSlots = computed(() => [...slots.value].sort((left, right) => left.time.localeCompare(right.time)))

const validationError = computed(() => {
  if (slots.value.length === 0) {
    return 'Add at least one unlock.'
  }

  if (slots.value.some((slot) => !/^\d{2}:\d{2}$/.test(slot.time))) {
    return 'Every unlock needs a time.'
  }

  if (new Set(slots.value.map((slot) => slot.time)).size !== slots.value.length) {
    return 'Two unlocks share the same time.'
  }

  if (slots.value.some((slot) => !(Number(slot.percent) > 0))) {
    return 'Every unlock needs a share above 0%.'
  }

  if (Math.abs(totalPercent.value - 100) > 0.001) {
    return `Shares add up to ${totalPercent.value}%, not 100%.`
  }

  return null
})

const isDirty = computed(() => signatureOf(slots.value) !== savedSignature.value)

function roundPercent(value: number) {
  return Math.round(value * 100) / 100
}

function signatureOf(draft: DraftSlot[]) {
  return [...draft]
    .sort((left, right) => left.time.localeCompare(right.time))
    .map((slot) => `${slot.time}=${Number(slot.percent)}`)
    .join(',')
}

function applySchedule(schedule: UnlockSchedule) {
  isDefault.value = schedule.isDefault
  slots.value = schedule.slots.map((slot) => ({
    key: nextKey++,
    time: slot.time,
    percent: String(roundPercent(slot.fraction * 100)),
  }))
  savedSignature.value = signatureOf(slots.value)
}

function caloriesFor(slot: DraftSlot) {
  const percent = Number(slot.percent)
  return Number.isFinite(percent) && dailyTarget.value > 0
    ? Math.round((dailyTarget.value * percent) / 100)
    : null
}

function addSlot() {
  const latest = sortedSlots.value[sortedSlots.value.length - 1]?.time
  const latestHour = latest ? Number(latest.slice(0, 2)) : 8
  const hour = Math.min(23, latestHour + 3)

  slots.value.push({ key: nextKey++, time: `${String(hour).padStart(2, '0')}:00`, percent: '0' })
}

function removeSlot(key: number) {
  slots.value = slots.value.filter((slot) => slot.key !== key)
}

// Whole-number shares, with the leftover percent going to the earliest unlocks.
function splitEvenly() {
  const ordered = sortedSlots.value
  const base = Math.floor(100 / ordered.length)
  let leftover = 100 - base * ordered.length

  for (const slot of ordered) {
    slot.percent = String(base + (leftover > 0 ? 1 : 0))
    leftover -= 1
  }
}

async function refreshAfterChange() {
  await calorieStore.refreshData({ setLoading: false })
}

async function fetchSchedule() {
  loading.value = true
  error.value = null

  try {
    applySchedule((await calorieApi.getUnlockSchedule()).data)
  } catch (fetchError) {
    console.error('Failed to fetch unlock schedule:', fetchError)
    error.value = 'Unlock schedule could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (validationError.value) {
    error.value = validationError.value
    return
  }

  saving.value = true
  error.value = null

  try {
    const response = await calorieApi.saveUnlockSchedule(
      sortedSlots.value.map((slot) => ({ time: slot.time, fraction: Number(slot.percent) / 100 })),
    )
    applySchedule(response.data)
    await refreshAfterChange()
  } catch (saveError) {
    console.error('Failed to save unlock schedule:', saveError)
    error.value = 'Unlock schedule could not be saved.'
  } finally {
    saving.value = false
  }
}

async function resetToDefault() {
  saving.value = true
  error.value = null

  try {
    applySchedule((await calorieApi.resetUnlockSchedule()).data)
    await refreshAfterChange()
  } catch (resetError) {
    console.error('Failed to reset unlock schedule:', resetError)
    error.value = 'Unlock schedule could not be reset.'
  } finally {
    saving.value = false
  }
}

onMounted(fetchSchedule)
</script>

<template>
  <section class="schedule">
    <header class="schedule-header">
      <h2>Calorie unlocks</h2>
      <span v-if="dailyTarget > 0" class="schedule-target">
        {{ dailyTarget.toLocaleString() }} cal / day
      </span>
    </header>

    <div v-if="loading" class="schedule-note">Loading schedule...</div>
    <template v-else>
      <div class="schedule-rows">
        <div v-for="slot in slots" :key="slot.key" class="schedule-row">
          <input v-model="slot.time" class="schedule-time" type="time" aria-label="Unlock time" />
          <div class="schedule-percent">
            <input
              v-model="slot.percent"
              type="number"
              inputmode="decimal"
              min="0"
              max="100"
              step="any"
              aria-label="Share of daily calories"
            />
            <span>%</span>
          </div>
          <span class="schedule-calories">
            <template v-if="caloriesFor(slot) !== null">≈ {{ caloriesFor(slot) }}</template>
          </span>
          <button
            class="schedule-remove"
            type="button"
            aria-label="Remove unlock"
            :disabled="slots.length === 1"
            @click="removeSlot(slot.key)"
          >
            ×
          </button>
        </div>
      </div>

      <div class="schedule-tools">
        <button class="schedule-tool" type="button" @click="addSlot">+ Add unlock</button>
        <button class="schedule-tool" type="button" :disabled="slots.length === 0" @click="splitEvenly">
          Split evenly
        </button>
        <span class="schedule-total" :class="{ 'schedule-total--off': Math.abs(totalPercent - 100) > 0.001 }">
          {{ totalPercent }}%
        </span>
      </div>

      <p v-if="error ?? (isDirty ? validationError : null)" class="schedule-note schedule-note--error">
        {{ error ?? validationError }}
      </p>
      <p v-else-if="isDefault && !isDirty" class="schedule-note">
        Using the server default. Saving here overrides it.
      </p>

      <div class="schedule-actions">
        <button
          v-if="!isDefault"
          class="schedule-reset"
          type="button"
          :disabled="saving"
          @click="resetToDefault"
        >
          Reset to default
        </button>
        <button
          class="schedule-save"
          type="button"
          :disabled="saving || !isDirty || validationError !== null"
          @click="save"
        >
          {{ saving ? 'Saving' : 'Save schedule' }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.schedule {
  margin-top: var(--spacing-md);
  padding: 12px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.schedule-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: 10px;
}

.schedule-header h2 {
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.schedule-target {
  color: var(--color-text-muted);
  font-size: 12px;
}

.schedule-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.schedule-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px 56px 32px;
  align-items: center;
  gap: 6px;
}

.schedule-row input {
  min-width: 0;
  width: 100%;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  padding: 0 8px;
  color-scheme: dark;
}

.schedule-percent {
  position: relative;
}

.schedule-percent input {
  padding-right: 22px;
}

.schedule-percent span {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  font-size: 13px;
  pointer-events: none;
}

.schedule-calories {
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: right;
  white-space: nowrap;
}

.schedule-remove {
  height: 32px;
  border: none;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.schedule-remove:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.schedule-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.schedule-tool {
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.schedule-tool:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.schedule-total {
  margin-left: auto;
  color: #86efac;
  font-size: 13px;
  font-weight: 800;
}

.schedule-total--off {
  color: #fca5a5;
}

.schedule-note {
  margin-top: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.schedule-note--error {
  color: #fecaca;
}

.schedule-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}

.schedule-save,
.schedule-reset {
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.schedule-save {
  border: 1px solid rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.12);
  color: #86efac;
}

.schedule-reset {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: var(--color-text-secondary);
}

.schedule-save:disabled,
.schedule-reset:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
