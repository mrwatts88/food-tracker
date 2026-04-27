<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

import { nutritionMetrics, isNutritionMetric, nutritionMetricColorVars } from '@/lib/nutrition'
import { calorieApi, nutritionApi, voiceApi } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { useCalorieStore } from '@/stores/calorie'
import { useEntryDividerStore } from '@/stores/entryDivider'
import { useNutritionStore } from '@/stores/nutrition'
import { useWeightStore } from '@/stores/weight'
import type { EntryMetric, TrackMetric, VoiceParsePreview, VoiceSessionState } from '@/types'
import CalorieDisplay from './CalorieDisplay.vue'
import Keyboard from './Keyboard.vue'
import VoiceEntryButton from './VoiceEntryButton.vue'
import VoiceEntryModal from './VoiceEntryModal.vue'

const appStore = useAppStore()
const router = useRouter()
const calorieStore = useCalorieStore()
const entryDividerStore = useEntryDividerStore()
const nutritionStore = useNutritionStore()
const weightStore = useWeightStore()
const LISTENING_TIMEOUT_SECONDS = 20

const voiceState = ref<VoiceSessionState>('idle')
const recordingSecondsRemaining = ref(LISTENING_TIMEOUT_SECONDS)
const voicePreview = ref<VoiceParsePreview | null>(null)
const voiceError = ref<string | null>(null)
const savingVoicePreview = ref(false)

let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordingChunks: Blob[] = []
let recordingMimeType: string | null = null
let recordingTimeoutId: number | null = null
let recordingIntervalId: number | null = null
let recordingStopReason: 'send' | 'cancel' | 'timeout' = 'cancel'

const preferredRecordingMimeTypes = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
]

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
    Boolean(navigator.mediaDevices?.getUserMedia),
)
const showTrackActions = computed(() => appStore.mode === 'calorie')

const streakSummary = computed(() => {
  const status = calorieStore.unlockStatus

  if (!status) {
    return '...'
  }

  const streak = status.dailyGoalStreak
  const noun = streak === 1 ? 'day' : 'days'
  return `${streak.toLocaleString()} ${noun}`
})

const keyboardSubmitting = computed(() => {
  if (entryDividerStore.submitting) {
    return true
  }

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

async function handleInsertDivider() {
  if (appStore.activeMetric === 'weight') {
    return
  }

  await entryDividerStore.addDivider()
}

function handleSettingsClick() {
  router.push('/settings')
}

function handleMetricChange(metric: EntryMetric) {
  if (appStore.activeMetric === metric) {
    return
  }

  appStore.setActiveMetric(metric)
}

function handleTrackMetricSelect(metric: TrackMetric) {
  handleMetricChange(metric)
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
  recordingMimeType = null
  recordingStopReason = 'cancel'
  recordingSecondsRemaining.value = LISTENING_TIMEOUT_SECONDS
}

function getAudioExtension(mimeType: string) {
  if (mimeType.includes('m4a') || mimeType.includes('aac')) {
    return 'm4a'
  }

  if (mimeType.includes('mp4')) {
    return 'm4a'
  }

  if (mimeType.includes('mpeg')) {
    return 'mp3'
  }

  if (mimeType.includes('wav')) {
    return 'wav'
  }

  if (mimeType.includes('ogg')) {
    return 'ogg'
  }

  return 'webm'
}

function getPreferredRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null
  }

  return (
    preferredRecordingMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null
  )
}

