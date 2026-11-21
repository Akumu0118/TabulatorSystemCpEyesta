<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { data, ui, currentEvent, removeEvent, updateEvent } from '../store'
import { askConfirm } from '../confirm'
import type { Id, TabEvent } from '../types'
import Icon from './Icon.vue'
import LeaderboardTable from './LeaderboardTable.vue'
import PrintTallyModal from './PrintTallyModal.vue'
import SetupModal from './SetupModal.vue'
import ImportSheets from './ImportSheets.vue'
import FinalizeDialog from './FinalizeDialog.vue'
import OverviewTab from './admin/OverviewTab.vue'
import JudgesTab from './admin/JudgesTab.vue'
import SetupTab from './admin/SetupTab.vue'

type Tab = 'overview' | 'judges' | 'setup'
const TAB_KEY = 'tab_admin_tab'
const readTab = (): Tab => {
  try { const t = localStorage.getItem(TAB_KEY); return t === 'judges' || t === 'setup' ? t : 'overview' } catch { return 'overview' }
}
const tab = ref<Tab>(readTab())
function pick(t: Tab) {
  tab.value = t
  try { localStorage.setItem(TAB_KEY, t) } catch { /* private mode */ }
}

const showPrint = ref(false)
const showAccess = ref(false)
const showFinalize = ref(false)
const moreOpen = ref(false)
/** undefined = closed; null = open without a judge picked */
const importFor = ref<Id | null | undefined>(undefined)

const event = computed(() => currentEvent())
const missingSheets = computed(() => {
  const ev = event.value
  if (!ev) return 0
  let n = 0
  for (const c of ev.candidates) for (const j of data.judges) if (!data.scores[ev.id]?.[c.id]?.[j.id]) n++
  return n
})
const pendingJudges = computed(() => {
  const ev = event.value
  if (!ev) return []
  return data.judges.filter(j => ev.candidates.some(c => !data.scores[ev.id]?.[c.id]?.[j.id])).map(j => j.id)
})
const setupIssues = computed(() => {
  const ev = event.value
  if (!ev) return 0
  const w = ev.criteria.reduce((s, c) => s + c.weight, 0)
  return (w !== 100 ? 1 : 0) + (!ev.candidates.length ? 1 : 0) + (ev.categories.length && ev.candidates.some(c => c.category === null) ? 1 : 0)
})
const TABS = computed(() => [
  { t: 'overview' as Tab, label: 'Overview', badge: '' },
  { t: 'judges' as Tab, label: 'Judges', badge: missingSheets.value ? `${missingSheets.value} missing` : '' },
  { t: 'setup' as Tab, label: 'Setup', badge: setupIssues.value ? 'Check' : '' }
])

const lastSync = computed(() => {
  if (!ui.lastSync) return 'not synced yet'
  const s = Math.max(0, Math.round((Date.now() - ui.lastSync) / 1000))
  return s < 60 ? `synced ${s} s ago` : `synced at ${new Date(ui.lastSync).toLocaleTimeString()}`
})

function present() {
  showFinalize.value = false
  if (event.value) location.hash = `#/present/${event.value.id}/presenter`
}
function printTally() {
  showFinalize.value = false
  showPrint.value = true
}
function more(fn: () => void) {
  moreOpen.value = false
  fn()
}
const toggleScoring = (ev: TabEvent) => updateEvent(ev, { locked: !ev.locked })
const del = async (ev: TabEvent) => {
  const ok = await askConfirm({
    title: `Delete "${ev.name}"?`,
    message: 'All its criteria, categories, entries and scores are deleted too. This cannot be undone.',
    confirmLabel: 'Delete event', danger: true
  })
  if (ok) await removeEvent(ev.id)
}

const onDoc = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('[data-more]')) moreOpen.value = false
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') moreOpen.value = false }
onMounted(() => { document.addEventListener('click', onDoc); document.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey) })
</script>

