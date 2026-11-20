<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { data, ui, currentEvent, logout, submitScores, syncNow } from '../store'
import { fmt, parseScore, scoreError, weighted } from '../scoring'
import { ago, useNow } from '../motion'
import type { HandoverPayload } from '../handover'
import type { Candidate, Criterion, Id, ScoreRow } from '../types'
import Icon from './Icon.vue'
import ScoreBar from './charts/ScoreBar.vue'
import TotalRing from './charts/TotalRing.vue'
import JudgeHandover from './JudgeHandover.vue'
import JudgeCodeScreen from './JudgeCodeScreen.vue'

type View = 'one' | 'all' | 'sheets' | 'handover'
type Status = 'sent' | 'waiting' | 'draft' | 'empty'

const view = ref<View>('one')
const event = computed(() => currentEvent())
const criteria = computed(() => event.value?.criteria ?? [])
const candidates = computed(() => [...(event.value?.candidates ?? [])].sort((a, b) => a.number - b.number))
const judgeId = computed(() => ui.session?.id)
const locked = computed(() => !!event.value?.locked)

/* ---- drafts: typed but not yet submitted; kept on this phone across reloads ---- */
const DRAFT_KEY = `tab_draft_${ui.session?.id ?? 'x'}`
const draft = ref<Record<string, number | ''>>(readDrafts())
function readDrafts() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Record<string, number | ''> } catch { return {} }
}
watch(draft, d => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage full */ } }, { deep: true })

const key = (cId: Id, kId: Id) => `${event.value?.id}:${cId}:${kId}`
const saved = (cId: Id, kId: Id): number | '' =>
  (event.value && judgeId.value !== undefined ? data.scores[event.value.id]?.[cId]?.[judgeId.value]?.[kId] : undefined) ?? ''

function getScore(cId: Id, kId: Id): number | '' {
  const k = key(cId, kId)
  return k in draft.value ? draft.value[k] : saved(cId, kId)
}
function setScore(cId: Id, kId: Id, raw: string) {
  const v = parseScore(raw)
  const k = key(cId, kId)
  if (v === saved(cId, kId)) delete draft.value[k]
  else draft.value[k] = v
}
const errorFor = (cId: Id, k: Criterion) => scoreError(k, getScore(cId, k.id))
const filledCount = (cId: Id) => criteria.value.filter(k => getScore(cId, k.id) !== '' && !errorFor(cId, k)).length
const rowReady = (cId: Id) => criteria.value.length > 0 && filledCount(cId) === criteria.value.length
const rowDirty = (cId: Id) => criteria.value.some(k => key(cId, k.id) in draft.value)

function rowTotalNum(cId: Id): number | null {
  if (!rowReady(cId)) return null
  return criteria.value.reduce((sum, k) => sum + weighted(k, Number(getScore(cId, k.id))), 0)
}
function rowTotal(cId: Id): string {
  const t = rowTotalNum(cId)
  return t === null ? '–' : fmt(t)
}

function status(cId: Id): Status {
  if (rowDirty(cId)) return 'draft'
  const ev = event.value
  if (ev && ui.pending.some(p => p.eventId === ev.id && p.candidateId === cId && p.judgeId === judgeId.value)) return 'waiting'
  if (ev && judgeId.value !== undefined && data.scores[ev.id]?.[cId]?.[judgeId.value]) return 'sent'
  return 'empty'
}
const STATUS_TEXT: Record<Status, string> = {
  sent: 'Sent to tabulator',
  waiting: 'Saved here, waiting for the tabulator',
  draft: 'Changed, not submitted yet',
  empty: 'Not scored yet'
}
const STATUS_CLS: Record<Status, string> = {
  sent: 'text-ok font-semibold', waiting: 'text-warn font-semibold', draft: 'text-accent-ink font-semibold', empty: 'text-muted'
}

/** Sheets that are complete and changed since the last submit. */
const readyToSend = computed(() => candidates.value.filter(c => rowDirty(c.id) && rowReady(c.id)))
const complete = computed(() => candidates.value.filter(c => rowReady(c.id)).length)
const waitingCount = computed(() => ui.pending.filter(p => p.judgeId === judgeId.value).length)

