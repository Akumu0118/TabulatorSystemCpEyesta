<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { data, ui, logout, syncNow } from '../store'
import { STATUS_CLS, STATUS_TEXT, useJudgeSheet, type SheetStatus } from '../judgeSheet'
import type { Candidate } from '../types'
import Icon from './Icon.vue'
import ScoreBar from './charts/ScoreBar.vue'
import TotalRing from './charts/TotalRing.vue'
import JudgeHandover from './JudgeHandover.vue'
import JudgeCodeScreen from './JudgeCodeScreen.vue'
import JudgeTablet from './JudgeTablet.vue'
import MoveAddress from './MoveAddress.vue'
import { movedFrom } from '../move-accept'

type View = 'one' | 'all' | 'sheets' | 'handover'

const view = ref<View>('one')
const moving = ref(false)
const moved = ref(movedFrom)
/** One sheet state for both layouts, so turning the tablet keeps drafts, entry and category. */
const sheet = useJudgeSheet()
const {
  event, criteria, locked, cats, hasCats, catIdx, candidates, allCandidates, label, pickCat, doneIn,
  getScore, setScore, errorFor, filledCount, rowReady, rowTotalNum, rowTotal, status,
  counts, catCounts, readyToSend, complete, waitingCount, submitReady,
  syncState, syncText, retryIn, lastSyncText, handoverPayload, idx, dir, cur
} = sheet

/** Landscape tablets (and wide windows) get the three-column layout with the in-app keypad. */
const mq = window.matchMedia('(orientation: landscape) and (min-width: 900px)')
const wide = ref(mq.matches)
const onMq = (e: MediaQueryListEvent) => { wide.value = e.matches }
mq.addEventListener('change', onMq)
onBeforeUnmount(() => mq.removeEventListener('change', onMq))

