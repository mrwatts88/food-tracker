<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { nutritionMetrics, isNutritionMetric, nutritionMetricColorVars } from '@/lib/nutrition'
import { calorieApi, nutritionApi, voiceApi } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, VoiceParsePreview, VoiceSessionState } from '@/types'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'
import VoiceEntryButton from './VoiceEntryButton.vue'
import VoiceEntryModal from './VoiceEntryModal.vue'

const appStore = useAppStore()
const calorieStore = useCalorieStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()
const LISTENING_TIMEOUT_SECONDS = 20

const voiceState = ref<VoiceSessionState>('idle')
const recordingSecondsRemaining = ref(LISTENING_TIMEOUT_SECONDS)
const voicePreview = ref<VoiceParsePreview | null>(null)
const voiceError = ref<string | null>(null)
const savingVoicePreview = ref(false)

const trackSelectors: Array<{ metric: EntryMetric; label: string; accentColor: string }> = [
  { metric: 'calorie', label: 'kCals', accentColor: 'var(--color-calorie-primary)' },
  { metric: 'protein', label: 'Pro', accentColor: nutritionMetricColorVars.protein },
  { metric: 'sugar', label: 'Sug', accentColor: nutritionMetricColorVars.sugar },
  { metric: 'caffeine', label: 'Caff', accentColor: nutritionMetricColorVars.caffeine },
  { metric: 'weight', label: 'Wt', accentColor: 'var(--color-weight-primary)' }
]

let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordingChunks: Blob[] = []
let recordingMimeType = 'audio/webm'
let recordingTimeoutId: number | null = null
let recordingIntervalId: number | null = null
let recordingStopReason: 'send' | 'cancel' | 'timeout' = 'cancel'

const keyboardAccentColor = computed(() => {
  if (isNutritionMetric(appStore.activeMetric)) {
    return nutritionMetricColorVars[appStore.activeMetric]
  }

  if (appStore.activeMetric === 'weight') {
    return 'var(--color-weight-primary)'
  }

  return 'var(--color-calorie-primary)'
})

const voiceSupported = computed(
  () =>
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
)

const keyboardSubmitting = computed(() => {
  if (appStore.activeMetric === 'weight') {
    return weightStore.submittingEntry
  }

  if (isNutritionMetric(appStore.activeMetric)) {
    return nutritionStore.submittingByMetric[appStore.activeMetric]
  }

  return calorieStore.submittingEntry
})

async function handleSubmit(amount: number) {
  if (appStore.activeMetric === 'weight') {
    await weightStore.addEntry(amount)
    return
  }

  if (isNutritionMetric(appStore.activeMetric)) {
    await nutritionStore.addEntry(amount, appStore.activeMetric)
    return
  }

  await calorieStore.addEntry(amount)
}

function handleMetricChange(metric: EntryMetric) {
  if (appStore.activeMetric === metric) {
    return
  }

  appStore.setActiveMetric(metric)
}

function clearRecordingTimers() {
  if (recordingTimeoutId !== null) {
    window.clearTimeout(recordingTimeoutId)
    recordingTimeoutId = null
  }

  if (recordingIntervalId !== null) {
    window.clearInterval(recordingIntervalId)
    recordingIntervalId = null
  }
}

function stopMediaStream() {
  if (mediaStream === null) {
    return
  }

  for (const track of mediaStream.getTracks()) {
    track.stop()
  }

  mediaStream = null
}

function resetVoiceRecordingState() {
  clearRecordingTimers()
  stopMediaStream()
  mediaRecorder = null
  recordingChunks = []
  recordingMimeType = 'audio/webm'
  recordingStopReason = 'cancel'
  recordingSecondsRemaining.value = LISTENING_TIMEOUT_SECONDS
}

function getAudioExtension(mimeType: string) {
  if (mimeType.includes('mp4')) {
    return 'mp4'
  }

  if (mimeType.includes('mpeg')) {
    return 'mp3'
  }

  if (mimeType.includes('wav')) {
    return 'wav'
  }

  return 'webm'
}

async function uploadVoiceEntry(blob: Blob) {
  voiceState.value = 'processing'

  const mimeType = blob.type || 'audio/webm'
  const formData = new FormData()
  formData.set(
    'audio',
    new File([blob], `voice-entry.${getAudioExtension(mimeType)}`, {
      type: mimeType
    })
  )

  try {
    const response = await voiceApi.parseAudio(formData)
    voicePreview.value = response.data
    voiceState.value = 'preview'
  } catch (error) {
    console.error('Failed to parse voice entry:', error)
    voiceError.value = 'Voice entry could not be processed.'
    voiceState.value = 'idle'
  }
}

