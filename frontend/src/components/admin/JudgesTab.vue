<script setup lang="ts">
import { computed, ref } from 'vue'
import { data, ui, addJudge, removeJudge, regenCode, updateJudge } from '../../store'
import { askConfirm } from '../../confirm'
import { entryLabel, groups } from '../../scoring'
import { ago, useNow } from '../../motion'
import type { Candidate, Id, Judge, TabEvent } from '../../types'
import Icon from '../Icon.vue'

/**
 * Judges tab: a grid of judges × entries showing which sheets reached this laptop, and the
 * judge codes (show, rename, new code, remove, print).
 */
const props = defineProps<{ event: TabEvent }>()
const emit = defineEmits<{ import: [judgeId: Id | null]; access: [] }>()
const now = useNow(2000)

const gs = computed(() => groups(props.event))
const hasCats = computed(() => props.event.categories.length > 0)
const entries = computed(() => gs.value.flatMap(g => g.candidates))
const has = (c: Candidate, j: Judge) => !!data.scores[props.event.id]?.[c.id]?.[j.id]
const label = (c: Candidate) => entryLabel(props.event, c)

const rows = computed(() => data.judges.map(j => {
  const seen = j.last_seen_at ? Date.parse(j.last_seen_at) : null
  const age = seen === null ? null : now.value + ui.serverOffset - seen
  const sent = entries.value.filter(c => has(c, j)).length
  return { j, age, live: age !== null && age < 30000, sent }
}))
const cols = computed(() => `minmax(150px,200px) repeat(${entries.value.length}, minmax(30px, 1fr)) 150px`)

const shown = ref(false)
const name = ref('')
const add = () => {
  if (name.value.trim()) addJudge(name.value.trim())
  name.value = ''
}
const rename = (j: Judge, e: Event) => {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== j.name) updateJudge(j, v)
}
const newCode = async (j: Judge) => {
  if (await askConfirm({
    title: `Give ${j.name} a new code?`,
    message: 'Their tablet asks for the new code; scores saved on it are kept.',
    confirmLabel: 'New code'
  })) regenCode(j)
}
const remove = async (j: Judge) => {
  if (await askConfirm({ title: `Remove ${j.name}?`, message: 'Their scores are deleted too.', confirmLabel: 'Remove judge', danger: true })) {
    removeJudge(j.id)
  }
}

