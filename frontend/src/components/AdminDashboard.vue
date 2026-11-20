<script setup lang="ts">
import { computed, ref } from 'vue'
import { data, ui, currentEvent, rankingsFor, removeEvent, updateEvent } from '../store'
import { askConfirm } from '../confirm'
import type { Id, TabEvent } from '../types'
import Icon from './Icon.vue'
import CountUp from './CountUp.vue'
import LeaderboardTable from './LeaderboardTable.vue'
import CriteriaManager from './CriteriaManager.vue'
import ContestantManager from './ContestantManager.vue'
import PrintTallyModal from './PrintTallyModal.vue'
import SetupModal from './SetupModal.vue'
import ImportSheets from './ImportSheets.vue'
import FinalizeDialog from './FinalizeDialog.vue'
import RankingBars from './charts/RankingBars.vue'
import JudgeSpread from './charts/JudgeSpread.vue'
import JudgeSyncPanel from './charts/JudgeSyncPanel.vue'

const showPrint = ref(false)
const showAccess = ref(false)
const showFinalize = ref(false)
/** undefined = closed; null = open without a judge picked */
const importFor = ref<Id | null | undefined>(undefined)
function present() {
  showFinalize.value = false
  if (event.value) location.hash = `#/present/${event.value.id}/presenter`
}
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
  const share = (a: number, b: number) => (b ? a / b : 0)
  return [
    { label: 'Entries', n: ev.candidates.length, of: undefined, suffix: '', bar: null, hint: nums.length ? `Numbered ${Math.min(...nums)} to ${Math.max(...nums)}` : 'Add entries below' },
    {
      label: 'Judges submitted', n: doneJudges, of: data.judges.length, suffix: '', bar: share(doneJudges, data.judges.length),
      hint: pendingJudges.value.length ? `${pendingJudges.value.map(j => j.name).join(', ')} still scoring` : 'Every judge is done'
    },
    { label: 'Score sheets in', n: sheets.value.done, of: sheets.value.total, suffix: '', bar: share(sheets.value.done, sheets.value.total), hint: 'One sheet per judge per entry' },
    { label: 'Criteria weight', n: weightUsed.value, of: undefined, suffix: '%', bar: weightUsed.value / 100, hint: `${ev.criteria.length} criteria` }
  ]
})

const standingsNote = computed(() => {
  if (event.value?.finalized_at) return 'Final results · average total out of 100, split by criterion'
  if (pendingJudges.value.length) return `Provisional until ${pendingJudges.value.map(j => j.name).join(', ')} submit${pendingJudges.value.length > 1 ? '' : 's'}`
  return 'All judges have submitted · split by what each criterion adds'
})

const lastSync = computed(() => {
  if (!ui.lastSync) return 'Not synced yet'
  const s = Math.max(0, Math.round((Date.now() - ui.lastSync) / 1000))
  return s < 60 ? `synced ${s} s ago` : `synced at ${new Date(ui.lastSync).toLocaleTimeString()}`
})

const del = async (ev: TabEvent) => {
  const ok = await askConfirm({
    title: `Delete "${ev.name}"?`,
    message: 'All its criteria, entries and scores are deleted too. This cannot be undone.',
    confirmLabel: 'Delete event', danger: true
  })
  if (ok) await removeEvent(ev.id)
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
          <span v-if="event.finalized_at" class="pill bg-gold-soft text-gold anim-pop"><Icon name="check" :size="14" />Results final</span>
          <span class="pill num bg-surface border border-line text-muted font-normal">
            {{ ui.online ? 'Live' : 'Offline' }} · {{ lastSync }}
          </span>
        </div>
      </div>
      <div v-if="event" class="flex flex-wrap gap-2.5">
        <button
          class="btn" :disabled="!!event.finalized_at" :title="event.finalized_at ? 'Reopen the results first' : undefined"
          @click="updateEvent(event, { locked: !event.locked })"
        >
          <Icon :name="event.locked ? 'unlock' : 'lock'" />{{ event.locked ? 'Reopen scoring' : 'Close scoring' }}
        </button>
        <button class="btn" @click="showAccess = true"><Icon name="wifi" />Judge access</button>
        <button class="btn" :disabled="!!event.finalized_at" @click="importFor = null"><Icon name="plus" />Import sheets</button>
        <button class="btn" @click="showPrint = true"><Icon name="print" />Print</button>
        <button v-if="!event.finalized_at" class="btn btn-primary" @click="showFinalize = true"><Icon name="check" />Finalize results</button>
        <template v-else>
          <button class="btn" @click="showFinalize = true">Results final</button>
          <button class="btn btn-primary" @click="present">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>Present results
          </button>
        </template>
        <button class="btn btn-danger !px-3" aria-label="Delete event" title="Delete event" @click="del(event)">
          <Icon name="trash" />
        </button>
      </div>
      <button v-else class="btn" @click="showAccess = true"><Icon name="wifi" />Judge access</button>
    </header>

    <template v-if="event">
      <section aria-label="Event summary" class="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <div v-for="(t, i) in tiles" :key="t.label" class="card px-[18px] py-4 flex flex-col gap-1.5 anim-fade-up" :style="{ '--i': i }">
          <span class="text-[13px] text-muted">{{ t.label }}</span>
          <span class="display num text-[28px] font-bold leading-tight">
            <CountUp :value="t.n" /><template v-if="t.of !== undefined"><span class="text-muted text-xl font-semibold"> / <CountUp :value="t.of" /></span></template>{{ t.suffix }}
          </span>
          <span v-if="t.bar !== null" class="h-1.5 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
            <span class="block h-full rounded-full transition-[width] duration-1000 ease-out" :class="t.bar >= 1 ? 'bg-ok' : 'bg-accent'" :style="{ width: `${Math.min(1, t.bar) * 100}%` }"></span>
          </span>
          <span class="text-xs text-muted">{{ t.hint }}</span>
        </div>
      </section>

      <RankingBars :key="event.id" :event="event" :rows="rows" :note="standingsNote" />

      <div class="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <JudgeSpread :key="event.id" :rows="rows" />
        <JudgeSyncPanel :event="event" @import="id => (importFor = id)" />
      </div>

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
  <FinalizeDialog v-if="showFinalize && event" :event="event" @close="showFinalize = false" @import="id => (importFor = id)" @present="present" />
  <ImportSheets v-if="importFor !== undefined && event" :event="event" :judge-id="importFor" @close="importFor = undefined" />
</template>