async function startVoiceListening() {
  if (!voiceSupported.value || voiceState.value !== 'idle') {
    return
  }

  voiceError.value = null

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    console.error('Failed to access microphone:', error)
    voiceError.value = 'Microphone access was denied or unavailable.'
    return
  }

  recordingChunks = []
  recordingStopReason = 'cancel'
  recordingSecondsRemaining.value = LISTENING_TIMEOUT_SECONDS
  mediaRecorder = new MediaRecorder(mediaStream)
  recordingMimeType = mediaRecorder.mimeType || 'audio/webm'

  mediaRecorder.addEventListener('dataavailable', event => {
    if (event.data.size > 0) {
      recordingChunks.push(event.data)
    }
  })

  mediaRecorder.addEventListener('stop', async () => {
    const stopReason = recordingStopReason
    const blob = new Blob(recordingChunks, { type: recordingMimeType })

    resetVoiceRecordingState()

    if (stopReason === 'timeout') {
      voiceError.value = 'Listening timed out. Nothing was sent.'
      voiceState.value = 'idle'
      return
    }

    if (stopReason === 'cancel') {
      voiceState.value = 'idle'
      return
    }

    if (blob.size === 0) {
      voiceError.value = 'No audio was captured.'
      voiceState.value = 'idle'
      return
    }

    await uploadVoiceEntry(blob)
  })

  mediaRecorder.addEventListener('error', event => {
    console.error('MediaRecorder error:', event)
    resetVoiceRecordingState()
    voiceError.value = 'Recording failed before the audio could be sent.'
    voiceState.value = 'idle'
  })

  mediaRecorder.start()
  voiceState.value = 'listening'

  recordingIntervalId = window.setInterval(() => {
    recordingSecondsRemaining.value = Math.max(0, recordingSecondsRemaining.value - 1)
  }, 1000)

  recordingTimeoutId = window.setTimeout(() => {
    if (voiceState.value !== 'listening') {
      return
    }

    stopVoiceListening('timeout')
  }, LISTENING_TIMEOUT_SECONDS * 1000)
}

function stopVoiceListening(reason: 'send' | 'cancel' | 'timeout') {
  if (mediaRecorder === null) {
    resetVoiceRecordingState()
    voiceState.value = 'idle'
    return
  }

  recordingStopReason = reason
  clearRecordingTimers()

  if (mediaRecorder.state === 'inactive') {
    resetVoiceRecordingState()
    voiceState.value = 'idle'
    return
  }

  mediaRecorder.stop()
}

async function handleVoicePress() {
  if (voiceState.value === 'idle') {
    await startVoiceListening()
    return
  }

  if (voiceState.value === 'listening') {
    stopVoiceListening('send')
  }
}

function closeVoicePreview() {
  if (savingVoicePreview.value) {
    return
  }

  voicePreview.value = null
  voiceState.value = 'idle'
}

async function confirmVoicePreview() {
  if (voicePreview.value === null || savingVoicePreview.value) {
    return
  }

  const preview = voicePreview.value
  const requests: Array<Promise<unknown>> = []

  if (preview.totals.calorie > 0) {
    requests.push(calorieApi.addEntry(preview.totals.calorie))
  }

  for (const metric of nutritionMetrics) {
    if (preview.totals[metric] > 0) {
      requests.push(nutritionApi.addEntry(metric, preview.totals[metric]))
    }
  }

  if (requests.length === 0) {
    closeVoicePreview()
    return
  }

  savingVoicePreview.value = true
  voiceError.value = null

  try {
    await Promise.all(requests)
    closeVoicePreview()
  } catch (error) {
    console.error('Failed to save voice entry totals:', error)
    voicePreview.value = null
    voiceState.value = 'idle'
    voiceError.value = 'One or more entries failed to save. Totals were refreshed to match what was stored.'
  } finally {
    savingVoicePreview.value = false
    await Promise.all([
      calorieStore.refreshData({ setLoading: false }),
      nutritionStore.refreshData({ setLoading: false })
    ])
  }
}

onBeforeUnmount(() => {
  if (voiceState.value === 'listening') {
    stopVoiceListening('cancel')
  }

  resetVoiceRecordingState()
})
</script>

<template>
  <div class="calorie-mode">
    <div class="display-section">
      <CalorieDisplay :active-metric="appStore.activeMetric" />
      <div class="track-toggle">
        <button
          v-for="selector in trackSelectors"
          :key="selector.metric"
          :class="['track-toggle-button', { active: appStore.activeMetric === selector.metric }]"
          :style="{ '--track-accent': selector.accentColor }"
          @click="handleMetricChange(selector.metric)"
        >
          {{ selector.label }}
        </button>
        <VoiceEntryButton
          :state="voiceState"
          :supported="voiceSupported"
          :disabled="savingVoicePreview"
          :seconds-remaining="recordingSecondsRemaining"
        @press="handleVoicePress"
        />
      </div>
    </div>
    <div class="input-section">
      <p v-if="voiceError" class="voice-error">
        {{ voiceError }}
      </p>
      <Keyboard
        :mode="appStore.activeMetric"
        :accent-color="keyboardAccentColor"
        :submitting="keyboardSubmitting"
        @submit="handleSubmit"
      />
    </div>
    <VoiceEntryModal
      v-if="voicePreview !== null && voiceState === 'preview'"
      :preview="voicePreview"
      :submitting="savingVoicePreview"
      @cancel="closeVoicePreview"
      @confirm="confirmVoicePreview"
    />
  </div>
</template>

<style scoped>
.calorie-mode {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  position: relative;
}

.display-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.track-toggle {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md) var(--spacing-md);
  flex-shrink: 0;
}

@media (min-width: 429px) {
  .track-toggle {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.track-toggle-button {
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0;
}

.track-toggle-button.active {
  background: color-mix(in srgb, var(--track-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--track-accent) 50%, transparent);
  color: var(--track-accent);
}

@media (max-width: 428px) {
  .track-toggle {
    gap: 6px;
  }

  .track-toggle-button {
    padding: 10px 6px;
    font-size: 12px;
  }
}

.track-toggle-button:active {
  transform: scale(0.98);
}

.input-section {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  min-height: 0;
}

.voice-error {
  margin: var(--spacing-sm) var(--spacing-md) 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
  font-size: 13px;
  line-height: 1.35;
  text-align: center;
}

</style>