function submitReady() {
  const ev = event.value
  if (!ev || ev.locked || !readyToSend.value.length) return
  const rows: ScoreRow[] = readyToSend.value.map(c => ({
    candidateId: c.id,
    scores: Object.fromEntries(criteria.value.map(k => [k.id, Number(getScore(c.id, k.id))]))
  }))
  submitScores(ev.id, rows)
  for (const { candidateId } of rows) for (const k of criteria.value) delete draft.value[key(candidateId, k.id)]
}

/* ---- sync status ---- */
const now = useNow()
const syncState = computed(() => ui.syncing ? 'syncing' : ui.online ? 'ok' : 'off')
const syncText = computed(() => {
  if (ui.syncing) return 'Syncing…'
  if (ui.online) return ui.lastSync ? `Synced · ${ago(now.value - ui.lastSync)}` : 'Connected'
  return waitingCount.value ? `Offline · ${waitingCount.value} waiting` : 'Offline'
})
const retryIn = computed(() => ui.nextRetry ? Math.max(0, Math.ceil((ui.nextRetry - now.value) / 1000)) : null)
const lastSyncText = computed(() => ui.lastSync ? ago(now.value - ui.lastSync) : 'not yet')

/** Sheet progress for the segmented bar and the stacked summary. */
const counts = computed(() => {
  const c = { sent: 0, waiting: 0, draft: 0, empty: 0 }
  for (const x of candidates.value) c[status(x.id)]++
  return c
})
const SEG_CLS: Record<Status, string> = { sent: 'bg-[#34D399]', waiting: 'bg-[#FB923C]', draft: 'bg-[#7A9BFF]', empty: 'bg-[#334155]' }

/** Every sheet this phone has for the event; unsent ones carry their capture time, sent ones lose to the server's copy. */
const handoverPayload = computed<HandoverPayload | null>(() => {
  const ev = event.value
  const jId = judgeId.value
  if (!ev || jId === undefined) return null
  const sheets: HandoverPayload['sheets'] = []
  for (const c of candidates.value) {
    const p = ui.pending.find(x => x.eventId === ev.id && x.candidateId === c.id && x.judgeId === jId)
    const s = p?.scores ?? data.scores[ev.id]?.[c.id]?.[jId]
    if (s) sheets.push({ candidateId: c.id, capturedAt: p?.capturedAt ?? 1, scores: { ...s } })
  }
  return { judgeId: jId, eventId: ev.id, sheets }
})

/* ---- keep the phone usable: no accidental reload, no screen sleep ---- */
const hasUnsaved = () => waitingCount.value > 0 || Object.keys(draft.value).length > 0
function guard(e: BeforeUnloadEvent) {
  if (!hasUnsaved()) return
  e.preventDefault()
  e.returnValue = ''
}
type WakeLock = { release: () => Promise<void> }
let wake: WakeLock | null = null
async function keepAwake() {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }
  if (document.visibilityState !== 'visible' || !nav.wakeLock) return
  try { wake = await nav.wakeLock.request('screen') } catch { /* not allowed (plain http or low battery) */ }
}
const prevOverscroll = document.documentElement.style.overscrollBehaviorY
onMounted(() => {
  window.addEventListener('beforeunload', guard)
  document.addEventListener('visibilitychange', keepAwake)
  document.documentElement.style.overscrollBehaviorY = 'none' // no pull-to-refresh
  void keepAwake()
})
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', guard)
  document.removeEventListener('visibilitychange', keepAwake)
  document.documentElement.style.overscrollBehaviorY = prevOverscroll
  void wake?.release().catch(() => {})
})

/* ---- one-by-one navigation ---- */
const idx = ref(0)
const dir = ref(1)
watch(idx, (n, o) => { dir.value = n >= o ? 1 : -1 })
watch(candidates, list => {
  if (idx.value >= list.length) idx.value = Math.max(0, list.length - 1)
}, { immediate: true })
watch(() => event.value?.id, () => {
  // Start on the first entry that still needs scores.
  const first = candidates.value.findIndex(c => !rowReady(c.id))
  idx.value = first === -1 ? 0 : first
}, { immediate: true })
const cur = computed<Candidate | undefined>(() => candidates.value[idx.value])

