<script setup lang="ts">
import { computed } from 'vue'
import { useCountUp } from '../../motion'

/** The entry's total out of 100 as a ring; the number counts up as scores are typed. */
const props = withDefaults(defineProps<{ value: number | null; size?: number }>(), { size: 68 })
const shown = useCountUp(() => props.value ?? 0, 650)
const r = computed(() => (props.size - 8) / 2)
const circ = computed(() => 2 * Math.PI * r.value)
const offset = computed(() => circ.value * (1 - Math.min(100, Math.max(0, shown.value)) / 100))
</script>

<template>
  <div class="relative shrink-0" :style="{ width: `${size}px`, height: `${size}px` }" role="img"
       :aria-label="value === null ? 'Total not ready' : `Total ${value.toFixed(2)} out of 100`">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="-rotate-90">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--line)" stroke-width="6" />
      <circle
        v-if="value !== null"
        :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"
        :stroke-dasharray="circ" :stroke-dashoffset="offset"
      />
    </svg>
    <div class="absolute inset-0 grid place-items-center text-center leading-none">
      <span>
        <span class="display num block font-bold text-accent-ink" :class="size >= 68 ? 'text-[19px]' : 'text-[15px]'">
          {{ value === null ? '–' : shown.toFixed(value >= 99.995 ? 0 : 1) }}
        </span>
        <span class="block text-[9px] font-semibold tracking-[0.08em] uppercase text-muted mt-0.5">/ 100</span>
      </span>
    </div>
  </div>
</template>
