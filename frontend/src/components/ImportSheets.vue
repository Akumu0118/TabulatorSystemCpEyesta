<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { data, importSheets } from '../store'
import { entryLabel, fmt, groups, judgeTotal, parseScore, scoreError } from '../scoring'
import { HandoverCollector, toImportItems, type HandoverPayload } from '../handover'
import type { Id, ImportItem, TabEvent } from '../types'
import Icon from './Icon.vue'

/**
 * Brings a judge's sheets onto the tabulator without the network:
 *   Scan  - the judge's phone shows cycling QR codes (Hand over); the webcam collects every part.
 *   Paste - the same codes as text, e.g. from a USB barcode scanner.
 *   Type  - the organizer copies the numbers from the judge's screen or paper.
 * The newest copy of each sheet wins, so importing something already received is harmless.
 */
const props = defineProps<{ event: TabEvent; judgeId?: Id | null }>()
const emit = defineEmits<{ close: [] }>()

type Tab = 'scan' | 'paste' | 'type'
const tab = ref<Tab>('scan')
const phase = ref<'collect' | 'preview' | 'done'>('collect')
const error = ref('')
const busy = ref(false)
const result = ref<{ saved: number; stale: number; rejected: string[] } | null>(null)

/* ---- QR collection (scan + paste) ---- */
const collector = new HandoverCollector()
const progress = reactive({ received: [] as number[], total: 0, judgeId: null as Id | null, flash: 0 })
const payload = ref<HandoverPayload | null>(null)

function onCode(text: string): boolean {
  const r = collector.add(text)
  if (r === 'invalid') return false
  progress.received = collector.received
  progress.total = collector.total
  progress.judgeId = collector.judgeId
  if (r === 'new' || r === 'other') progress.flash++
  if (collector.done) {
    payload.value = collector.complete()
    if (payload.value) { stopCam(); phase.value = 'preview' } else error.value = 'The codes could not be read. Start again.'
  }
  return true
}
const judgeName = (id: Id | null | undefined) => data.judges.find(j => j.id === id)?.name ?? `Judge ${id}`

/* ---- webcam ---- */
const video = ref<HTMLVideoElement | null>(null)
const camError = ref('')
const scanning = ref(false)
let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | undefined

async function startCam() {
  camError.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    camError.value = 'The camera only works on a secure page. Open the tabulator at http://localhost on this computer, or use Paste or Type in.'
    return
  }
  try {
    const { default: jsQR } = await import('jsqr')
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
    const v = video.value!
    v.srcObject = stream
    await v.play()
    scanning.value = true
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const loop = () => {
      if (!scanning.value) return
      if (v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 800 / v.videoWidth)
        canvas.width = Math.round(v.videoWidth * scale)
        canvas.height = Math.round(v.videoHeight * scale)
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code?.data) onCode(code.data)
      }
      timer = setTimeout(loop, 120)
    }
    loop()
  } catch {
    camError.value = 'No camera, or permission was denied. Allow the camera in the browser, or use Paste or Type in.'
    stopCam()
  }
}
function stopCam() {
  scanning.value = false
  clearTimeout(timer)
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}
watch(tab, t => { if (t !== 'scan') stopCam() })
onBeforeUnmount(stopCam)

/* ---- paste ---- */
const pasted = ref('')
function readPasted() {
  error.value = ''
  const lines = pasted.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const ok = lines.filter(onCode).length
  if (!ok) error.value = 'No hand-over codes found. Each line should start with TAB1|.'
  else if (phase.value === 'collect') error.value = `Read ${progress.received.length} of ${progress.total} parts. Paste the rest.`
}

/* ---- type in ---- */
const typeJudge = ref<Id | null>(props.judgeId ?? data.judges[0]?.id ?? null)
const grid = ref<Record<string, number | ''>>({})
const gkey = (cId: Id, kId: Id) => `${cId}:${kId}`
const entries = computed(() => groups(props.event).flatMap(g => g.candidates))
const label = (c: { number: number; category: number | null }) => entryLabel(props.event, c)
const existing = (cId: Id, kId: Id): number | '' =>
  (typeJudge.value !== null ? data.scores[props.event.id]?.[cId]?.[typeJudge.value]?.[kId] : undefined) ?? ''