async function uploadVoiceEntry(blob: Blob) {
  voiceState.value = 'processing'

  const mimeType = blob.type || recordingMimeType || 'audio/mp4'
  const formData = new FormData()
  formData.set(
    'audio',
    new File([blob], `voice-entry.${getAudioExtension(mimeType)}`, {
      type: mimeType,
    }),
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
  const preferredMimeType = getPreferredRecordingMimeType()

  mediaRecorder = preferredMimeType
    ? new MediaRecorder(mediaStream, { mimeType: preferredMimeType })
    : new MediaRecorder(mediaStream)

  recordingMimeType = mediaRecorder.mimeType || preferredMimeType

  mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      if (!recordingMimeType && event.data.type) {
        recordingMimeType = event.data.type
      }

      recordingChunks.push(event.data)
    }
  })

  mediaRecorder.addEventListener('stop', async () => {
    const stopReason = recordingStopReason
    const firstChunk = recordingChunks[0]
    const blob =
      recordingChunks.length === 1 && firstChunk
        ? firstChunk
        : recordingMimeType
          ? new Blob(recordingChunks, { type: recordingMimeType })
          : new Blob(recordingChunks)

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

  mediaRecorder.addEventListener('error', (event) => {
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
    voicePreview.value = null
    voiceState.value = 'idle'
  } catch (error) {
    console.error('Failed to save voice entry totals:', error)
    voicePreview.value = null
    voiceState.value = 'idle'
    voiceError.value =
      'One or more entries failed to save. Totals were refreshed to match what was stored.'
  } finally {
    savingVoicePreview.value = false
    await Promise.all([
      calorieStore.refreshData({ setLoading: false }),
      nutritionStore.refreshData({ setLoading: false }),
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
      <CalorieDisplay
        :active-metric="appStore.activeMetric"
        @select-metric="handleTrackMetricSelect"
      />
      <div v-if="showTrackActions" class="track-actions">
        <div class="track-streak-badge" aria-label="Daily goal streak">
          <svg
            class="track-streak-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 2c.4 2.2-.3 3.8-1.5 5.1C9.1 8.6 7 10.8 7 14a5 5 0 0 0 10 0c0-2.6-1.4-4.4-2.8-6-.8-.9-1.5-1.7-1.9-2.7-.4 1.4-1.2 2.4-2 3.4-.8 1-1.5 1.9-1.5 3.3a3 3 0 0 0 6 0c0-.7-.2-1.4-.6-2 .1 2-1.4 3.6-3.2 3.6-1.7 0-3-1.3-3-3 0-1.9 1.1-3.1 2.4-4.5C11.4 4.9 12.1 3.8 12 2Z"
            />
          </svg>
          <span>{{ streakSummary }}</span>
        </div>
        <button
          class="track-action-button track-action-button--divider"
          :style="{ '--track-action-accent': keyboardAccentColor }"
          :disabled="keyboardSubmitting"
          @click="handleInsertDivider"
        >
          <span v-if="keyboardSubmitting" class="track-action-spinner"></span>
          <span v-else>BINK</span>
        </button>
        <button
          class="track-action-button track-action-button--settings"
          type="button"
          aria-label="Settings"
          title="Settings"
          @click="handleSettingsClick"
        >
          <svg class="settings-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.36a1.7 1.7 0 0 0-1 .9l-.03.08a2 2 0 0 1-3.86 0l-.03-.08a1.7 1.7 0 0 0-1-.9 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-.9-1l-.08-.03a2 2 0 0 1 0-3.86l.08-.03a1.7 1.7 0 0 0 .9-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64a1.7 1.7 0 0 0 1-.9l.03-.08a2 2 0 0 1 3.86 0l.03.08a1.7 1.7 0 0 0 1 .9 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9c.09.39.42.73.9 1l.08.03a2 2 0 0 1 0 3.86l-.08.03a1.7 1.7 0 0 0-.86 1.08Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
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
        @insert-divider="handleInsertDivider"
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

.track-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md) var(--spacing-md);
  flex-shrink: 0;
}

@media (min-width: 429px) {
  .track-actions {
    border-left: 3px solid var(--color-surface);
    border-right: 3px solid var(--color-surface);
  }
}

.track-action-button {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  background: rgba(255, 255, 255, 0.03);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.track-action-button--divider {
  background: color-mix(in srgb, var(--track-action-accent) 16%, transparent);
  border-color: color-mix(in srgb, var(--track-action-accent) 40%, transparent);
  color: var(--track-action-accent);
}

.track-action-button--settings {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c4b5fd;
  border-color: rgba(196, 181, 253, 0.28);
  background: color-mix(in srgb, #8b5cf6 12%, transparent);
}

.settings-icon {
  width: 20px;
  height: 20px;
}

.track-streak-badge {
  min-width: 0;
  min-height: 42px;
  padding: 10px 6px;
  border: 1px solid rgba(245, 158, 11, 0.42);
  border-radius: var(--border-radius);
  background: color-mix(in srgb, #f59e0b 14%, transparent);
  color: #fbbf24;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.track-streak-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.track-action-button:active {
  transform: scale(0.98);
}

.track-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.track-action-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--track-action-accent) 25%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@media (max-width: 428px) {
  .track-actions {
    padding-bottom: var(--spacing-sm);
  }
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
