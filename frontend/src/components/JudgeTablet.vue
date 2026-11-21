<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { data, ui, logout, syncNow } from '../store'
import { STATUS_SHORT, type JudgeSheet, type PadKey, type SheetStatus } from '../judgeSheet'
import type { Criterion } from '../types'
import Icon from './Icon.vue'
import TotalRing from './charts/TotalRing.vue'
import JudgeHandover from './JudgeHandover.vue'
import JudgeCodeScreen from './JudgeCodeScreen.vue'
import logo from '../assets/brand/icpep-logo.png'

/**
 * The judge's sheet on a tablet held sideways: entries on the left, the criteria in the
 * middle and an in-app keypad on the right, so the system keyboard never covers the sheet.
 */
type View = 'one' | 'all' | 'sheets' | 'handover'
const props = defineProps<{ s: JudgeSheet; view: View; moved: string | null }>()
const emit = defineEmits<{ view: [v: View]; moving: []; dismissMoved: [] }>()

const s = props.s
const KEYS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
const VIEWS: { v: View; label: string }[] = [
  { v: 'one', label: 'One by one' }, { v: 'all', label: 'All entries' }, { v: 'sheets', label: 'Your sheets' }
]

const DOT: Record<SheetStatus, string> = { sent: 'bg-ok', waiting: 'bg-warn', draft: 'bg-accent', empty: 'bg-line-strong' }
const INK: Record<SheetStatus, string> = { sent: 'text-ok', waiting: 'text-warn', draft: 'text-accent-ink', empty: 'text-muted' }
const SEG: Record<SheetStatus, string> = { sent: 'bg-ok', waiting: 'bg-warn', draft: 'bg-accent', empty: 'bg-line' }

const ev = computed(() => s.event.value)
const crit = computed(() => s.criteria.value)
const cur = computed(() => s.cur.value)
const targetCrit = computed<Criterion | undefined>(() => crit.value.find(k => k.id === s.target.value?.kId))
const targetEntry = computed(() => s.allCandidates.value.find(c => c.id === s.target.value?.cId))
const targetError = computed(() => (s.target.value && targetCrit.value ? s.errorFor(s.target.value.cId, targetCrit.value) : ''))
const ready = computed(() => s.readyToSend.value.length)
const pts = (cId: number, k: Criterion) => {
  const v = s.getScore(cId, k.id)
  return v === '' || s.errorFor(cId, k) ? null : (Number(v) / (k.max_score || 1)) * k.weight
}
const groupTitle = computed(() => s.group.value?.name || 'Entries')

/** A hardware keyboard works too: digits, decimal point, Backspace, Enter, arrows in the grid. */
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return
  if (props.view !== 'one' && props.view !== 'all') return
  if (/^[0-9.]$/.test(e.key)) { s.press(e.key as PadKey); e.preventDefault() }
  else if (e.key === 'Backspace') { s.press('del'); e.preventDefault() }
  else if (e.key === 'Enter' && props.view === 'one' && !s.primary.value.disabled) { s.primary.value.run(); e.preventDefault() }
  else if (props.view === 'all' && (e.key === 'ArrowRight' || e.key === 'Tab')) { s.moveCell(e.shiftKey ? -1 : 1); e.preventDefault() }
  else if (props.view === 'all' && e.key === 'ArrowLeft') { s.moveCell(-1); e.preventDefault() }
  else if (props.view === 'all' && e.key === 'ArrowDown') { s.moveCell(crit.value.length); e.preventDefault() }
  else if (props.view === 'all' && e.key === 'ArrowUp') { s.moveCell(-crit.value.length); e.preventDefault() }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

function show(v: View) {
  emit('view', v)
  // The grid starts on the entry the judge was on.
  if (v === 'all' && cur.value && !crit.value.some(k => s.isTarget(cur.value!.id, k.id))) s.focusCell(cur.value.id, crit.value[0].id)
}
</script>

