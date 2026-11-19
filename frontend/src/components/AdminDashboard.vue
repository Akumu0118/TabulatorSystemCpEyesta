<script setup lang="ts">
import { computed, ref } from 'vue'
import { data, ui, currentEvent, rankingsFor, removeEvent, updateEvent } from '../store'
import { fmt } from '../scoring'
import type { TabEvent } from '../types'
import Icon from './Icon.vue'
import LeaderboardTable from './LeaderboardTable.vue'
import CriteriaManager from './CriteriaManager.vue'
import ContestantManager from './ContestantManager.vue'
import PrintTallyModal from './PrintTallyModal.vue'
import SetupModal from './SetupModal.vue'

const showPrint = ref(false)
const showAccess = ref(false)
const event = computed(() => currentEvent())
const rows = computed(() => rankingsFor(event.value))

/** Judges who have not yet sent a sheet for every entry of this event. */
const pendingJudges = computed(() => {
  const ev = event.value
  if (!ev || !ev.candidates.length) return []
  return data.judges.filter(j => ev.candidates.some(c => !data.scores[ev.id]?.[c.id]?.[j.id]))
})
const sheets = computed(() => {
  const ev = event.value
  if (!ev) return { done: 0, total: 0 }
  let done = 0
  for (const c of ev.candidates) for (const j of data.judges) if (data.scores[ev.id]?.[c.id]?.[j.id]) done++
  return { done, total: ev.candidates.length * data.judges.length }
})
const weightUsed = computed(() => event.value?.criteria.reduce((s, c) => s + c.weight, 0) ?? 0)

const tiles = computed(() => {
  const ev = event.value!
  const nums = ev.candidates.map(c => c.number)
  const doneJudges = data.judges.length - pendingJudges.value.length
  return [
    { label: 'Entries', value: String(ev.candidates.length), hint: nums.length ? `Numbered ${Math.min(...nums)} to ${Math.max(...nums)}` : 'Add entries below' },
    {
      label: 'Judges submitted', value: `${doneJudges} of ${data.judges.length}`,
      hint: pendingJudges.value.length ? `${pendingJudges.value.map(j => j.name).join(', ')} still scoring` : 'Every judge is done'
    },
    { label: 'Score sheets in', value: `${sheets.value.done} / ${sheets.value.total}`, hint: 'One sheet per judge per entry' },
    { label: 'Criteria weight', value: `${weightUsed.value}%`, hint: `${ev.criteria.length} criteria` }
  ]
})

const podium = computed(() => {
  const top = rows.value.filter(r => r.judged > 0).slice(0, 3)
  const lead = top[0]?.avg ?? 0
  return top.map((r, i) => ({
    ...r,
    place: ['1st', '2nd', '3rd'][i],
    gap: i === 0 ? 'Leading' : `${fmt(lead - r.avg)} behind`,
    // Visual order 2-1-3 on wider screens, 1-2-3 when stacked.
    cls: [
      'sm:order-2 bg-gold-soft border-gold sm:min-h-[210px]',
      'sm:order-1 bg-silver-soft sm:min-h-[170px]',
      'sm:order-3 bg-bronze-soft sm:min-h-[150px]'
    ][i],
    badge: i === 0 ? 'bg-gold text-surface' : 'bg-surface text-ink border border-line',
    size: ['text-[40px]', 'text-[30px]', 'text-[28px]'][i]
  }))
})

const lastSync = computed(() => {
  if (!ui.lastSync) return 'Not synced yet'
  const s = Math.max(0, Math.round((Date.now() - ui.lastSync) / 1000))
  return s < 60 ? `synced ${s} s ago` : `synced at ${new Date(ui.lastSync).toLocaleTimeString()}`
})

const del = (ev: TabEvent) => {
  if (confirm(`Delete "${ev.name}" with all its criteria, entries and scores? This cannot be undone.`)) removeEvent(ev.id)
}
</script>

