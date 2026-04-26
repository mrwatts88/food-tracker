<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { configApi } from '@/services/api'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import type { ConfigValue } from '@/types'

type EditableConfigValue = ConfigValue & {
  draftAmount: string
  saving: boolean
}

const router = useRouter()
const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const loading = ref(true)
const error = ref<string | null>(null)
const values = ref<EditableConfigValue[]>([])

const sortedValues = computed(() =>
  [...values.value].sort((left, right) => left.metric.localeCompare(right.metric))
)

async function fetchValues() {
  loading.value = true
  error.value = null

  try {
    const response = await configApi.getValues()
    values.value = response.data.map(value => ({
      ...value,
      draftAmount: String(value.amount),
      saving: false
    }))
  } catch (fetchError) {
    console.error('Failed to fetch config values:', fetchError)
    error.value = 'Settings could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function saveValue(value: EditableConfigValue) {
  const draftAmount = String(value.draftAmount)
  const amount = Number(draftAmount)

  if (draftAmount.trim() === '' || !Number.isInteger(amount)) {
    error.value = 'Amount must be a whole number.'
    return
  }

  value.saving = true
  error.value = null

  try {
    const response = await configApi.updateValue(value.metric, amount)
    value.amount = response.data.amount
    value.draftAmount = String(response.data.amount)
    await Promise.all([
      calorieStore.refreshData({ setLoading: false }),
      nutritionStore.refreshData({ setLoading: false })
    ])
  } catch (saveError) {
    console.error(`Failed to update ${value.metric}:`, saveError)
    error.value = `${value.metric} could not be saved.`
  } finally {
    value.saving = false
  }
}

onMounted(fetchValues)
</script>

<template>
  <section class="settings-view">
    <header class="settings-header">
      <button class="icon-button" type="button" aria-label="Back" title="Back" @click="router.push('/')">
        <span aria-hidden="true">‹</span>
      </button>
      <h1>Settings</h1>
    </header>

    <p v-if="error" class="settings-message settings-message--error">{{ error }}</p>

    <div v-if="loading" class="settings-loading">Loading settings...</div>
    <form v-else class="settings-list" @submit.prevent>
      <div v-for="value in sortedValues" :key="value.metric" class="settings-row">
        <label :for="`config-${value.metric}`">{{ value.metric }}</label>
        <input
          :id="`config-${value.metric}`"
          v-model="value.draftAmount"
          type="number"
          inputmode="numeric"
        />
        <button
          class="settings-save"
          type="button"
          :disabled="value.saving || value.draftAmount === String(value.amount)"
          @click="saveValue(value)"
        >
          {{ value.saving ? 'Saving' : 'Save' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.settings-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: var(--spacing-md);
  background: var(--color-background);
}

@media (min-width: 429px) {
  .settings-view {
    border-top: 3px solid var(--color-surface);
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
    border-bottom: 3px solid var(--color-surface);
    border-top-left-radius: var(--border-radius);
    border-top-right-radius: var(--border-radius);
    border-bottom-left-radius: var(--border-radius);
    border-bottom-right-radius: var(--border-radius);
  }
}

.settings-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.settings-header h1 {
  font-size: 22px;
  line-height: 1.1;
}

.icon-button {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.settings-message,
.settings-loading {
  margin-bottom: var(--spacing-md);
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.12);
  color: #a7f3d0;
  font-size: 13px;
}

.settings-message--error {
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.settings-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px 72px;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.settings-row label {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.settings-row input {
  min-width: 0;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  padding: 0 10px;
}

.settings-save {
  height: 38px;
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 8px;
  background: rgba(16, 185, 129, 0.12);
  color: #86efac;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.settings-save:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