<template>
  <div class="h-dvh flex flex-col bg-ground text-ink overflow-hidden">
    <!-- top bar -->
    <header class="h-[60px] shrink-0 bg-side text-side-ink px-5 flex items-center gap-4">
      <img :src="logo" alt="" class="w-8 h-8 object-contain" />
      <div class="flex flex-col leading-tight min-w-0">
        <span class="text-xs text-side-muted truncate">{{ ui.session?.name }}</span>
        <select
          v-if="data.events.length > 1" aria-label="Event"
          class="bg-transparent display text-[17px] font-bold text-side-ink cursor-pointer max-w-[220px] truncate"
          :value="ev?.id" @change="ui.activeEvent = Number(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="e in data.events" :key="e.id" :value="e.id" class="text-ink">{{ e.name }}{{ e.locked ? ' (closed)' : '' }}</option>
        </select>
        <span v-else class="display text-[17px] font-bold truncate">{{ ev?.name }}</span>
      </div>
      <nav aria-label="Scoring view" class="mx-auto flex gap-1 p-1 rounded-xl bg-side-active">
        <button
          v-for="t in VIEWS" :key="t.v" :aria-current="view === t.v ? 'page' : undefined"
          class="h-10 px-[18px] rounded-[9px] text-sm font-semibold transition-colors"
          :class="view === t.v ? 'bg-white text-[#0F172A]' : 'text-side-muted hover:text-side-ink'"
          @click="show(t.v)"
        >{{ t.label }}</button>
      </nav>
      <button
        class="pill !text-[13px] !min-h-9 transition-colors duration-300"
        :class="s.syncState.value === 'off' ? 'bg-[#3A220F] text-[#FDBA74]' : 'bg-[#10302A] text-[#6EE7B7]'"
        aria-live="polite" title="Tap to sync now" @click="syncNow()"
      >
        <Icon v-if="s.syncState.value === 'syncing'" name="refresh" :size="13" class="anim-spin" />
        <span v-else class="dot" :class="s.syncState.value === 'ok' ? 'ping text-[#34D399]' : 'anim-pulse text-[#FB923C]'"></span>
        <span class="num">{{ s.syncText.value }}</span>
      </button>
      <button class="icon-btn !text-side-muted hover:!bg-side-active" aria-label="Log out" title="Log out" @click="logout">
        <Icon name="out" />
      </button>
    </header>

    <div v-if="!ev" class="flex-1 grid place-items-center text-muted">No events yet. Wait for the tabulator to set one up.</div>
    <div v-else-if="!crit.length || !s.allCandidates.value.length" class="flex-1 grid place-items-center text-muted">
      Waiting for the tabulator to add criteria and entries for this event.
    </div>

    <!-- ONE BY ONE -->
    <div v-else-if="view === 'one'" class="flex-1 min-h-0 grid grid-cols-[288px_minmax(0,1fr)_340px] xl:grid-cols-[304px_minmax(0,1fr)_360px]">
      <aside aria-label="Entries" class="bg-surface border-r border-line flex flex-col min-h-0">
        <div class="px-3.5 pt-3.5 pb-3 flex flex-col gap-3">
          <div
            v-if="s.hasCats.value" role="tablist" aria-label="Category"
            class="grid gap-1 p-1 rounded-[14px] bg-sunken"
            :style="{ gridTemplateColumns: `repeat(${Math.min(2, s.cats.value.length)}, minmax(0, 1fr))` }"
          >
            <button
              v-for="(g, i) in s.cats.value" :key="g.id ?? 'none'" role="tab" :aria-selected="s.catIdx.value === i"
              class="min-h-14 rounded-[11px] px-2 py-1.5 flex flex-col items-center justify-center gap-1.5 transition-colors"
              :class="s.catIdx.value === i ? 'bg-surface shadow-[0_1px_3px_rgba(15,23,42,.14)]' : 'hover:bg-surface/60'"
              @click="s.pickCat(i)"
            >
              <span class="font-bold text-[15px] truncate max-w-full" :class="s.catIdx.value === i ? 'text-accent-ink' : ''">{{ g.name }}</span>
              <span class="flex items-center gap-1.5">
                <span class="flex gap-[2px] w-14 h-[5px]" aria-hidden="true">
                  <span v-for="c in g.candidates" :key="c.id" class="flex-1 rounded-[2px] transition-colors duration-500" :class="SEG[s.status(c.id)]"></span>
                </span>
                <span class="num text-xs font-semibold text-muted">{{ s.doneIn(g.candidates) }}/{{ g.candidates.length }}</span>
              </span>
            </button>
          </div>
          <div class="flex items-baseline justify-between px-1">
            <h2 class="display text-base font-bold">{{ s.hasCats.value ? `${groupTitle} entries` : 'Entries' }}</h2>
            <span class="num text-[13px] text-muted">
              {{ s.catCounts.value.sent }} of {{ s.candidates.value.length }} sent<template v-if="s.catCounts.value.waiting"> · {{ s.catCounts.value.waiting }} waiting</template>
            </span>
          </div>
          <div v-if="!s.hasCats.value" class="flex gap-[3px] h-2" aria-hidden="true">
            <span v-for="c in s.candidates.value" :key="c.id" class="flex-1 rounded-[3px] transition-colors duration-500" :class="SEG[s.status(c.id)]"></span>
          </div>
        </div>
        <ul class="flex-1 overflow-y-auto px-2.5 pb-2 flex flex-col gap-1">
          <li v-for="(c, i) in s.candidates.value" :key="c.id">
            <button
              class="w-full min-h-16 flex items-center gap-3 px-2.5 py-2 rounded-xl border-2 text-left transition-colors"
              :class="i === s.idx.value ? 'bg-accent-soft border-accent' : 'border-transparent hover:bg-sunken'"
              :aria-current="i === s.idx.value ? 'step' : undefined"
              @click="s.idx.value = i"
            >
              <span
                class="num w-11 h-10 shrink-0 rounded-[10px] grid place-items-center font-bold"
                :class="i === s.idx.value ? 'bg-accent text-on-accent' : 'bg-sunken'"
              >{{ s.label(c) }}</span>
              <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                <span class="font-semibold truncate">{{ c.name }}</span>
                <span class="flex items-center gap-1.5 text-xs font-semibold" :class="INK[s.status(c.id)]">
                  <span class="w-2 h-2 rounded-full" :class="DOT[s.status(c.id)]"></span>{{ STATUS_SHORT[s.status(c.id)] }}
                </span>
              </span>
              <span class="num display font-bold" :class="s.rowReady(c.id) ? '' : 'text-muted'">{{ s.rowTotal(c.id) }}</span>
            </button>
          </li>
        </ul>
        <div class="px-4 py-3 border-t border-line">
          <button class="btn w-full" @click="emit('view', 'handover')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></svg>
            Hand over by QR
          </button>
        </div>
      </aside>

      <main class="min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-3.5">
        <JudgeCodeScreen v-if="ui.needsCode" @handover="emit('view', 'handover')" />
        <div v-if="moved" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-ok-soft text-ok text-sm anim-fade-up">
          <span class="flex-1"><strong>Connected to the laptop's new address.</strong> Your sheets came along from <span class="num">{{ moved.replace(/^https?:\/\//, '') }}</span>.</span>
          <button class="icon-btn" aria-label="Dismiss" @click="emit('dismissMoved')"><Icon name="x" /></button>
        </div>
        <Transition name="fade">
          <div v-if="!ui.online && (s.waitingCount.value || ui.nextRetry !== null)" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-warn-soft text-warn text-sm">
            <Icon name="wifiOff" :size="20" class="shrink-0" />
            <span class="flex-1">
              <strong>Can't reach the laptop.</strong> Keep scoring;
              <template v-if="s.waitingCount.value">{{ s.waitingCount.value }} sheet{{ s.waitingCount.value > 1 ? 's are' : ' is' }}</template><template v-else>sheets are</template>
              saved on this tablet<template v-if="s.retryIn.value !== null"> (next try in {{ s.retryIn.value }} s)</template>.
            </span>
            <button class="font-bold underline underline-offset-2 min-h-9" @click="syncNow()">Try now</button>
            <button class="font-bold underline underline-offset-2 min-h-9" @click="emit('moving')">Laptop address changed?</button>
          </div>
        </Transition>
        <div v-if="s.locked.value" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-sunken text-muted text-sm font-semibold">
          <Icon name="lock" class="shrink-0" />Scoring is closed for this event. Your scores can no longer be changed.
        </div>

        <template v-if="cur">
          <section class="flex items-center gap-4">
            <span class="num display min-w-16 h-14 px-2 shrink-0 rounded-[14px] grid place-items-center bg-accent-soft text-accent-ink text-[22px] font-bold">{{ s.label(cur) }}</span>
            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <span class="num text-[13px] font-semibold text-accent-ink">
                <template v-if="s.hasCats.value">{{ groupTitle }} · </template>Entry {{ s.idx.value + 1 }} of {{ s.candidates.value.length }} · {{ s.filledCount(cur.id) }} of {{ crit.length }} criteria scored
              </span>
              <h1 class="display text-[30px] leading-tight font-bold truncate">{{ cur.name }}</h1>
            </div>
            <button class="icon-btn !w-12 !h-12 border border-line-strong bg-surface" aria-label="Previous entry" :disabled="s.idx.value === 0" @click="s.idx.value--">
              <Icon name="chevronLeft" />
            </button>
            <button class="icon-btn !w-12 !h-12 border border-line-strong bg-surface" aria-label="Next entry" :disabled="s.atLastEntry.value" @click="s.idx.value++">
              <Icon name="chevronRight" />
            </button>
          </section>

          <div class="flex flex-col gap-2.5">
            <button
              v-for="k in crit" :key="k.id"
              class="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-5 px-[18px] py-4 rounded-2xl border-2 text-left transition-[border-color,background-color,box-shadow] duration-200"
              :class="[
                s.errorFor(cur.id, k) ? 'border-danger' : s.isTarget(cur.id, k.id) ? 'border-accent shadow-[0_0_0_4px_var(--accent-soft)]' : 'border-line',
                s.isTarget(cur.id, k.id) ? 'bg-accent-soft/40' : 'bg-surface'
              ]"
              :aria-pressed="s.isTarget(cur.id, k.id)"
              :aria-label="`${k.name}: ${s.shown(cur.id, k.id) || 'not scored'} out of ${k.max_score}${s.isTarget(cur.id, k.id) ? ', typing here' : ''}`"
              :disabled="s.locked.value"
              @click="s.focusCell(cur.id, k.id)"
            >
              <span class="flex flex-col gap-2.5 min-w-0">
                <span class="flex items-baseline gap-2.5">
                  <span class="text-[17px] font-semibold truncate">{{ k.name }}</span>
                  <span class="num text-[13px] shrink-0" :class="s.errorFor(cur.id, k) ? 'text-danger font-semibold' : 'text-muted'">
                    {{ s.errorFor(cur.id, k) || `Counts ${k.weight}%` }}
                  </span>
                </span>
                <span class="flex items-center gap-3">
                  <span class="flex-1 h-2 rounded bg-sunken overflow-hidden">
                    <span class="block h-full bg-accent rounded-r transition-[width] duration-500" :style="{ width: `${((pts(cur.id, k) ?? 0) / k.weight) * 100}%` }"></span>
                  </span>
                  <span class="num w-24 text-right text-[13px] font-semibold text-muted">
                    {{ pts(cur.id, k) === null ? `0 / ${k.weight} pts` : `+${pts(cur.id, k)!.toFixed(1)} pts` }}
                  </span>
                </span>
              </span>
              <span
                class="h-16 rounded-xl border-2 bg-surface flex items-center justify-center gap-0.5"
                :class="s.errorFor(cur.id, k) ? 'border-danger' : s.isTarget(cur.id, k.id) ? 'border-accent' : s.shown(cur.id, k.id) ? 'border-accent/40' : 'border-line'"
              >
                <span class="num display text-[28px] font-bold" :class="s.errorFor(cur.id, k) ? 'text-danger' : s.shown(cur.id, k.id) ? '' : 'text-muted'">
                  {{ s.shown(cur.id, k.id) || (s.isTarget(cur.id, k.id) ? '' : '–') }}
                </span>
                <span v-if="s.isTarget(cur.id, k.id) && !s.locked.value" class="caret w-0.5 h-7 bg-accent"></span>
                <span class="num text-[13px] text-muted ml-1">/{{ k.max_score }}</span>
              </span>
            </button>
          </div>
          <p class="mt-auto text-[13px] text-muted">
            Tap a criterion, then type on the keypad<template v-if="s.hasCats.value">; tap a category on the left to switch, each one remembers where you were</template>. Everything is saved on this tablet as you type.
          </p>
        </template>
      </main>

      <aside aria-label="Total and keypad" class="bg-surface border-l border-line px-5 pt-[18px] pb-5 flex flex-col gap-4 min-h-0">
        <div v-if="cur" class="flex items-center gap-4">
          <TotalRing :value="s.filledCount(cur.id) ? s.partialTotal(cur.id) : null" :size="104" />
          <dl class="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 text-[13px]">
            <template v-for="k in crit" :key="k.id">
              <dt class="text-muted truncate">{{ k.name }}</dt>
              <dd class="num font-semibold text-right">{{ pts(cur.id, k) === null ? '–' : pts(cur.id, k)!.toFixed(1) }} / {{ k.weight }}</dd>
            </template>
          </dl>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-[13px] font-semibold text-muted shrink-0">Typing into</span>
          <span class="font-bold text-accent-ink truncate">{{ targetCrit?.name ?? '–' }}</span>
        </div>
        <div role="group" aria-label="Number keypad" class="grid grid-cols-3 gap-2.5">
          <button
            v-for="k in KEYS" :key="k" class="key num display h-[60px] rounded-[14px] border border-line-strong text-2xl font-semibold"
            :class="k === 'del' || k === '.' ? 'bg-sunken' : 'bg-surface'"
            :aria-label="k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k"
            :disabled="s.locked.value" @click="s.press(k)"
          >
            <Icon v-if="k === 'del'" name="backspace" :size="24" class="mx-auto" />
            <template v-else>{{ k }}</template>
          </button>
        </div>
        <button
          class="btn btn-primary mt-auto !min-h-[60px] !rounded-[14px] !text-[17px]"
          :disabled="s.primary.value.disabled" @click="s.primary.value.run()"
        >
          {{ s.primary.value.text }}<Icon name="arrowRight" :size="20" />
        </button>
      </aside>
    </div>

    <!-- ALL ENTRIES -->
    <div v-else-if="view === 'all'" class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_320px]">
      <main class="min-h-0 px-6 py-5 flex flex-col gap-3.5">
        <JudgeCodeScreen v-if="ui.needsCode" @handover="emit('view', 'handover')" />
        <div class="flex items-center gap-3.5">
          <h1 class="display text-2xl font-bold">{{ s.hasCats.value ? `${groupTitle} entries` : 'All entries' }}</h1>
          <span class="num text-sm text-muted">{{ s.catCounts.value.sent }} of {{ s.candidates.value.length }} sent · {{ ready }} ready to submit</span>
          <div v-if="s.hasCats.value" role="tablist" aria-label="Category" class="ml-auto flex gap-1 p-1 rounded-[14px] bg-sunken">
            <button
              v-for="(g, i) in s.cats.value" :key="g.id ?? 'none'" role="tab" :aria-selected="s.catIdx.value === i"
              class="min-w-[140px] h-12 px-4 rounded-[11px] font-bold flex items-center justify-center gap-2.5 transition-colors"
              :class="s.catIdx.value === i ? 'bg-surface text-accent-ink shadow-[0_1px_3px_rgba(15,23,42,.14)]' : ''"
              @click="s.pickCat(i); g.candidates[0] && s.focusCell(g.candidates[0].id, crit[0].id)"
            >
              {{ g.name }}
              <span class="num text-xs font-semibold px-2 py-0.5 rounded-full" :class="s.doneIn(g.candidates) === g.candidates.length ? 'bg-ok-soft text-ok' : 'bg-sunken text-muted'">
                {{ s.doneIn(g.candidates) }}/{{ g.candidates.length }} sent
              </span>
            </button>
          </div>
        </div>
        <div v-if="s.locked.value" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-sunken text-muted text-sm font-semibold">
          <Icon name="lock" class="shrink-0" />Scoring is closed for this event.
        </div>
        <div role="grid" aria-label="Scores for every entry" class="flex-1 min-h-0 overflow-auto card !rounded-2xl">
          <div
            role="row" class="sticky top-0 z-[1] grid items-end gap-2.5 px-4 pt-3.5 pb-2.5 bg-surface border-b border-line"
            :style="{ gridTemplateColumns: `220px repeat(${crit.length}, minmax(88px, 1fr)) 100px 128px` }"
          >
            <span role="columnheader" class="text-xs font-semibold uppercase tracking-[0.04em] text-muted">Entry</span>
            <span v-for="k in crit" :key="k.id" role="columnheader" class="flex flex-col gap-0.5 min-w-0">
              <span class="text-sm font-semibold truncate">{{ k.name }}</span>
              <span class="num text-xs text-muted">{{ k.weight }}% · max {{ k.max_score }}</span>
            </span>
            <span role="columnheader" class="text-xs font-semibold uppercase tracking-[0.04em] text-muted text-right">Total</span>
            <span role="columnheader" class="text-xs font-semibold uppercase tracking-[0.04em] text-muted">Status</span>
          </div>
          <div
            v-for="c in s.candidates.value" :key="c.id" role="row"
            class="grid items-center gap-2.5 px-4 py-2.5 border-b border-line"
            :class="s.target.value?.cId === c.id ? 'bg-accent-soft/30' : ''"
            :style="{ gridTemplateColumns: `220px repeat(${crit.length}, minmax(88px, 1fr)) 100px 128px` }"
          >
            <span role="rowheader" class="flex items-center gap-3 min-w-0">
              <span class="num w-11 h-9 shrink-0 rounded-[10px] grid place-items-center font-bold" :class="s.target.value?.cId === c.id ? 'bg-accent text-on-accent' : 'bg-sunken'">{{ s.label(c) }}</span>
              <span class="font-semibold truncate">{{ c.name }}</span>
            </span>
            <button
              v-for="k in crit" :key="k.id" role="gridcell"
              class="h-[60px] rounded-xl border-2 px-3 flex flex-col justify-center gap-1.5 transition-[border-color,box-shadow] duration-150"
              :class="s.errorFor(c.id, k) ? 'border-danger' : s.isTarget(c.id, k.id) ? 'border-accent shadow-[0_0_0_4px_var(--accent-soft)] bg-accent-soft/40' : 'border-line bg-surface'"
              :aria-label="`${c.name}, ${k.name}: ${s.shown(c.id, k.id) || 'not scored'} out of ${k.max_score}`"
              :disabled="s.locked.value"
              @click="s.focusCell(c.id, k.id)"
            >
              <span class="num display text-[22px] font-bold leading-none text-center" :class="s.errorFor(c.id, k) ? 'text-danger' : s.shown(c.id, k.id) ? '' : 'text-muted'">
                {{ s.shown(c.id, k.id) || '–' }}
              </span>
              <span class="h-1 rounded-sm bg-sunken overflow-hidden">
                <span class="block h-full bg-accent transition-[width] duration-500" :style="{ width: `${((pts(c.id, k) ?? 0) / k.weight) * 100}%` }"></span>
              </span>
            </button>
            <span role="gridcell" class="num display text-[22px] font-bold text-right" :class="s.rowReady(c.id) ? '' : 'text-muted'">{{ s.rowTotal(c.id) }}</span>
            <span role="gridcell" class="flex items-center gap-1.5 text-[13px] font-semibold" :class="INK[s.status(c.id)]">
              <span class="w-2 h-2 rounded-full shrink-0" :class="DOT[s.status(c.id)]"></span>{{ s.rowReady(c.id) && s.status(c.id) === 'draft' ? 'Ready' : STATUS_SHORT[s.status(c.id)] }}
            </span>
          </div>
        </div>
      </main>

      <aside aria-label="Keypad" class="bg-surface border-l border-line p-5 flex flex-col gap-3.5">
        <div class="flex flex-col gap-1 px-4 py-3.5 rounded-[14px] bg-accent-soft/50 border border-accent-soft">
          <span class="text-xs font-semibold text-muted">Typing into</span>
          <span class="font-bold text-accent-ink truncate">{{ targetEntry ? `${s.label(targetEntry)} · ${targetEntry.name}` : 'Tap a box' }}</span>
          <span v-if="targetCrit" class="text-sm">{{ targetCrit.name }} <span class="num text-muted">· 0 to {{ targetCrit.max_score }}</span></span>
          <span v-if="targetError" role="alert" class="text-[13px] font-semibold text-danger">{{ targetError }}</span>
        </div>
        <div role="group" aria-label="Number keypad" class="grid grid-cols-3 gap-2.5">
          <button
            v-for="k in KEYS" :key="k" class="key num display h-[60px] rounded-[14px] border border-line-strong text-2xl font-semibold"
            :class="k === 'del' || k === '.' ? 'bg-sunken' : 'bg-surface'"
            :aria-label="k === 'del' ? 'Delete' : k === '.' ? 'Decimal point' : k"
            :disabled="s.locked.value" @click="s.press(k)"
          >
            <Icon v-if="k === 'del'" name="backspace" :size="24" class="mx-auto" />
            <template v-else>{{ k }}</template>
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <button class="btn" @click="s.moveCell(-1)">Previous box</button>
          <button class="btn" @click="s.moveCell(1)">Next box</button>
        </div>
        <button class="btn btn-primary mt-auto !min-h-[60px] !rounded-[14px] !text-[17px]" :disabled="s.locked.value || !ready" @click="s.submitReady()">
          {{ ready ? `Submit ${ready} ready sheet${ready > 1 ? 's' : ''}` : 'Nothing ready to submit' }}
        </button>
      </aside>
    </div>

    <!-- YOUR SHEETS -->
    <div v-else-if="view === 'sheets'" class="flex-1 min-h-0 grid grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <section class="bg-surface border-r border-line px-8 py-6 overflow-y-auto">
        <JudgeHandover v-if="s.handoverPayload.value && ev" :payload="s.handoverPayload.value" :event="ev" :judge-name="ui.session?.name ?? ''" @close="emit('view', 'one')" />
      </section>
      <main class="min-h-0 overflow-y-auto px-7 py-6 flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="px-4 py-3.5 rounded-[14px] bg-ok-soft text-ok flex flex-col gap-0.5">
            <span class="num display text-[28px] font-bold">{{ s.counts.value.sent }}</span><span class="text-[13px] font-semibold">Received by the laptop</span>
          </div>
          <div class="px-4 py-3.5 rounded-[14px] bg-warn-soft text-warn flex flex-col gap-0.5">
            <span class="num display text-[28px] font-bold">{{ s.counts.value.waiting }}</span><span class="text-[13px] font-semibold">Waiting on this tablet</span>
          </div>
          <div class="px-4 py-3.5 rounded-[14px] card flex flex-col gap-0.5">
            <span class="num display text-[28px] font-bold">{{ s.counts.value.empty + s.counts.value.draft }}</span><span class="text-[13px] font-semibold text-muted">Still to score or submit</span>
          </div>
        </div>
        <section v-for="g in s.cats.value" :key="g.id ?? 'none'" class="card overflow-hidden" :aria-label="g.name || 'Entries'">
          <h2 v-if="s.hasCats.value" class="px-[18px] py-3 text-sm font-bold border-b border-line flex justify-between">
            {{ g.name }}<span class="num font-semibold text-muted">{{ s.doneIn(g.candidates) }}/{{ g.candidates.length }} sent</span>
          </h2>
          <ul>
            <li v-for="(c, i) in g.candidates" :key="c.id" class="grid grid-cols-[48px_minmax(0,1fr)_88px_160px] items-center gap-3.5 px-[18px] py-3" :class="{ 'border-t border-line': i > 0 }">
              <span class="num w-11 h-9 rounded-[10px] bg-sunken grid place-items-center font-bold">{{ s.label(c) }}</span>
              <span class="font-semibold truncate">{{ c.name }}</span>
              <span class="num display text-lg font-bold text-right" :class="s.rowReady(c.id) ? '' : 'text-muted'">{{ s.rowTotal(c.id) }}</span>
              <span class="justify-self-start inline-flex items-center gap-1.5 text-xs font-semibold" :class="INK[s.status(c.id)]">
                <span class="w-2 h-2 rounded-full" :class="DOT[s.status(c.id)]"></span>{{ STATUS_SHORT[s.status(c.id)] }}
              </span>
            </li>
          </ul>
        </section>
        <div class="mt-auto grid grid-cols-2 gap-3">
          <button class="btn btn-primary btn-lg" :disabled="ui.syncing" @click="syncNow()">
            <Icon name="refresh" :size="18" :class="{ 'anim-spin': ui.syncing }" />{{ ui.syncing ? 'Sending…' : 'Try sending now' }}
          </button>
          <button class="btn btn-lg" @click="emit('moving')">Laptop address changed?</button>
        </div>
        <p class="text-[13px] text-muted text-center">Last synced {{ s.lastSyncText.value }}. You can change a sheet until the tabulator closes scoring; the newest version counts.</p>
      </main>
    </div>
  </div>
</template>

<style scoped>
.key { transition: background-color .12s, transform .08s; }
.key:active:not(:disabled) { transform: scale(.96); background: var(--accent-soft); }
.key:disabled { opacity: .5; }
@keyframes blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
.caret { animation: blink 1s steps(1) infinite; }
@media (prefers-reduced-motion: reduce) { .key { transition: none; } .caret { animation: none; } }
</style>
