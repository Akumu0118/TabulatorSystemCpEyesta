<script setup lang="ts">
import { computed } from 'vue'
import { data, ui, rankingsFor } from '../../store'
import { criterionAverages, entryLabel, fmt, groups } from '../../scoring'
import { ago, useNow } from '../../motion'
import type { Candidate, Id, Judge, TabEvent } from '../../types'
import Icon from '../Icon.vue'
import CountUp from '../CountUp.vue'
import RankingBars from '../charts/RankingBars.vue'

/**
 * Overview: how far along the event is (sheets, tablets, closest race), the standings per
 * category, the best entry in each criterion, and what still blocks finalizing.
 */
const props = defineProps<{ event: TabEvent }>()
const emit = defineEmits<{ import: [judgeId: Id]; tab: [t: 'judges' | 'setup'] }>()
const now = useNow(2000)

const ev = computed(() => props.event)
const gs = computed(() => groups(ev.value))
const hasCats = computed(() => ev.value.categories.length > 0)
const rows = computed(() => rankingsFor(ev.value))
const has = (c: Candidate, j: Judge) => !!data.scores[ev.value.id]?.[c.id]?.[j.id]
const label = (c: Candidate) => entryLabel(ev.value, c)

const sheets = computed(() => {
  const per = gs.value.map(g => {
    let done = 0
    for (const c of g.candidates) for (const j of data.judges) if (has(c, j)) done++
    return { g, done, total: g.candidates.length * data.judges.length }
  })
  return { per, done: per.reduce((s, x) => s + x.done, 0), total: per.reduce((s, x) => s + x.total, 0) }
})

const tablets = computed(() => data.judges.map(j => {
  const seen = j.last_seen_at ? Date.parse(j.last_seen_at) : null
  const age = seen === null ? null : now.value + ui.serverOffset - seen
  return { j, age, live: age !== null && age < 30000 }
}))
const online = computed(() => tablets.value.filter(t => t.live).length)
const quiet = computed(() => tablets.value.filter(t => !t.live))

/** The smallest lead between 1st and 2nd in any category, among entries that have sheets. */
const race = computed(() => {
  let best: { gap: number; a: typeof rows.value[0]; b: typeof rows.value[0]; group: string } | null = null
  for (const g of gs.value) {
    const ids = new Set(g.candidates.map(c => c.id))
    const r = rows.value.filter(x => ids.has(x.id) && x.judged > 0)
    if (r.length < 2) continue
    const gap = r[0].avg - r[1].avg
    if (!best || gap < best.gap) best = { gap, a: r[0], b: r[1], group: g.name }
  }
  return best
})

const groupRows = (ids: Candidate[]) => {
  const set = new Set(ids.map(c => c.id))
  return rows.value.filter(r => set.has(r.id))
}
const note = computed(() => {
  if (ev.value.finalized_at) return 'Final results · average total out of 100, split by criterion'
  const left = sheets.value.total - sheets.value.done
  return left ? `Provisional: ${left} sheet${left > 1 ? 's' : ''} still to come` : 'Every sheet is in · split by what each criterion adds'
})

/** Per criterion and category: the entry with the highest average raw score (ties share). */
const bestIn = computed(() => ev.value.criteria.map((k, i) => ({
  k,
  color: `var(--c${(i % 6) + 1})`,
  per: gs.value.map(g => {
    let top: { c: Candidate; avg: number }[] = []
    for (const c of g.candidates) {
      const avg = criterionAverages(ev.value, data.judges, data.scores, c.id)[k.id]
      if (avg === null) continue
      if (!top.length || avg > top[0].avg + 1e-9) top = [{ c, avg }]
      else if (Math.abs(avg - top[0].avg) < 1e-9) top.push({ c, avg })
    }
    return { g, top }
  })
})))

/** What stands between now and Finalize: scoring still open, and each judge's missing sheets. */
const missing = computed(() => data.judges.map(j => ({
  j, list: gs.value.flatMap(g => g.candidates.filter(c => !has(c, j)))
})).filter(x => x.list.length))
const weightSum = computed(() => ev.value.criteria.reduce((s, k) => s + k.weight, 0))
</script>