const SEG_CLS: Record<SheetStatus, string> = { sent: 'bg-[#34D399]', waiting: 'bg-[#FB923C]', draft: 'bg-[#7A9BFF]', empty: 'bg-[#334155]' }

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
  <MoveAddress v-if="moving && wide && view !== 'handover'" @close="moving = false" />
  <JudgeTablet
    v-if="wide && view !== 'handover'"
    :s="sheet" :view="view" :moved="moved"
    @view="v => (view = v)" @moving="moving = true" @dismiss-moved="moved = null"
  />
  <div v-else class="min-h-dvh flex flex-col bg-ground text-ink">
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

        <div v-if="hasCats && (view === 'one' || view === 'all')" role="tablist" aria-label="Category" class="flex gap-1 p-1 rounded-xl bg-side-active overflow-x-auto">
          <button
            v-for="(g, i) in cats" :key="g.id ?? 'none'" role="tab" :aria-selected="catIdx === i"
            class="flex-1 min-w-24 h-11 px-3 rounded-[9px] text-sm font-bold flex items-center justify-center gap-2"
            :class="catIdx === i ? 'bg-white text-[#0F172A]' : 'text-side-ink'"
            @click="pickCat(i)"
          >{{ g.name }}<span class="num text-xs font-semibold opacity-75">{{ doneIn(g.candidates) }}/{{ g.candidates.length }}</span></button>
        </div>

        <nav v-if="view === 'one' && candidates.length" aria-label="Entries" class="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          <button
            v-for="(c, i) in candidates" :key="c.id"
            class="display shrink-0 min-w-12 h-11 px-2 rounded-[10px] border font-bold text-base"
            :class="chipCls(c, i)"
            :aria-current="i === idx ? 'step' : undefined"
            :aria-label="`Entry ${label(c)}, ${STATUS_TEXT[status(c.id)]}`"
            @click="idx = i"
          >{{ label(c) }}</button>
        </nav>

        <button
          v-if="candidates.length && criteria.length && view !== 'handover'"
          class="flex flex-col gap-1.5 text-left" :aria-label="`${catCounts.sent} sent, ${catCounts.waiting} waiting, ${catCounts.draft} changed, ${catCounts.empty} not scored. See status.`"
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
            <span>{{ catCounts.sent }} sent<template v-if="catCounts.waiting"> · {{ catCounts.waiting }} waiting</template></span>
            <span>{{ candidates.length - catCounts.empty }} of {{ candidates.length }} scored</span>
          </span>
        </button>
      </div>
    </header>
    <JudgeCodeScreen v-if="ui.needsCode && view !== 'handover'" @handover="view = 'handover'" />

    <MoveAddress v-if="moving" @close="moving = false" />

    <main class="flex-1 w-full max-w-[640px] mx-auto px-4 pt-4 pb-4 flex flex-col gap-3">
      <div v-if="moved" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-ok-soft text-ok text-sm anim-fade-up">
        <span class="flex-1"><strong>Connected to the laptop's new address.</strong> Your sheets came along from <span class="num">{{ moved.replace(/^https?:\/\//, '') }}</span>.</span>
        <button class="icon-btn" aria-label="Dismiss" @click="moved = null"><Icon name="x" /></button>
      </div>
      <Transition name="fade">
        <div v-if="!ui.online && (waitingCount || ui.nextRetry !== null) && view !== 'handover'" role="status" class="flex gap-3 items-start px-4 py-3.5 rounded-[14px] bg-warn-soft text-warn text-sm leading-normal">
          <Icon name="wifiOff" :size="22" class="shrink-0 mt-px" />
          <span class="flex-1 flex flex-col gap-2">
            <span v-if="waitingCount"><strong>{{ waitingCount }} sheet{{ waitingCount > 1 ? 's are' : ' is' }} saved on this tablet.</strong> They're sent automatically when it reaches the laptop again<template v-if="retryIn !== null"> (next try in {{ retryIn }} s)</template>.</span>
            <span v-else><strong>Can't reach the laptop.</strong> You can keep scoring; sheets are saved on this tablet<template v-if="retryIn !== null"> (next try in {{ retryIn }} s)</template>.</span>
            <span class="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
              <button class="underline underline-offset-2" @click="syncNow()">Try now</button>
              <button class="underline underline-offset-2" @click="moving = true">Laptop address changed?</button>
              <button v-if="waitingCount" class="underline underline-offset-2" @click="view = 'handover'">Hand over by QR</button>
            </span>
          </span>
        </div>
      </Transition>
      <div v-if="locked" role="status" class="flex gap-3 items-center px-4 py-3 rounded-[14px] bg-sunken text-muted text-sm font-semibold">
        <Icon name="lock" class="shrink-0" />Scoring is closed for this event. Your scores can no longer be changed.
      </div>

      <div v-if="!event" class="card p-8 text-center text-muted">No events yet. Wait for the tabulator to set one up.</div>
      <div v-else-if="!criteria.length || !allCandidates.length" class="card p-8 text-center text-muted">
        Waiting for the tabulator to add criteria and entries for this event.
      </div>

      <!-- One by one -->
      <template v-else-if="view === 'one' && cur">
        <div class="relative overflow-hidden -mx-1 px-1" :style="{ '--slide-from': `${dir * 28}px` }">
        <Transition name="slide" mode="out-in">
        <section :key="cur.id" aria-labelledby="entry-name" class="card p-4 flex flex-col gap-3.5">
          <div class="flex items-center gap-3">
            <span class="display num w-12 h-12 rounded-xl bg-accent-soft text-accent-ink grid place-items-center text-xl font-bold shrink-0">{{ label(cur) }}</span>
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
                  >{{ label(c) }}</span>
                </th>
                <td v-for="k in criteria" :key="k.id" class="px-[3px] py-2">
                  <input
                    class="score-input !h-11 !text-[17px] !rounded-[9px] w-full" :class="{ filled: getScore(c.id, k.id) !== '' }"
                    type="number" inputmode="decimal" min="0" :max="k.max_score" step="any" placeholder="–"
                    :value="getScore(c.id, k.id)" :disabled="locked"
                    :aria-label="`Entry ${label(c)}, ${k.name}, out of ${k.max_score}`"
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
          <h2 id="sheets-title" class="px-4 py-3.5 text-sm font-semibold text-muted border-b border-line">{{ event.name }} · {{ allCandidates.length }} entries</h2>
          <ul>
            <li v-for="(c, i) in allCandidates" :key="c.id" class="flex items-center gap-3 px-4 py-3 anim-fade-up" :class="{ 'border-t border-line': i > 0 }" :style="{ '--i': i }">
              <span class="num w-9 h-9 rounded-[10px] bg-accent-soft text-accent-ink grid place-items-center font-bold text-sm shrink-0">{{ label(c) }}</span>
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

    <footer v-if="event && criteria.length && allCandidates.length && (view === 'one' || view === 'all')" class="sticky bottom-0 bg-ground/95 backdrop-blur border-t border-line">
      <div class="max-w-[640px] mx-auto px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] flex flex-col gap-2">
        <button class="num text-[13px] text-muted text-center min-h-8 hover:text-ink" @click="view = 'sheets'">
          {{ complete }} of {{ allCandidates.length }} sheets complete<template v-if="waitingCount"> · {{ waitingCount }} waiting to send</template> · <span class="underline underline-offset-2">See status</span>
        </button>
        <button class="btn btn-primary btn-lg" :disabled="locked || !readyToSend.length" @click="submitReady">
          {{ readyToSend.length ? `Submit ${readyToSend.length} ready sheet${readyToSend.length > 1 ? 's' : ''}` : 'No new sheets to submit' }}
        </button>
      </div>
    </footer>
  </div>
</template>