watch(typeJudge, () => { grid.value = {} })
const cell = (cId: Id, kId: Id) => (gkey(cId, kId) in grid.value ? grid.value[gkey(cId, kId)] : existing(cId, kId))
const setCell = (cId: Id, kId: Id, raw: string) => { grid.value[gkey(cId, kId)] = parseScore(raw) }
const rowChanged = (cId: Id) => props.event.criteria.some(k => gkey(cId, k.id) in grid.value && grid.value[gkey(cId, k.id)] !== existing(cId, k.id))
const rowComplete = (cId: Id) => props.event.criteria.every(k => cell(cId, k.id) !== '' && !scoreError(k, cell(cId, k.id)))
const typedItems = computed<ImportItem[]>(() => entries.value
  .filter(c => rowChanged(c.id) && rowComplete(c.id))
  .map(c => ({
    eventId: props.event.id, candidateId: c.id, capturedAt: Date.now(),
    scores: Object.fromEntries(props.event.criteria.map(k => [k.id, Number(cell(c.id, k.id))]))
  })))
const typedIncomplete = computed(() => entries.value.filter(c => rowChanged(c.id) && !rowComplete(c.id)).length)

/* ---- import ---- */
const previewEvent = computed(() => data.events.find(e => e.id === payload.value?.eventId))
const previewRows = computed(() => {
  const ev = previewEvent.value
  if (!payload.value || !ev) return []
  return payload.value.sheets.map(s => ({
    ...s,
    entry: ev.candidates.find(c => c.id === s.candidateId),
    total: judgeTotal(ev, s.scores),
    onFile: !!data.scores[ev.id]?.[s.candidateId]?.[payload.value!.judgeId]
  })).sort((a, b) => (a.entry?.number ?? 0) - (b.entry?.number ?? 0))
})