<template>
  <div class="no-print flex flex-col gap-6 px-4 sm:px-6 lg:px-10 pt-5 lg:pt-7 pb-12">
    <header class="flex flex-wrap items-end gap-4">
      <button class="icon-btn lg:hidden border border-line bg-surface" aria-label="Open events menu" @click="ui.navOpen = true">
        <Icon name="menu" />
      </button>
      <div class="flex-1 basis-72 min-w-0 flex flex-col gap-1.5">
        <h1 class="display text-[34px] leading-tight font-bold truncate">{{ event?.name ?? 'No events yet' }}</h1>
        <div v-if="event" class="flex flex-wrap items-center gap-2">
          <span class="pill" :class="event.locked ? 'bg-sunken text-muted' : 'bg-ok-soft text-ok'">
            <span class="dot"></span>{{ event.locked ? 'Scoring closed' : 'Scoring open' }}
          </span>
          <span v-if="event.finalized_at" class="pill bg-gold-soft text-gold anim-pop"><Icon name="check" :size="14" />Results final</span>
          <span class="text-[13px] text-muted num">
            {{ event.candidates.length }} entries<template v-if="event.categories.length"> in {{ event.categories.length }} categories</template>
            · {{ data.judges.length }} judges · {{ ui.online ? 'live' : 'offline' }}, {{ lastSync }}
          </span>
        </div>
      </div>
      <div v-if="event" class="flex flex-wrap gap-2.5">
        <button class="btn" @click="showAccess = true"><Icon name="wifi" />Judge access</button>
        <div class="relative" data-more>
          <button class="btn" aria-haspopup="menu" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
            <Icon name="dots" />More<Icon name="chevronDown" :size="14" />
          </button>
          <Transition name="fade">
            <div v-if="moreOpen" role="menu" class="absolute right-0 top-full mt-1.5 z-30 w-60 card shadow-lg p-1.5 flex flex-col">
              <button role="menuitem" class="menu-item" @click="more(() => (showPrint = true))"><Icon name="print" :size="16" />Print tally</button>
              <button role="menuitem" class="menu-item" :disabled="!!event.finalized_at" @click="more(() => (importFor = null))"><Icon name="upload" :size="16" />Import sheets</button>
              <button
                role="menuitem" class="menu-item" :disabled="!!event.finalized_at"
                :title="event.finalized_at ? 'Undo finalizing first' : undefined" @click="more(() => toggleScoring(event!))"
              >
                <Icon :name="event.locked ? 'unlock' : 'lock'" :size="16" />{{ event.locked ? 'Reopen scoring' : 'Close scoring' }}
              </button>
              <hr class="my-1 border-line" />
              <button role="menuitem" class="menu-item text-danger" @click="more(() => del(event!))"><Icon name="trash" :size="16" />Delete event</button>
            </div>
          </Transition>
        </div>
        <button v-if="!event.finalized_at" class="btn btn-primary" @click="showFinalize = true">
          <Icon name="check" />{{ event.locked ? 'Finalize results' : 'Close scoring & finalize' }}
        </button>
        <template v-else>
          <button class="btn" @click="showFinalize = true">Results final</button>
          <button class="btn btn-primary" @click="present"><Icon name="play" />Present results</button>
        </template>
      </div>
      <button v-else class="btn" @click="showAccess = true"><Icon name="wifi" />Judge access</button>
    </header>

    <template v-if="event">
      <nav aria-label="Event sections" class="flex gap-1 border-b border-line -mt-1">
        <button
          v-for="x in TABS" :key="x.t" :aria-current="tab === x.t ? 'page' : undefined"
          class="relative h-12 px-4 font-semibold flex items-center gap-2 transition-colors"
          :class="tab === x.t ? 'text-ink' : 'text-muted hover:text-ink'"
          @click="pick(x.t)"
        >
          {{ x.label }}
          <span v-if="x.badge" class="num text-xs font-semibold px-2 py-0.5 rounded-full bg-warn-soft text-warn">{{ x.badge }}</span>
          <span v-if="tab === x.t" class="absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-accent"></span>
        </button>
      </nav>

      <template v-if="tab === 'overview'">
        <OverviewTab :event="event" @import="id => (importFor = id)" @tab="pick" />
        <LeaderboardTable :event="event" :pending="pendingJudges" />
      </template>
      <JudgesTab v-else-if="tab === 'judges'" :event="event" @import="id => (importFor = id)" @access="showAccess = true" />
      <SetupTab v-else :event="event" />
    </template>

    <div v-else class="card p-10 text-center text-muted">
      No events yet. Use <strong class="text-ink">New event</strong> in the sidebar to create one.
    </div>
  </div>

  <PrintTallyModal v-if="showPrint && event" :event="event" @close="showPrint = false" />
  <SetupModal v-if="showAccess" @close="showAccess = false" />
  <FinalizeDialog
    v-if="showFinalize && event" :event="event"
    @close="showFinalize = false" @import="id => (importFor = id)" @present="present" @print="printTally"
  />
  <ImportSheets v-if="importFor !== undefined && event" :event="event" :judge-id="importFor" @close="importFor = undefined" />
</template>

<style scoped>
.menu-item {
  display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 10px;
  border-radius: 8px; font-size: 14px; font-weight: 500; text-align: left;
}
.menu-item:hover:not(:disabled) { background: var(--sunken); }
.menu-item:disabled { opacity: .45; cursor: not-allowed; }
</style>
