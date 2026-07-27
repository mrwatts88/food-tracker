<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  onRefresh: () => Promise<void>
}>()

const TRIGGER_DISTANCE = 72
const SPINNER_DISTANCE = 56
const MAX_DISTANCE = 110
// Ignore the first few pixels so taps and horizontal swipes never read as a pull.
const SLOP = 8

const distance = ref(0)
const isRefreshing = ref(false)
const isDragging = ref(false)

let startY = 0
let startX = 0
let tracking = false

// The app hides overflow on the container, so any scrolling happens inside a nested
// list. A pull should only start when that list is already at the top.
function isAtTop(target: EventTarget | null) {
  let node = target instanceof Element ? target : null

  while (node) {
    const canScroll = node.scrollHeight > node.clientHeight
    const overflowY = getComputedStyle(node).overflowY

    if (canScroll && (overflowY === 'auto' || overflowY === 'scroll')) {
      return node.scrollTop <= 0
    }

    node = node.parentElement
  }

  return true
}

function handleTouchStart(event: TouchEvent) {
  if (isRefreshing.value || event.touches.length !== 1 || !isAtTop(event.target)) {
    return
  }

  const touch = event.touches[0]

  if (!touch) {
    return
  }

  startY = touch.clientY
  startX = touch.clientX
  tracking = true
}

function handleTouchMove(event: TouchEvent) {
  if (!tracking) {
    return
  }

  const touch = event.touches[0]

  if (!touch) {
    return
  }

  const deltaY = touch.clientY - startY
  const deltaX = touch.clientX - startX

  if (deltaY <= SLOP || Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaY < 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      tracking = false
      isDragging.value = false
      distance.value = 0
    }

    return
  }

  // Claim the gesture so the browser's own overscroll does not fight us.
  if (event.cancelable) {
    event.preventDefault()
  }

  isDragging.value = true
  // Resistance: the further you pull, the less it moves.
  const pulled = deltaY - SLOP
  distance.value = Math.min(MAX_DISTANCE, pulled * (1 - pulled / (pulled + 220)))
}

async function handleTouchEnd() {
  if (!tracking) {
    return
  }

  tracking = false
  isDragging.value = false

  if (distance.value < TRIGGER_DISTANCE || isRefreshing.value) {
    distance.value = 0
    return
  }

  isRefreshing.value = true
  distance.value = SPINNER_DISTANCE

  try {
    await props.onRefresh()
  } finally {
    isRefreshing.value = false
    distance.value = 0
  }
}
</script>

<template>
  <div
    class="pull-to-refresh"
    @touchstart.passive="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
  >
    <div
      class="indicator"
      :class="{ settled: !isDragging }"
      :style="{ height: `${distance}px`, opacity: distance > 0 ? 1 : 0 }"
    >
      <div
        class="spinner"
        :class="{ spinning: isRefreshing, ready: !isRefreshing && distance >= TRIGGER_DISTANCE }"
        :style="{ transform: isRefreshing ? undefined : `rotate(${distance * 3}deg)` }"
      />
    </div>
    <div class="content" :class="{ settled: !isDragging }">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.pull-to-refresh {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overscroll-behavior-y: contain;
}

.indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.indicator.settled,
.content.settled {
  transition: height 0.25s ease, opacity 0.25s ease;
}

.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--color-surface);
  border-top-color: var(--color-text-secondary);
  transition: border-top-color 0.15s ease;
}

.spinner.ready {
  border-top-color: var(--color-calorie-primary);
}

.spinner.spinning {
  animation: pull-spin 0.7s linear infinite;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

@keyframes pull-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .indicator.settled,
  .content.settled {
    transition: none;
  }

  .spinner.spinning {
    animation-duration: 1.4s;
  }
}
</style>
