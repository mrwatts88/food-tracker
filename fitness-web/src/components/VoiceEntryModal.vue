<script setup lang="ts">
import { computed } from 'vue'

import { formatNutritionTotal, nutritionMetricLabels } from '@/lib/nutrition'
import type { VoiceMetric, VoiceParsePreview } from '@/types'

interface Props {
  preview: VoiceParsePreview
  submitting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  submitting: false
})

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const orderedTotals = computed<Array<{ metric: VoiceMetric; amount: number; label: string }>>(() => [
  {
    metric: 'calorie',
    amount: props.preview.totals.calorie,
    label: `${props.preview.totals.calorie.toLocaleString()} cals`
  },
  {
    metric: 'protein',
    amount: props.preview.totals.protein,
    label: formatNutritionTotal('protein', props.preview.totals.protein)
  },
  {
    metric: 'sugar',
    amount: props.preview.totals.sugar,
    label: formatNutritionTotal('sugar', props.preview.totals.sugar)
  },
  {
    metric: 'caffeine',
    amount: props.preview.totals.caffeine,
    label: formatNutritionTotal('caffeine', props.preview.totals.caffeine)
  }
])

const hasTotals = computed(() => orderedTotals.value.some(total => total.amount > 0))

function formatEstimate(metric: VoiceMetric, amount: number) {
  if (metric === 'calorie') {
    return `${amount.toLocaleString()} cals`
  }

  return formatNutritionTotal(metric, amount)
}

function formatItemTitle(item: VoiceParsePreview['items'][number]) {
  if (item.kind === 'food_item') {
    if (item.quantityText && item.name) {
      return `${item.quantityText} ${item.name}`
    }

    return item.name ?? item.rawText
  }

  return item.rawText
}
</script>

<template>
  <div class="modal-overlay" @click="emit('cancel')">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <div>
          <p class="eyebrow">Voice Preview</p>
          <h2 class="title">Confirm Nutrition Entry</h2>
        </div>
      </div>

      <div class="modal-body">
        <section class="section">
          <p class="section-label">Transcript</p>
          <p class="transcript">
            {{ preview.transcript || 'No transcript captured.' }}
          </p>
        </section>

        <section v-if="preview.warnings.length > 0" class="section warning-panel">
          <p class="section-label">Warnings</p>
          <ul class="warning-list">
            <li v-for="warning in preview.warnings" :key="warning">
              {{ warning }}
            </li>
          </ul>
        </section>

        <section class="section">
          <p class="section-label">What Will Be Added</p>
          <div class="totals-grid">
            <div v-for="total in orderedTotals" :key="total.metric" class="total-card">
              <span class="total-name">
                {{ total.metric === 'calorie' ? 'Calories' : nutritionMetricLabels[total.metric] }}
              </span>
              <strong class="total-value">{{ total.label }}</strong>
            </div>
          </div>
        </section>

        <section class="section">
          <p class="section-label">Detected Items</p>
          <div v-if="preview.items.length > 0" class="item-list">
            <article v-for="item in preview.items" :key="`${item.kind}:${item.rawText}`" class="item-card">
              <div class="item-heading">
                <strong>{{ formatItemTitle(item) }}</strong>
                <span class="item-kind" :class="`kind-${item.kind}`">
                  {{ item.kind === 'food_item' ? 'Food Estimate' : 'Direct Entry' }}
                </span>
              </div>
              <p class="item-raw">{{ item.rawText }}</p>
              <p class="item-estimates">
                {{
                  item.estimated.length > 0
                    ? item.estimated.map(estimate => formatEstimate(estimate.metric, estimate.amount)).join(' • ')
                    : 'No saved values'
                }}
              </p>
            </article>
          </div>
          <p v-else class="empty-state">
            No nutrition values were detected.
          </p>
        </section>
      </div>

      <div class="modal-actions">
        <button class="secondary-button" :disabled="submitting" @click="emit('cancel')">Cancel</button>
        <button class="primary-button" :disabled="submitting || !hasTotals" @click="emit('confirm')">
          {{ submitting ? 'Saving...' : 'Confirm Entry' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 1100;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  width: 100%;
  max-width: 428px;
  max-height: 88vh;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background:
    radial-gradient(circle at top, rgba(14, 165, 233, 0.14), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02)),
    #111827;
  display: flex;
  flex-direction: column;
}

.modal-header,
.modal-actions {
  padding: 16px;
}

.modal-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7dd3fc;
  margin-bottom: 4px;
}

.title {
  font-size: 24px;
  line-height: 1.1;
}

.modal-body {
  overflow-y: auto;
  padding: 16px;
  display: grid;
  gap: 16px;
}

.section {
  display: grid;
  gap: 10px;
}

.section-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.transcript,
.warning-panel,
.item-card,
.total-card,
.empty-state {
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.transcript,
.empty-state {
  padding: 14px;
  line-height: 1.45;
}

.warning-panel {
  padding: 14px;
  border: 1px solid rgba(251, 191, 36, 0.22);
}

.warning-list {
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: #fde68a;
}

.totals-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.total-card {
  padding: 14px;
  display: grid;
  gap: 6px;
}

.total-name {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.total-value {
  font-size: 18px;
}

.item-list {
  display: grid;
  gap: 10px;
}

.item-card {
  padding: 14px;
  display: grid;
  gap: 8px;
}

.item-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.item-kind {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 5px 8px;
  border-radius: 999px;
}

.kind-explicit_metric {
  color: #86efac;
  background: rgba(34, 197, 94, 0.16);
}

.kind-food_item {
  color: #fcd34d;
  background: rgba(245, 158, 11, 0.16);
}

.item-raw {
  color: var(--color-text-secondary);
}

.item-estimates {
  line-height: 1.4;
}

.modal-actions {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.secondary-button,
.primary-button {
  min-height: 48px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text);
}

.primary-button {
  background: linear-gradient(135deg, #0ea5e9, #10b981);
  color: white;
}

.secondary-button:disabled,
.primary-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 428px) {
  .modal-overlay {
    padding: 0;
  }

  .modal-content {
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }
}
</style>