const chipCls = (c: Candidate, i: number) => {
  if (i === idx.value) return 'bg-accent text-white border-transparent'
  const s = status(c.id)
  if (s === 'sent') return 'bg-[#10302A] text-[#6EE7B7] border-[#2F6B55]'
  if (s === 'waiting') return 'bg-[#3A220F] text-[#FDBA74] border-[#7A4A1F]'
  if (s === 'draft') return 'bg-transparent text-white border-[#7A9BFF]'
  return 'bg-transparent text-side-ink border-[#334155]'
}
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-ground text-ink">
    <header class="bg-side text-side-ink">
      <div class="max-w-[640px] mx-auto px-5 pt-5 pb-4 flex flex-col gap-3.5">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0 flex flex-col gap-0.5">
            <span class="text-xs text-side-muted truncate">{{ ui.session?.name }}<template v-if="event"> · {{ event.name }}</template></span>
            <h1 class="display text-[22px] font-bold">{{ view === 'sheets' ? 'Your sheets' : view === 'handover' ? 'Hand over' : 'Score sheet' }}</h1>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              class="pill !text-xs !min-h-9 transition-colors duration-300"
              :class="syncState === 'off' ? 'bg-[#3A220F] text-[#FDBA74]' : 'bg-[#10302A] text-[#6EE7B7]'"
              :title="syncState === 'off' && retryIn !== null ? `Trying again in ${retryIn} s. Tap to try now.` : 'Tap to sync now'"
              aria-live="polite"
              @click="syncNow()"
            >
              <Icon v-if="syncState === 'syncing'" name="refresh" :size="13" class="anim-spin" />
              <span v-else class="dot" :class="syncState === 'ok' ? 'ping text-[#34D399]' : 'anim-pulse text-[#FB923C]'"></span>
              <span class="num">{{ syncText }}</span>
            </button>
            <button class="icon-btn !text-side-muted hover:!bg-side-active" aria-label="Log out" title="Log out" @click="logout">
              <Icon name="out" />
            </button>
          </div>
        </div>

        <label v-if="data.events.length > 1" class="flex items-center gap-2 text-xs text-side-muted">
          Event
          <select
            class="flex-1 h-11 rounded-[10px] bg-side-active border border-side-line px-3 text-sm font-semibold text-side-ink"
            :value="event?.id"
            @change="ui.activeEvent = Number(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="e in data.events" :key="e.id" :value="e.id">{{ e.name }}{{ e.locked ? ' (closed)' : '' }}</option>
          </select>
        </label>

        <div v-if="view === 'one' || view === 'all'" role="tablist" aria-label="Scoring view" class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-side-active">
          <button
            v-for="v in (['one', 'all'] as const)" :key="v" role="tab" :aria-selected="view === v"
            class="h-10 rounded-[9px] text-sm font-semibold"
            :class="view === v ? 'bg-white text-[#0F172A]' : 'text-side-muted'"
            @click="view = v"
          >{{ v === 'one' ? 'One by one' : 'All entries' }}</button>
        </div>

        <nav v-if="view === 'one' && candidates.length" aria-label="Entries" class="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          <button
            v-for="(c, i) in candidates" :key="c.id"
            class="display shrink-0 min-w-12 h-11 px-2 rounded-[10px] border font-bold text-base"
            :class="chipCls(c, i)"
            :aria-current="i === idx ? 'step' : undefined"
            :aria-label="`Entry ${c.number}, ${STATUS_TEXT[status(c.id)]}`"
            @click="idx = i"
          >{{ c.number }}</button>
        </nav>

        <button
          v-if="candidates.length && criteria.length && view !== 'handover'"
          class="flex flex-col gap-1.5 text-left" :aria-label="`${counts.sent} sent, ${counts.waiting} waiting, ${counts.draft} changed, ${counts.empty} not scored. See status.`"
          @click="view = 'sheets'"
        >
          <span class="flex gap-[2px] h-1.5 w-full" aria-hidden="true">
            <span
              v-for="c in candidates" :key="c.id"
              class="flex-1 first:rounded-l-full last:rounded-r-full transition-colors duration-500"
              :class="SEG_CLS[status(c.id)]"
            ></span>
          </span>
          <span class="num flex justify-between text-[11px] text-side-muted">
            <span>{{ counts.sent }} sent<template v-if="counts.waiting"> · {{ counts.waiting }} waiting</template></span>
            <span>{{ candidates.length - counts.empty }} of {{ candidates.length }} scored</span>
          </span>
        </button>
      </div>
    </header>
    <JudgeCodeScreen v-if="ui.needsCode && view !== 'handover'" @handover="view = 'handover'" />

    <main class="flex-1 w-full max-w-[640px] mx-auto px-4 pt-4 pb-4 flex flex-col gap-3">
      <Transition name="fade">
        <div v-if="!ui.online && waitingCount && view !== 'handover'" role="status" class="flex gap-3 items-start px-4 py-3.5 rounded-[14px] bg-warn-soft text-warn text-sm leading-normal">
          <Icon name="wifiOff" :size="22" class="shrink-0 mt-px" />
          <span class="flex-1 flex flex-col gap-2">
            <span><strong>{{ waitingCount }} sheet{{ waitingCount > 1 ? 's are' : ' is' }} saved on this phone.</strong> They're sent automatically when the phone is back on the event Wi-Fi<template v-if="retryIn !== null"> (next try in {{ retryIn }} s)</template>.</span>
            <span class="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
              <button class="underline underline-offset-2" @click="syncNow()">Try now</button>
              <button class="underline underline-offset-2" @click="view = 'handover'">Hand over by QR</button>
            </span>
          </span>
        </div>
      </Transition>
      <div v-if="locked" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-sunken text-muted text-sm font-semibold">
        <Icon name="lock" class="shrink-0" />Scoring is closed for this event. Your scores can no longer be changed.
      </div>

      <div v-if="!event" class="card p-8 text-center text-muted">No events yet. Wait for the tabulator to set one up.</div>
      <div v-else-if="!criteria.length || !candidates.length" class="card p-8 text-center text-muted">
        Waiting for the tabulator to add criteria and entries for this event.
      </div>

      <!-- One by one -->
      <template v-else-if="view === 'one' && cur">
        <div class="relative overflow-hidden -mx-1 px-1" :style="{ '--slide-from': `${dir * 28}px` }">
        <Transition name="slide" mode="out-in">
        <section :key="cur.id" aria-labelledby="entry-name" class="card p-4 flex flex-col gap-3.5">
          <div class="flex items-center gap-3">
            <span class="display num w-12 h-12 rounded-xl bg-accent-soft text-accent-ink grid place-items-center text-xl font-bold shrink-0">#{{ cur.number }}</span>
            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <h2 id="entry-name" class="text-lg font-bold truncate">{{ cur.name }}</h2>
              <span class="num text-[13px] text-muted">{{ filledCount(cur.id) }} of {{ criteria.length }} criteria scored</span>
            </div>
            <TotalRing :value="rowTotalNum(cur.id)" />
          </div>

          <div v-for="(k, ki) in criteria" :key="k.id" class="flex flex-col gap-2 pt-3 border-t border-line anim-fade-up" :style="{ '--i': ki }">
          <div class="flex items-center gap-3">
            <div class="flex-1 min-w-0 flex flex-col gap-1">
              <label :for="`score-${k.id}`" class="font-semibold">{{ k.name }}</label>
              <span :id="`hint-${k.id}`" class="num text-xs" :class="errorFor(cur.id, k) ? 'text-danger' : 'text-muted'">
                {{ errorFor(cur.id, k) || `Counts ${k.weight}% of the total` }}
              </span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <input
                :id="`score-${k.id}`"
                class="score-input w-[92px]" :class="{ filled: getScore(cur.id, k.id) !== '' }"
                type="number" inputmode="decimal" min="0" :max="k.max_score" step="any" placeholder="–"
                :value="getScore(cur.id, k.id)" :disabled="locked"
                :aria-invalid="!!errorFor(cur.id, k)" :aria-describedby="`hint-${k.id}`"
                @input="setScore(cur.id, k.id, ($event.target as HTMLInputElement).value)"
              />
              <span class="num w-11 text-[15px] font-semibold text-muted">/ {{ k.max_score }}</span>
            </div>
          </div>
          <ScoreBar :value="getScore(cur.id, k.id)" :max="k.max_score" :weight="k.weight" :invalid="!!errorFor(cur.id, k)" />
          </div>
        </section>
        </Transition>
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <button class="btn btn-lg !text-[15px]" :disabled="idx === 0" @click="idx--">Previous</button>
          <button class="btn btn-lg !text-[15px]" :disabled="idx === candidates.length - 1" @click="idx++">Next entry</button>
        </div>
      </template>

      <!-- All entries -->
      <template v-else-if="view === 'all'">
        <p class="mx-1 text-[13px] text-muted leading-normal">
          Score every entry on one screen. The highest score for each criterion is under its name; the total out of 100 is worked out for you.
        </p>
        <section aria-label="All entries" class="card overflow-x-auto">
          <table class="num w-full border-collapse table-fixed" :style="{ minWidth: `${110 + criteria.length * 72}px` }">
            <thead>
              <tr class="text-[11px] font-semibold tracking-[0.04em] uppercase text-muted">
                <th scope="col" class="w-[52px] pl-2.5 pt-2.5 pb-2 text-left font-semibold">No.</th>
                <th v-for="k in criteria" :key="k.id" scope="col" class="px-0.5 pt-2.5 pb-2 font-semibold" :title="`${k.name}, out of ${k.max_score}, counts ${k.weight}%`">
                  <span class="block truncate">{{ k.name }}</span>
                  <span class="block text-[11px] tracking-normal normal-case">/ {{ k.max_score }}</span>
                </th>
                <th scope="col" class="w-[62px] pr-2.5 pl-0.5 pt-2.5 pb-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in candidates" :key="c.id" class="border-t border-line">
                <th scope="row" class="pl-2.5 py-2 text-left">
                  <span
                    class="display w-[34px] h-[34px] rounded-[9px] grid place-items-center text-[15px] font-bold"
                    :class="status(c.id) === 'sent' ? 'bg-ok-soft text-ok' : status(c.id) === 'waiting' ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-ink'"
                    :title="STATUS_TEXT[status(c.id)]"
                  >{{ c.number }}</span>
                </th>
                <td v-for="k in criteria" :key="k.id" class="px-[3px] py-2">
                  <input
                    class="score-input !h-11 !text-[17px] !rounded-[9px] w-full" :class="{ filled: getScore(c.id, k.id) !== '' }"
                    type="number" inputmode="decimal" min="0" :max="k.max_score" step="any" placeholder="–"
                    :value="getScore(c.id, k.id)" :disabled="locked"
                    :aria-label="`Entry ${c.number}, ${k.name}, out of ${k.max_score}`"
                    :aria-invalid="!!errorFor(c.id, k)" :title="errorFor(c.id, k) || undefined"
                    @input="setScore(c.id, k.id, ($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td class="pr-2.5 pl-0.5 py-2 text-right display font-bold text-[15px]" :class="rowReady(c.id) ? 'text-accent-ink' : 'text-muted'">
                  {{ rowTotal(c.id) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <p v-if="candidates.some(c => criteria.some(k => errorFor(c.id, k)))" role="alert" class="mx-1 flex items-center gap-2 text-sm text-danger">
          <Icon name="alert" :size="16" />Boxes outlined in red are above the highest score. Fix them before submitting.
        </p>
      </template>

      <!-- Sheet status -->
      <template v-else-if="view === 'sheets'">
        <section aria-labelledby="sync-title" class="card p-4 flex flex-col gap-3.5 anim-fade-up">
          <div class="flex items-center justify-between gap-3">
            <div class="flex flex-col gap-0.5">
              <h2 id="sync-title" class="font-bold">{{ ui.online ? 'Connected to the tabulator' : 'Not connected right now' }}</h2>
              <span class="num text-[13px] text-muted">
                Last synced {{ lastSyncText }}<template v-if="!ui.online && retryIn !== null"> · next try in {{ retryIn }} s</template>
              </span>
            </div>
            <button class="btn shrink-0" :disabled="ui.syncing" @click="syncNow()">
              <Icon name="refresh" :size="16" :class="{ 'anim-spin': ui.syncing }" />{{ ui.syncing ? 'Syncing' : 'Sync now' }}
            </button>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex h-3 w-full gap-[2px] rounded-full overflow-hidden bg-sunken" role="img"
                 :aria-label="`${counts.sent} sent, ${counts.waiting} waiting, ${counts.draft} changed, ${counts.empty} to do`">
              <span class="bg-ok transition-[flex-grow] duration-700" :style="{ flexGrow: counts.sent }"></span>
              <span class="bg-warn transition-[flex-grow] duration-700" :style="{ flexGrow: counts.waiting }"></span>
              <span class="bg-accent transition-[flex-grow] duration-700" :style="{ flexGrow: counts.draft }"></span>
              <span class="bg-line-strong transition-[flex-grow] duration-700" :style="{ flexGrow: counts.empty }"></span>
            </div>
            <ul class="num flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden="true">
              <li class="flex items-center gap-1.5"><span class="dot text-ok"></span>{{ counts.sent }} sent</li>
              <li class="flex items-center gap-1.5"><span class="dot text-warn"></span>{{ counts.waiting }} waiting</li>
              <li class="flex items-center gap-1.5"><span class="dot text-accent"></span>{{ counts.draft }} changed</li>
              <li class="flex items-center gap-1.5"><span class="dot text-line-strong"></span>{{ counts.empty }} to do</li>
            </ul>
          </div>
          <button class="btn" @click="view = 'handover'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></svg>
            Hand over by QR code
          </button>
        </section>

        <section aria-labelledby="sheets-title" class="card overflow-hidden">
          <h2 id="sheets-title" class="px-4 py-3.5 text-sm font-semibold text-muted border-b border-line">{{ event.name }} · {{ candidates.length }} entries</h2>
          <ul>
            <li v-for="(c, i) in candidates" :key="c.id" class="flex items-center gap-3 px-4 py-3 anim-fade-up" :class="{ 'border-t border-line': i > 0 }" :style="{ '--i': i }">
              <span class="num w-9 h-9 rounded-[10px] bg-accent-soft text-accent-ink grid place-items-center font-bold text-sm shrink-0">{{ c.number }}</span>
              <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                <span class="font-semibold truncate">{{ c.name }}</span>
                <span class="text-[13px]" :class="STATUS_CLS[status(c.id)]">{{ STATUS_TEXT[status(c.id)] }}</span>
              </span>
              <TotalRing :value="rowTotalNum(c.id)" :size="48" />
            </li>
          </ul>
        </section>
        <button class="btn btn-lg" @click="view = 'one'">Back to scoring</button>
        <p class="text-[13px] text-muted text-center leading-normal">You can change a sheet until the tabulator closes scoring. The newest version is the one that counts.</p>
      </template>

      <JudgeHandover
        v-else-if="view === 'handover' && handoverPayload"
        :payload="handoverPayload" :event="event" :judge-name="ui.session?.name ?? ''"
        @close="view = 'sheets'"
      />
    </main>

    <footer v-if="event && criteria.length && candidates.length && (view === 'one' || view === 'all')" class="sticky bottom-0 bg-ground/95 backdrop-blur border-t border-line">
      <div class="max-w-[640px] mx-auto px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-2">
        <button class="num text-[13px] text-muted text-center min-h-8 hover:text-ink" @click="view = 'sheets'">
          {{ complete }} of {{ candidates.length }} sheets complete<template v-if="waitingCount"> · {{ waitingCount }} waiting to send</template> · <span class="underline underline-offset-2">See status</span>
        </button>
        <button class="btn btn-primary btn-lg" :disabled="locked || !readyToSend.length" @click="submitReady">
          {{ readyToSend.length ? `Submit ${readyToSend.length} ready sheet${readyToSend.length > 1 ? 's' : ''}` : 'No new sheets to submit' }}
        </button>
      </div>
    </footer>
  </div>
</template>