/** One slip per judge to cut out and hand over. Built locally; no internet involved. */
function printCodes() {
  const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
  const slips = data.judges.map(j => `<div class="slip"><small>Judge</small><b>${esc(j.name)}</b><small>Your code</small><code>${esc(j.code ?? '')}</code></div>`).join('')
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Judge codes</title><style>
    body{font-family:system-ui,sans-serif;margin:24px}h1{font-size:18px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .slip{border:1.5px dashed #94a3b8;border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:4px}
    small{color:#64748b;font-size:12px}b{font-size:20px}code{font-size:34px;font-weight:700;letter-spacing:.25em}
  </style><h1>${esc(props.event.name)} · judge codes</h1><div class="grid">${slips}</div><script>print()<\/script>`)
  w.document.close()
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <section aria-labelledby="recv-title" class="card p-5 flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2 id="recv-title" class="display text-xl font-bold">Sheets received</h2>
          <span class="text-[13px] text-muted">One square per entry. Green means this laptop has that judge's sheet.</span>
        </div>
        <div class="flex items-center gap-4 text-[13px]">
          <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded bg-ok"></span>Received</span>
          <span class="flex items-center gap-1.5"><span class="w-3.5 h-3.5 rounded bg-sunken border-2 border-dashed border-line-strong"></span>Not yet</span>
          <button class="btn" :disabled="!!event.finalized_at" @click="emit('import', null)"><Icon name="upload" :size="16" />Import sheets</button>
        </div>
      </div>

      <p v-if="!data.judges.length" class="py-6 text-center text-muted">No judges yet. Add them below.</p>
      <p v-else-if="!entries.length" class="py-6 text-center text-muted">No entries yet. Add them under Setup.</p>
      <div v-else class="overflow-x-auto -mx-1 px-1">
        <div role="table" aria-label="Sheets received per judge and entry" class="min-w-fit flex flex-col gap-1.5">
          <div v-if="hasCats" role="row" class="grid gap-1 items-end" :style="{ gridTemplateColumns: cols }">
            <span></span>
            <span
              v-for="g in gs" :key="g.id ?? 'none'" role="columnheader"
              class="text-xs font-bold text-muted border-b-2 border-line-strong pb-1 mx-0.5"
              :style="{ gridColumn: `span ${g.candidates.length}` }"
            >{{ g.name }}</span>
            <span></span>
          </div>
          <div role="row" class="grid gap-1 items-end" :style="{ gridTemplateColumns: cols }">
            <span role="columnheader" class="text-xs font-semibold uppercase tracking-[0.04em] text-muted">Judge</span>
            <span v-for="c in entries" :key="c.id" role="columnheader" class="num text-[11px] font-semibold text-muted text-center" :title="c.name">{{ label(c) }}</span>
            <span role="columnheader" class="text-xs font-semibold uppercase tracking-[0.04em] text-muted pl-2">Tablet</span>
          </div>
          <div v-for="(r, i) in rows" :key="r.j.id" role="row" class="grid gap-1 items-center anim-fade-up" :style="{ gridTemplateColumns: cols, '--i': i }">
            <span role="rowheader" class="flex items-center gap-2 min-w-0">
              <span class="font-semibold truncate">{{ r.j.name }}</span>
              <span class="num text-xs shrink-0" :class="r.sent === entries.length ? 'text-ok font-semibold' : 'text-muted'">{{ r.sent }}/{{ entries.length }}</span>
            </span>
            <span
              v-for="c in entries" :key="c.id" role="cell"
              class="h-8 rounded-md transition-colors duration-500"
              :class="has(c, r.j) ? 'bg-ok' : 'bg-sunken border-2 border-dashed border-line-strong'"
              :title="`${label(c)} ${c.name}: ${has(c, r.j) ? 'received' : 'not yet'}`"
              :aria-label="`${label(c)}: ${has(c, r.j) ? 'received' : 'not yet'}`"
            ></span>
            <span role="cell" class="flex items-center gap-2 pl-2 min-w-0">
              <span class="dot !w-2 !h-2 shrink-0" :class="r.live ? 'ping text-ok' : r.age === null ? 'text-line-strong' : 'text-warn'"></span>
              <span class="num text-xs text-muted truncate flex-1">{{ r.age === null ? 'never' : r.live ? 'online' : ago(r.age) }}</span>
              <button
                v-if="r.sent < entries.length && !event.finalized_at" class="btn !min-h-8 !px-2 !text-xs shrink-0"
                :aria-label="`Import ${r.j.name}'s sheets`" @click="emit('import', r.j.id)"
              >Import</button>
            </span>
          </div>
        </div>
      </div>
      <p class="text-[13px] text-muted">
        A tablet that is off the hotspot keeps its sheets and sends them when it reconnects. If it never does,
        use <b>Import</b> to scan the QR code it shows under <b>Your sheets</b>.
      </p>
    </section>

    <section aria-labelledby="codes-title" class="card p-5 flex flex-col gap-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1">
          <h2 id="codes-title" class="display text-xl font-bold">Judge codes</h2>
          <span class="text-[13px] text-muted">Each judge signs in on their tablet with a 4-digit code.</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn" :aria-pressed="shown" @click="shown = !shown"><Icon name="eye" :size="16" />{{ shown ? 'Hide codes' : 'Show codes' }}</button>
          <button class="btn" :disabled="!data.judges.length" @click="printCodes"><Icon name="print" :size="16" />Print all codes</button>
          <button class="btn" @click="emit('access')"><Icon name="wifi" :size="16" />Tablet address & QR</button>
        </div>
      </div>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,420px),1fr))] gap-3">
        <li v-for="j in data.judges" :key="j.id" class="flex items-center gap-2.5 px-3.5 py-3 rounded-xl border border-line">
          <input :value="j.name" class="field flex-1 min-w-0 !h-11 font-medium" :aria-label="'Name of ' + j.name" @change="rename(j, $event)" />
          <code class="num display text-lg font-bold tracking-[0.2em] w-[92px] text-center px-2 py-1.5 rounded-lg bg-accent-soft text-accent-ink">{{ shown ? j.code : '••••' }}</code>
          <button class="icon-btn" :aria-label="`New code for ${j.name}`" title="New code" @click="newCode(j)"><Icon name="refresh" :size="16" /></button>
          <button class="icon-btn" :aria-label="'Remove ' + j.name" title="Remove judge" @click="remove(j)"><Icon name="trash" :size="16" /></button>
        </li>
      </ul>
      <form class="flex gap-2 max-w-[520px]" @submit.prevent="add">
        <input v-model="name" class="field flex-1" placeholder="Judge name" aria-label="New judge name" />
        <button class="btn btn-primary shrink-0"><Icon name="plus" />Add judge</button>
      </form>
    </section>
  </div>
</template>
