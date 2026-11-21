<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { data } from '../../store'
import { criterionAverages, entryLabel, fmt, weighted } from '../../scoring'
import type { RankingRow, TabEvent } from '../../types'
import CountUp from '../CountUp.vue'

/**
 * Standings as stacked bars on a fixed 0–100 scale: each segment is what one criterion
 * contributes to the entry's average total. The table below the chart has the exact numbers.
 */
const props = defineProps<{ event: TabEvent; rows: RankingRow[]; note?: string; title?: string }>()
const uid = `standings-${Math.random().toString(36).slice(2, 8)}`
const lbl = (r: RankingRow) => entryLabel(props.event, r)

const crit = computed(() => props.event.criteria.map((c, i) => ({ ...c, color: `var(--c${(i % 6) + 1})` })))
const bars = computed(() => props.rows.filter(r => r.judged > 0).map(r => {
  const avgs = criterionAverages(props.event, data.judges, data.scores, r.id)
  return {
    ...r,
    parts: crit.value.map(c => ({ c, raw: avgs[c.id], pts: weighted(c, avgs[c.id] ?? 0) }))
  }
}))
const lead = computed(() => bars.value[0]?.avg ?? 0)

const grown = ref(false)
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => { grown.value = true })))

const tip = ref<{ x: number; y: number; title: string; lines: string[] } | null>(null)
function show(e: MouseEvent, title: string, lines: string[]) {
  tip.value = { x: e.clientX, y: e.clientY, title, lines }
}
const MEDAL = ['bg-gold text-surface', 'bg-[#94A3B8] text-white', 'bg-[#B87333] text-white']
</script>

<template>
  <section :aria-labelledby="uid" class="card p-5 flex flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 :id="uid" class="display text-xl font-bold">{{ title ?? 'Standings' }}</h2>
        <span class="text-[13px] text-muted">{{ note ?? 'Average total out of 100, split by what each criterion adds' }}</span>
      </div>
      <ul class="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]" aria-label="Legend">
        <li v-for="c in crit" :key="c.id" class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-[3px]" :style="{ background: c.color }"></span>{{ c.name }}
          <span class="text-muted num">{{ c.weight }}%</span>
        </li>
      </ul>
    </div>

    <p v-if="!bars.length" class="py-8 text-center text-muted">No sheets in yet. Bars appear as judges submit.</p>

    <div v-else class="flex flex-col gap-1" @mouseleave="tip = null">
      <TransitionGroup tag="ol" name="list" class="relative flex flex-col gap-1">
        <li
          v-for="(r, ri) in bars" :key="r.id"
          class="grid grid-cols-[34px_minmax(90px,200px)_1fr_64px] items-center gap-3 py-1.5 px-1 rounded-lg transition-colors"
          :class="r.rank === 1 ? 'bg-gold-soft/60' : ''"
          :aria-label="`Rank ${r.rank}, ${lbl(r)} ${r.name}, ${fmt(r.avg)} out of 100: ` + r.parts.map(p => `${p.c.name} ${fmt(p.pts)}`).join(', ')"
        >
          <span class="num w-[30px] h-[30px] rounded-full grid place-items-center text-sm font-bold"
                :class="MEDAL[r.rank - 1] ?? 'text-muted'">{{ r.rank }}</span>
          <span class="min-w-0 truncate"><span class="num text-muted mr-1.5">{{ lbl(r) }}</span><span class="font-semibold">{{ r.name }}</span></span>
          <span class="relative h-[22px] rounded-md bg-sunken overflow-hidden flex">
            <span
              v-for="(p, pi) in r.parts" :key="p.c.id"
              class="h-full border-r-2 border-surface last:border-r-0 first:rounded-l-md hover:brightness-110 cursor-default"
              :style="{
                width: grown ? `${p.pts}%` : '0%',
                background: p.c.color,
                transition: `width .9s cubic-bezier(.2,.8,.2,1) ${ri * 60 + pi * 90}ms`
              }"
              @mousemove="show($event, `${lbl(r)} ${r.name}`, [
                `${p.c.name}: average ${p.raw === null ? '–' : fmt(p.raw, 2)} / ${p.c.max_score}`,
                `adds ${fmt(p.pts)} of ${p.c.weight} points`
              ])"
            ></span>
          </span>
          <span class="text-right">
            <CountUp class="display font-bold text-[17px]" :value="r.avg" :decimals="2" :duration="1200" />
            <span v-if="r.rank > 1" class="block num text-[11px] text-muted">−{{ fmt(lead - r.avg) }}</span>
          </span>
        </li>
      </TransitionGroup>
      <div class="grid grid-cols-[34px_minmax(90px,200px)_1fr_64px] gap-3 px-1 pt-1" aria-hidden="true">
        <span></span><span></span>
        <span class="relative h-4 num text-[11px] text-muted">
          <span v-for="t in [0, 25, 50, 75, 100]" :key="t" class="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" :style="{ left: `${t}%` }">{{ t }}</span>
        </span>
        <span></span>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="tip" class="fixed z-[90] pointer-events-none card shadow-lg px-3 py-2 text-[13px] flex flex-col gap-0.5"
        :style="{ left: `${tip.x + 14}px`, top: `${tip.y + 14}px` }"
      >
        <b>{{ tip.title }}</b>
        <span v-for="l in tip.lines" :key="l" class="num text-muted">{{ l }}</span>
      </div>
    </Teleport>
  </section>
</template>
