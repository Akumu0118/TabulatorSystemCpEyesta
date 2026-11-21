<script setup lang="ts">
import { computed } from 'vue'
import { data, rankingsFor } from '../store'
import { criterionAverages, entryLabel, fmt, groups } from '../scoring'
import type { Id, TabEvent } from '../types'

const props = defineProps<{ event: TabEvent; pending: Id[] }>()
/** With categories, the top row of each category carries the category name for a header row. */
const rows = computed(() => {
  const list = rankingsFor(props.event)
  const first = new Map<number, string>()
  if (props.event.categories.length) {
    for (const g of groups(props.event)) {
      const r = list.find(x => g.candidates.some(c => c.id === x.id))
      if (r) first.set(r.id, g.name)
    }
  }
  return list.map(r => ({
    ...r,
    label: entryLabel(props.event, r),
    groupStart: first.get(r.id) ?? '',
    crit: criterionAverages(props.event, data.judges, data.scores, r.id)
  }))
})
const pendingNames = computed(() => data.judges.filter(j => props.pending.includes(j.id)).map(j => j.name))
</script>

<template>
  <section aria-labelledby="lb-title" class="card overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-[18px] border-b border-line">
      <div class="flex flex-col gap-1">
        <h2 id="lb-title" class="display text-xl font-bold">Full ranking</h2>
        <span class="text-[13px] text-muted">Weighted totals out of 100, averaged across judges who submitted</span>
      </div>
      <span v-if="pendingNames.length" class="pill bg-warn-soft text-warn">
        {{ pendingNames.join(', ') }} {{ pendingNames.length > 1 ? 'have' : 'has' }} not finished
      </span>
      <span v-else-if="rows.length" class="pill bg-ok-soft text-ok"><span class="dot"></span>All sheets in</span>
    </div>

    <p v-if="!rows.length" class="px-5 py-10 text-center text-muted">
      No entries yet. Add them in the <strong class="text-ink">Entries</strong> panel below.
    </p>

    <div v-else class="overflow-x-auto">
      <table class="num w-full min-w-[760px] border-collapse text-[15px]">
        <thead>
          <tr class="text-left text-xs tracking-[0.06em] uppercase text-muted">
            <th scope="col" class="px-5 py-3 font-semibold w-16">Rank</th>
            <th scope="col" class="px-2 py-3 font-semibold">Entry</th>
            <th v-for="c in event.criteria" :key="c.id" scope="col" class="px-2 py-3 font-semibold text-right whitespace-nowrap" :title="`${c.name}: average raw score out of ${c.max_score}, counts ${c.weight}%`">
              {{ c.name }}
              <span class="block normal-case tracking-normal font-normal">/ {{ c.max_score }} · {{ c.weight }}%</span>
            </th>
            <th v-for="j in data.judges" :key="j.id" scope="col" class="px-2 py-3 font-semibold text-right whitespace-nowrap">{{ j.name }}</th>
            <th scope="col" class="px-5 py-3 font-semibold text-right">Average</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rows" :key="r.id">
          <tr v-if="r.groupStart" class="border-t border-line bg-ground">
            <th :colspan="3 + event.criteria.length + data.judges.length" scope="colgroup" class="px-5 py-2 text-left text-[13px] font-bold">{{ r.groupStart }}</th>
          </tr>
          <tr
            class="border-t border-line"
            :class="r.rank === 1 && r.judged ? 'bg-gold-soft' : ''"
          >
            <td class="px-5 py-3.5">
              <span
                class="inline-grid place-items-center w-[30px] h-[30px] rounded-full font-bold"
                :class="r.rank === 1 && r.judged ? 'bg-gold text-surface' : 'text-muted'"
              >{{ r.rank }}</span>
            </td>
            <td class="px-2 py-3.5"><span class="text-muted mr-2">{{ r.label }}</span><span class="font-semibold">{{ r.name }}</span></td>
            <td v-for="c in event.criteria" :key="c.id" class="px-2 py-3.5 text-right text-muted">
              {{ r.crit[c.id] === null ? '–' : fmt(r.crit[c.id]!, 1) }}
            </td>
            <td v-for="j in data.judges" :key="j.id" class="px-2 py-3.5 text-right">
              <template v-if="r.totals[j.id] !== undefined">{{ fmt(r.totals[j.id]) }}</template>
              <span v-else class="pill !text-xs !py-0.5 bg-warn-soft text-warn">Pending</span>
            </td>
            <td class="px-5 py-3.5 text-right display font-bold text-lg">{{ r.judged ? fmt(r.avg) : '–' }}</td>
          </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-if="rows.length" class="px-5 py-3 border-t border-line text-[13px] text-muted">
      Criterion columns show the judges' average raw score before weighting. Each judge total = sum of (score ÷ highest score × weight).
    </p>
  </section>
</template>