<template>
  <div class="flex flex-col gap-6">
    <section aria-label="Progress" class="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      <!-- sheets received -->
      <div class="card px-5 py-[18px] flex flex-col gap-2.5 anim-fade-up">
        <span class="text-[13px] font-semibold text-muted">Score sheets received</span>
        <span class="display num text-[34px] font-bold leading-none">
          <CountUp :value="sheets.done" /><span class="text-muted text-xl font-semibold"> of {{ sheets.total }}</span>
        </span>
        <div class="flex flex-col gap-1.5">
          <div v-for="x in sheets.per" :key="x.g.id ?? 'none'" class="flex items-center gap-2.5 text-[13px]">
            <span v-if="hasCats" class="w-20 truncate font-semibold">{{ x.g.name }}</span>
            <span class="flex-1 h-2 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
              <span class="block h-full rounded-full transition-[width] duration-1000" :class="x.done >= x.total && x.total ? 'bg-ok' : 'bg-accent'" :style="{ width: `${x.total ? (x.done / x.total) * 100 : 0}%` }"></span>
            </span>
            <span class="num text-muted w-14 text-right">{{ x.done }}/{{ x.total }}</span>
          </div>
        </div>
        <span class="text-xs text-muted">One sheet per judge for every entry.</span>
      </div>

      <!-- tablets -->
      <button class="card px-5 py-[18px] flex flex-col gap-2.5 text-left hover:border-line-strong transition-colors anim-fade-up" style="--i: 1" @click="emit('tab', 'judges')">
        <span class="text-[13px] font-semibold text-muted">Judges' tablets online</span>
        <span class="display num text-[34px] font-bold leading-none">
          <CountUp :value="online" /><span class="text-muted text-xl font-semibold"> of {{ data.judges.length }}</span>
        </span>
        <span class="flex gap-1.5 flex-wrap" aria-hidden="true">
          <span v-for="t in tablets" :key="t.j.id" class="w-3 h-3 rounded-full" :class="t.live ? 'bg-ok' : t.age === null ? 'bg-line-strong' : 'bg-warn'"></span>
        </span>
        <span class="text-xs text-muted">
          <template v-if="!data.judges.length">No judges yet. Add them under Judges.</template>
          <template v-else-if="!quiet.length">Every tablet checked in within the last 30 s.</template>
          <template v-else>
            {{ quiet.slice(0, 3).map(t => `${t.j.name} (${t.age === null ? 'never connected' : 'seen ' + ago(t.age)})`).join(', ') }}<template v-if="quiet.length > 3"> and {{ quiet.length - 3 }} more</template>.
          </template>
        </span>
      </button>

      <!-- closest race -->
      <div class="card px-5 py-[18px] flex flex-col gap-2.5 anim-fade-up" style="--i: 2">
        <span class="text-[13px] font-semibold text-muted">Closest race for 1st</span>
        <template v-if="race">
          <span class="display num text-[34px] font-bold leading-none">{{ fmt(race.gap) }}<span class="text-muted text-xl font-semibold"> pts</span></span>
          <span class="text-sm">
            <b>{{ label(race.a) }} {{ race.a.name }}</b> leads <b>{{ label(race.b) }} {{ race.b.name }}</b><template v-if="race.group"> in {{ race.group }}</template>.
          </span>
          <span class="text-xs text-muted">{{ race.gap < 1 ? 'Too close to call until every sheet is in.' : 'Out of 100 points, average of all judges.' }}</span>
        </template>
        <span v-else class="text-sm text-muted">Shows once two entries in a category have sheets.</span>
      </div>
    </section>

    <!-- standings, one chart per category -->
    <div class="grid gap-6" :class="gs.length > 1 ? '2xl:grid-cols-2' : ''">
      <RankingBars
        v-for="g in gs" :key="`${ev.id}-${g.id}`" :event="ev" :rows="groupRows(g.candidates)" :note="note"
        :title="hasCats ? `Standings · ${g.name}` : 'Standings'"
      />
    </div>

    <div class="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-6 items-start">
      <!-- criterion winners -->
      <section aria-labelledby="best-title" class="card p-5 flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h2 id="best-title" class="display text-xl font-bold">Best in each criterion</h2>
          <span class="text-[13px] text-muted">Highest average score from the judges<template v-if="hasCats">, per category</template>. These are the special awards in the presentation.</span>
        </div>
        <p v-if="!ev.criteria.length" class="py-6 text-center text-muted">Add criteria under Setup.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-[0.04em] text-muted">
                <th scope="col" class="font-semibold pb-2 pr-3">Criterion</th>
                <th v-for="g in gs" :key="g.id ?? 'none'" scope="col" class="font-semibold pb-2 pr-3">{{ hasCats ? g.name : 'Leader' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in bestIn" :key="b.k.id" class="border-t border-line">
                <th scope="row" class="text-left py-2.5 pr-3 font-semibold">
                  <span class="inline-flex items-center gap-2"><span class="w-3 h-3 rounded-[3px] shrink-0" :style="{ background: b.color }"></span>{{ b.k.name }}</span>
                </th>
                <td v-for="p in b.per" :key="p.g.id ?? 'none'" class="py-2.5 pr-3">
                  <span v-if="!p.top.length" class="text-muted">–</span>
                  <span v-else class="flex flex-col">
                    <span><span class="num text-muted mr-1">{{ p.top.map(t => label(t.c)).join(' · ') }}</span><b>{{ p.top.map(t => t.c.name).join(' & ') }}</b></span>
                    <span class="num text-xs text-muted">{{ fmt(p.top[0].avg) }} / {{ b.k.max_score }}<template v-if="p.top.length > 1"> · tie</template></span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- before you can finalize -->
      <section aria-labelledby="left-title" class="card p-5 flex flex-col gap-3.5">
        <h2 id="left-title" class="display text-xl font-bold">Before you can finalize</h2>
        <ul class="flex flex-col gap-2.5 text-sm">
          <li v-if="ev.finalized_at" class="flex items-center gap-2.5 text-ok font-semibold"><Icon name="check" />Results are final.</li>
          <template v-else>
            <li class="flex items-start gap-2.5">
              <Icon :name="ev.locked ? 'check' : 'alert'" :class="ev.locked ? 'text-ok' : 'text-warn'" class="shrink-0 mt-0.5" />
              <span>{{ ev.locked ? 'Scoring is closed.' : 'Scoring is still open. Judges can keep changing sheets.' }}</span>
            </li>
            <li class="flex items-start gap-2.5">
              <Icon :name="weightSum === 100 ? 'check' : 'alert'" :class="weightSum === 100 ? 'text-ok' : 'text-warn'" class="shrink-0 mt-0.5" />
              <span>
                <template v-if="weightSum === 100">Criteria weights add up to 100%.</template>
                <template v-else>Criteria weights add up to {{ weightSum }}%. <button class="underline font-semibold" @click="emit('tab', 'setup')">Fix in Setup</button></template>
              </span>
            </li>
            <li v-if="!missing.length && data.judges.length" class="flex items-start gap-2.5">
              <Icon name="check" class="text-ok shrink-0 mt-0.5" /><span>Every judge sent every sheet.</span>
            </li>
            <li v-for="m in missing" :key="m.j.id" class="flex items-start gap-2.5">
              <Icon name="alert" class="text-warn shrink-0 mt-0.5" />
              <span class="flex-1 min-w-0">
                <b>{{ m.j.name }}</b> is missing {{ m.list.length }}:
                <span class="num text-muted">{{ m.list.slice(0, 8).map(label).join(', ') }}<template v-if="m.list.length > 8">…</template></span>
              </span>
              <button v-if="!ev.finalized_at" class="btn !min-h-8 !px-2.5 !text-xs shrink-0" @click="emit('import', m.j.id)"><Icon name="plus" :size="14" />Import</button>
            </li>
          </template>
        </ul>
      </section>
    </div>
  </div>
</template>
