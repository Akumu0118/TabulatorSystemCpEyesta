<script setup lang="ts">
import { computed } from 'vue'

/** A thin fill under a score box: how much of this criterion's weight the typed score earns. */
const props = defineProps<{ value: number | ''; max: number; weight: number; invalid?: boolean }>()
const share = computed(() =>
  props.value === '' || props.invalid ? 0 : Math.min(1, Math.max(0, props.value / (props.max || 1))))
const empty = computed(() => props.value === '' || props.invalid)
</script>

<template>
  <div class="flex items-center gap-2.5" aria-hidden="true">
    <div class="relative flex-1 h-1.5 rounded-full bg-sunken overflow-hidden">
      <div
        class="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        :style="{ width: `${share * 100}%` }"
      ></div>
    </div>
    <span class="num w-[86px] text-right text-[11px] font-semibold" :class="empty ? 'text-muted' : 'text-accent-ink'">
      {{ empty ? '–' : (share * weight).toFixed(2) }} <span class="font-normal text-muted">of {{ weight }} pts</span>
    </span>
  </div>
</template>