<template>
  <div class="no-print flex flex-col gap-6 px-4 sm:px-6 lg:px-10 pt-5 lg:pt-7 pb-12">
    <header class="flex flex-wrap items-end gap-4">
      <button class="icon-btn lg:hidden border border-line bg-surface" aria-label="Open events menu" @click="ui.navOpen = true">
        <Icon name="menu" />
      </button>
      <div class="flex-1 basis-72 min-w-0 flex flex-col gap-1.5">
        <span class="text-[13px] text-muted">Events / {{ event?.name ?? 'None' }}</span>
        <h1 class="display text-[34px] leading-tight font-bold truncate">{{ event?.name ?? 'No events yet' }}</h1>
        <div v-if="event" class="flex flex-wrap gap-2 mt-1">
          <span class="pill" :class="event.locked ? 'bg-sunken text-muted' : 'bg-ok-soft text-ok'">
            <span class="dot"></span>{{ event.locked ? 'Scoring closed' : 'Scoring open' }}
          </span>
          <span class="pill num bg-surface border border-line text-muted font-normal">
            {{ ui.online ? 'Live' : 'Offline' }} · {{ lastSync }}
          </span>
        </div>
      </div>
      <div v-if="event" class="flex flex-wrap gap-2.5">
        <button class="btn" @click="updateEvent(event, { locked: !event.locked })">
          <Icon :name="event.locked ? 'unlock' : 'lock'" />{{ event.locked ? 'Reopen scoring' : 'Close scoring' }}
        </button>
        <button class="btn" @click="showAccess = true"><Icon name="wifi" />Judge access</button>
        <button class="btn btn-primary" @click="showPrint = true"><Icon name="print" />Print tally sheet</button>
        <button class="btn btn-danger !px-3" aria-label="Delete event" title="Delete event" @click="del(event)">
          <Icon name="trash" />
        </button>
      </div>
      <button v-else class="btn" @click="showAccess = true"><Icon name="wifi" />Judge access</button>
    </header>

    <template v-if="event">
      <section aria-label="Event summary" class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <div v-for="t in tiles" :key="t.label" class="card px-[18px] py-4 flex flex-col gap-1.5">
          <span class="text-[13px] text-muted">{{ t.label }}</span>
          <span class="display num text-[28px] font-bold">{{ t.value }}</span>
          <span class="text-xs text-muted">{{ t.hint }}</span>
        </div>
      </section>

      <section v-if="podium.length" aria-labelledby="podium-title" class="card p-5 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="podium-title" class="display text-xl font-bold">Top {{ podium.length }}</h2>
          <span class="text-[13px] text-muted">
            {{ pendingJudges.length ? `Provisional until ${pendingJudges.map(j => j.name).join(', ')} submit${pendingJudges.length > 1 ? '' : 's'}` : 'All judges have submitted' }}
          </span>
        </div>
        <ol class="grid sm:grid-cols-3 gap-4 items-end">
          <li v-for="p in podium" :key="p.id" class="flex flex-col gap-3.5 p-[18px] rounded-[14px] border border-line" :class="p.cls">
            <span class="flex items-center justify-between gap-2">
              <span class="pill !text-[13px] min-w-11 justify-center font-bold" :class="p.badge">{{ p.place }}</span>
              <span class="num text-[13px] text-muted">{{ p.gap }}</span>
            </span>
            <span class="flex flex-col gap-0.5 min-w-0">
              <span class="num text-[13px] text-muted">#{{ p.number }}</span>
              <span class="font-bold text-[17px] truncate">{{ p.name }}</span>
            </span>
            <span class="display num font-bold" :class="p.size">{{ fmt(p.avg) }}</span>
          </li>
        </ol>
      </section>

      <LeaderboardTable :event="event" :pending="pendingJudges.map(j => j.id)" />

      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-6 items-start">
        <CriteriaManager :event="event" />
        <ContestantManager :event="event" />
      </div>
    </template>

    <div v-else class="card p-10 text-center text-muted">
      No events yet. Use <strong class="text-ink">New event</strong> in the sidebar to create one.
    </div>
  </div>

  <PrintTallyModal v-if="showPrint && event" :event="event" @close="showPrint = false" />
  <SetupModal v-if="showAccess" @close="showAccess = false" />
</template>
