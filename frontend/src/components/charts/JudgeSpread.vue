<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { data } from '../../store'
import { fmt } from '../../scoring'
import type { RankingRow } from '../../types'

/**
 * One dot per judge total for each entry, with the average as a tick, so disagreement between
 * judges is visible at a glance. Totals more than OUTLIER points from the average are flagged.
 */
const props = defineProps<{ rows: RankingRow[] }>()
const OUTLIER = 10

const rows = computed(() => props.rows.filter(r => r.judged > 0).map(r => ({
  ...r,
  dots: data.judges
    .filter(j => r.totals[j.id] !== undefined)
    .map(j => ({ judge: j.name, v: r.totals[j.id], off: Math.abs(r.totals[j.id] - r.avg) > OUTLIER }))
})))

const domain = computed(() => {
  const all = rows.value.flatMap(r => r.dots.map(d => d.v))
  if (!all.length) return [0, 100] as const
  let lo = Math.max(0, Math.floor((Math.min(...all) - 2) / 10) * 10)
  let hi = Math.min(100, Math.ceil((Math.max(...all) + 2) / 10) * 10)
  if (hi - lo < 20) { lo = Math.max(0, hi - 20); hi = Math.min(100, lo + 20) }
  return [lo, hi] as const
})
const x = (v: number) => ((v - domain.value[0]) / (domain.value[1] - domain.value[0])) * 100
const ticks = computed(() => {
  const [lo, hi] = domain.value
  const step = hi - lo > 40 ? 10 : 5
  return Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
})
const flagged = computed(() => rows.value.flatMap(r => r.dots.filter(d => d.off).map(d => `${d.judge} on #${r.number}`)))

const spread = ref(false)
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => { spread.value = true })))
const tip = ref<{ x: number; y: number; text: string } | null>(null)
</script>

<template>
  <section aria-labelledby="spread-title" class="card p-5 flex flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 id="spread-title" class="display text-xl font-bold">Judge agreement</h2>
        <span class="text-[13px] text-muted">Each dot is one judge's total for the entry; the bar is the average</span>
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted" aria-label="Legend">
        <li class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-ink/70"></span>Judge total</li>
        <li class="flex items-center gap-1.5"><span class="w-[3px] h-3.5 rounded bg-accent"></span>Average</li>
        <li class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-warn"></span>{{ OUTLIER }}+ points from average</li>
      </ul>
    </div>

    <p v-if="!rows.length" class="py-6 text-center text-muted">No sheets in yet.</p>
    <div v-else class="flex flex-col" @mouseleave="tip = null">
      <div class="grid grid-cols-[minmax(80px,180px)_1fr] gap-3 pb-1" aria-hidden="true">
        <span></span>
        <span class="relative h-4 num text-[11px] text-muted">
          <span v-for="t in ticks" :key="t" class="absolute -translate-x-1/2" :style="{ left: `${x(t)}%` }">{{ t }}</span>
        </span>
      </div>
      <div
        v-for="r in rows" :key="r.id" class="grid grid-cols-[minmax(80px,180px)_1fr] gap-3 items-center h-9 border-t border-line"
        :aria-label="`#${r.number} ${r.name}: average ${fmt(r.avg)}; ` + r.dots.map(d => `${d.judge} ${fmt(d.v)}`).join(', ')"
      >
        <span class="min-w-0 truncate text-sm"><span class="num text-muted mr-1.5">#{{ r.number }}</span>{{ r.name }}</span>
        <span class="relative h-full">
          <span v-for="t in ticks" :key="t" class="absolute inset-y-1 w-px bg-line" :style="{ left: `${x(t)}%` }"></span>
          <span class="absolute top-1/2 -translate-y-1/2 w-[3px] h-5 -ml-[1.5px] rounded bg-accent transition-[left] duration-700" :style="{ left: `${x(r.avg)}%` }"></span>
          <span
            v-for="(d, i) in r.dots" :key="d.judge"
            class="absolute top-1/2 w-3 h-3 -ml-1.5 -mt-1.5 rounded-full ring-2 ring-surface cursor-default"
            :class="d.off ? 'bg-warn' : 'bg-ink/70'"
            :style="{ left: `${x(spread ? d.v : r.avg)}%`, transition: `left .8s cubic-bezier(.2,.8,.2,1) ${i * 70}ms` }"
            @mousemove="tip = { x: $event.clientX, y: $event.clientY, text: `${d.judge}: ${fmt(d.v)} (${d.v >= r.avg ? '+' : '−'}${fmt(Math.abs(d.v - r.avg))} vs average)` }"
          ></span>
        </span>
      </div>
    </div>
    <p v-if="flagged.length" class="text-[13px] text-warn flex gap-2">
      <span class="font-semibold shrink-0">Worth a look:</span><span>{{ flagged.join(' · ') }}</span>
    </p>

    <Teleport to="body">
      <div v-if="tip" class="fixed z-[90] pointer-events-none card shadow-lg px-3 py-2 text-[13px] num" :style="{ left: `${tip.x + 14}px`, top: `${tip.y + 14}px` }">{{ tip.text }}</div>
    </Teleport>
  </section>
</template>