async function run(judgeId: Id, source: 'qr' | 'manual', items: ImportItem[]) {
  busy.value = true
  error.value = ''
  try {
    const res = await importSheets(judgeId, source, items)
    result.value = {
      saved: res.saved.filter(s => !s.stale).length,
      stale: res.saved.filter(s => s.stale).length,
      rejected: res.rejected.map(r => r.reason)
    }
    phase.value = 'done'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const importQr = () => payload.value && run(payload.value.judgeId, 'qr', toImportItems(payload.value))
const importTyped = () => typeJudge.value !== null && run(typeJudge.value, 'manual', typedItems.value)

function again() {
  collector.reset()
  Object.assign(progress, { received: [], total: 0, judgeId: null })
  payload.value = null
  pasted.value = ''
  grid.value = {}
  result.value = null
  error.value = ''
  phase.value = 'collect'
}
</script>

<template>
  <Teleport to="body">
    <div class="scrim !items-start" @click.self="emit('close')">
      <div class="dialog max-w-[820px] my-6" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div class="flex items-start justify-between gap-3 px-6 pt-[22px]">
          <div class="flex flex-col gap-1">
            <h2 id="import-title" class="display text-[22px] font-bold">Import sheets</h2>
            <span class="text-sm text-muted">For a phone that can't reach the tabulator. The newest copy of each sheet is kept.</span>
          </div>
          <button class="icon-btn" aria-label="Close" @click="emit('close')"><Icon name="x" /></button>
        </div>

        <div class="px-6 py-5 flex flex-col gap-4">
          <!-- Done -->
          <div v-if="phase === 'done' && result" class="flex flex-col items-center gap-3 py-6 text-center">
            <span class="w-16 h-16 rounded-full bg-ok-soft text-ok grid place-items-center anim-pop"><Icon name="check" :size="32" /></span>
            <h3 class="display text-xl font-bold anim-fade-up">{{ result.saved }} sheet{{ result.saved === 1 ? '' : 's' }} imported</h3>
            <p class="text-sm text-muted anim-fade-up" style="--i: 2">
              <template v-if="result.stale">{{ result.stale }} already had a newer copy on the tabulator and were kept as they were. </template>
              <template v-if="result.rejected.length">{{ result.rejected.length }} not accepted: {{ result.rejected[0] }}</template>
            </p>
            <div class="flex gap-2.5 mt-2">
              <button class="btn" @click="again">Import more</button>
              <button class="btn btn-primary" @click="emit('close')">Done</button>
            </div>
          </div>

          <!-- Preview of scanned / pasted codes -->
          <template v-else-if="phase === 'preview' && payload">
            <div class="flex items-center gap-3 p-4 rounded-xl bg-ok-soft text-ok anim-fade-up">
              <Icon name="check" :size="22" />
              <span class="text-sm"><b>All {{ progress.total }} part{{ progress.total === 1 ? '' : 's' }} read.</b>
                {{ judgeName(payload.judgeId) }} · {{ previewEvent?.name ?? 'Unknown event' }} · {{ payload.sheets.length }} sheets</span>
            </div>
            <p v-if="!previewEvent" role="alert" class="text-sm text-danger">This event is not on the tabulator. It may have been deleted.</p>
            <div v-else class="card overflow-x-auto">
              <table class="num w-full text-sm border-collapse">
                <thead>
                  <tr class="text-[11px] uppercase tracking-[0.04em] text-muted">
                    <th scope="col" class="text-left px-3 py-2.5 font-semibold">Entry</th>
                    <th v-for="k in previewEvent.criteria" :key="k.id" scope="col" class="px-2 py-2.5 text-right font-semibold">{{ k.name }}</th>
                    <th scope="col" class="px-2 py-2.5 text-right font-semibold">Total</th>
                    <th scope="col" class="px-3 py-2.5 text-left font-semibold">On tabulator</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in previewRows" :key="r.candidateId" class="border-t border-line anim-fade-up" :style="{ '--i': i }">
                    <th scope="row" class="text-left px-3 py-2.5"><span class="text-muted">{{ r.entry ? label(r.entry) : '?' }}</span> {{ r.entry?.name ?? 'Removed entry' }}</th>
                    <td v-for="k in previewEvent.criteria" :key="k.id" class="px-2 py-2.5 text-right">{{ r.scores[k.id] ?? '–' }}</td>
                    <td class="px-2 py-2.5 text-right font-bold">{{ fmt(r.total) }}</td>
                    <td class="px-3 py-2.5 text-xs" :class="r.onFile ? 'text-muted' : 'text-accent-ink font-semibold'">{{ r.onFile ? 'Has a copy' : 'New' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
            <div class="flex justify-end gap-2.5">
              <button class="btn" @click="again">Start again</button>
              <button class="btn btn-primary" :disabled="busy || !previewEvent" @click="importQr">
                <span v-if="busy" class="w-4 h-4 rounded-full border-2 border-current border-t-transparent anim-spin"></span>
                Import {{ payload.sheets.length }} sheet{{ payload.sheets.length === 1 ? '' : 's' }}
              </button>
            </div>
          </template>

          <!-- Collect -->
          <template v-else>
            <div role="tablist" aria-label="Import method" class="grid grid-cols-3 gap-1 p-1 rounded-xl bg-sunken">
              <button
                v-for="t in ([['scan', 'Scan QR'], ['paste', 'Paste codes'], ['type', 'Type in']] as const)" :key="t[0]"
                role="tab" :aria-selected="tab === t[0]" class="h-10 rounded-[9px] text-sm font-semibold transition-colors"
                :class="tab === t[0] ? 'bg-surface shadow-sm text-ink' : 'text-muted'" @click="tab = t[0]"
              >{{ t[1] }}</button>
            </div>

            <div v-if="tab === 'scan'" class="grid sm:grid-cols-[1fr_220px] gap-4 items-start">
              <div class="relative aspect-video rounded-xl bg-[#0B1120] overflow-hidden grid place-items-center">
                <video ref="video" class="absolute inset-0 w-full h-full object-cover" :class="{ invisible: !scanning }" playsinline muted></video>
                <div v-if="scanning" class="absolute inset-[18%] border-2 border-white/70 rounded-2xl pointer-events-none">
                  <span class="absolute inset-x-0 h-0.5 bg-[#34D399] shadow-[0_0_12px_#34D399] animate-[scanline_2s_ease-in-out_infinite]"></span>
                </div>
                <div v-if="!scanning" class="relative flex flex-col items-center gap-3 p-6 text-center text-[#E6EAF2]">
                  <p class="text-sm max-w-[320px]">On the judge's phone: <b>Your sheets › Hand over by QR code</b>. Hold it up to this computer's camera.</p>
                  <button class="btn btn-primary" @click="startCam">Start camera</button>
                </div>
              </div>
              <div class="flex flex-col gap-3">
                <p class="text-sm font-semibold">{{ progress.total ? `${judgeName(progress.judgeId)}: ${progress.received.length} of ${progress.total} parts` : 'Waiting for a code…' }}</p>
                <div class="flex flex-wrap gap-1.5" aria-hidden="true">
                  <span
                    v-for="n in progress.total" :key="`${progress.flash}-${n}`"
                    class="num w-8 h-8 rounded-lg grid place-items-center text-xs font-bold transition-colors"
                    :class="progress.received.includes(n) ? 'bg-ok text-white anim-pop' : 'bg-sunken text-muted'"
                  >{{ n }}</span>
                </div>
                <p class="text-xs text-muted">Parts can be read in any order. Keep the phone steady about 20 cm away.</p>
                <p v-if="camError" role="alert" class="text-sm text-danger">{{ camError }}</p>
                <button v-if="scanning" class="btn" @click="stopCam">Stop camera</button>
              </div>
            </div>

            <div v-else-if="tab === 'paste'" class="flex flex-col gap-3">
              <label for="paste-codes" class="text-sm text-muted">One code per line (each starts with <code class="num">TAB1|</code>). Works with a USB barcode scanner too.</label>
              <textarea id="paste-codes" v-model="pasted" rows="6" class="field !h-auto py-3 num text-sm" placeholder="TAB1|2|1|1/3|..."></textarea>
              <p v-if="error" role="status" class="text-sm text-warn">{{ error }}</p>
              <div class="flex justify-end"><button class="btn btn-primary" :disabled="!pasted.trim()" @click="readPasted">Read codes</button></div>
            </div>

            <div v-else class="flex flex-col gap-3">
              <label class="flex items-center gap-3 text-sm font-semibold">
                Judge
                <select v-model="typeJudge" class="field !h-11 max-w-[260px]">
                  <option v-for="j in data.judges" :key="j.id" :value="j.id">{{ j.name }}</option>
                </select>
              </label>
              <div class="card overflow-x-auto">
                <table class="num w-full border-collapse" :style="{ minWidth: `${180 + event.criteria.length * 92}px` }">
                  <thead>
                    <tr class="text-[11px] uppercase tracking-[0.04em] text-muted">
                      <th scope="col" class="text-left px-3 py-2.5 font-semibold">Entry</th>
                      <th v-for="k in event.criteria" :key="k.id" scope="col" class="px-1 py-2.5 font-semibold">{{ k.name }}<span class="block normal-case tracking-normal font-normal">/ {{ k.max_score }}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in entries" :key="c.id" class="border-t border-line" :class="{ 'bg-accent-soft/40': rowChanged(c.id) }">
                      <th scope="row" class="text-left px-3 py-2 text-sm"><span class="text-muted">{{ label(c) }}</span> {{ c.name }}</th>
                      <td v-for="k in event.criteria" :key="k.id" class="px-1 py-1.5">
                        <input
                          class="score-input !h-10 !text-base !rounded-lg w-full" :class="{ filled: cell(c.id, k.id) !== '' }"
                          type="number" inputmode="decimal" min="0" :max="k.max_score" step="any" placeholder="–"
                          :value="cell(c.id, k.id)" :aria-label="`Entry ${label(c)}, ${k.name}`"
                          :aria-invalid="!!scoreError(k, cell(c.id, k.id))" :title="scoreError(k, cell(c.id, k.id)) || undefined"
                          @input="setCell(c.id, k.id, ($event.target as HTMLInputElement).value)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="text-xs text-muted">Boxes start with what the tabulator already has. Only changed, complete rows are imported.</p>
              <p v-if="typedIncomplete" class="text-sm text-warn">{{ typedIncomplete }} changed row{{ typedIncomplete === 1 ? ' is' : 's are' }} incomplete or above the highest score.</p>
              <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
              <div class="flex justify-end">
                <button class="btn btn-primary" :disabled="busy || !typedItems.length || typeJudge === null" @click="importTyped">
                  <span v-if="busy" class="w-4 h-4 rounded-full border-2 border-current border-t-transparent anim-spin"></span>
                  Import {{ typedItems.length }} sheet{{ typedItems.length === 1 ? '' : 's' }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
