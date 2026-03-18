<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler
} from 'chart.js'
import type { WeightEntry } from '@/types'
import { useWeightStore } from '@/stores/weight'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler)

const props = defineProps<{
  gaining: boolean
}>()

const successColor = '#10b981'
const warningColor = '#dc2626'

const weightStore = useWeightStore()

const recentEntries = computed((): WeightEntry[] => {
  return [...weightStore.entries.slice(0, 28)].reverse()
})

function formatDate(dateStr: string) {
  const parts = dateStr.split('-')
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const chartData = computed(() => ({
  labels: recentEntries.value.map((e) => formatDate(e.createdAt)),
  datasets: [
    {
      data: recentEntries.value.map((e) => e.amount),
      borderColor: props.gaining ? warningColor : successColor,
      backgroundColor: props.gaining ? 'rgba(220, 38, 38, 0.1)' : 'rgba(16, 185, 129, 0.1)',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: props.gaining ? warningColor : successColor,
      fill: true,
      tension: 0.3
    }
  ]
}))

const chartOptions = computed(() => {
  const values = recentEntries.value.map((e) => e.amount)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = Math.max((max - min) * 0.15, 0.5)

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: {
          color: '#9ca3af',
          maxRotation: 45,
          font: { size: 10 },
          maxTicksLimit: 7
        },
        grid: { display: false }
      },
      y: {
        min: Math.floor((min - padding) * 2) / 2,
        max: Math.ceil((max + padding) * 2) / 2,
        ticks: {
          color: '#9ca3af',
          font: { size: 11 }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.06)'
        }
      }
    }
  }
})
</script>

<template>
  <div v-if="recentEntries.length > 1" class="weight-chart">
    <div class="chart-label">Weight — Last {{ recentEntries.length }} Entries</div>
    <div class="chart-container">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.weight-chart {
  width: 100%;
  padding: 0 var(--spacing-md);
}

.chart-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  text-align: center;
  margin-bottom: var(--spacing-sm);
}

.chart-container {
  height: 200px;
}
</style>
