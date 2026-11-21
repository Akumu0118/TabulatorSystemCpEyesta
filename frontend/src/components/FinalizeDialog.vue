<script setup lang="ts">
import { computed, ref } from 'vue'
import { data, finalizeEvent, rankingsFor, unfinalizeEvent, updateEvent } from '../store'
import { askConfirm } from '../confirm'
import { criterionAverages, entryLabel, fmt, groups } from '../scoring'
import type { Candidate, Id, TabEvent } from '../types'
import Icon from './Icon.vue'

/**
 * Finalize in four steps: close scoring, deal with missing sheets, check the results,
 * then make them final and hand off to the presentation.
 */
const props = defineProps<{ event: TabEvent }>()
const emit = defineEmits<{ close: []; import: [judgeId: Id | null]; present: []; print: [] }>()

const ev = computed(() => props.event)
const gs = computed(() => groups(ev.value))
const hasCats = computed(() => ev.value.categories.length > 0)
const label = (c: Candidate) => entryLabel(ev.value, c)

const missing = computed(() => data.judges.map(j => ({
  judge: j,
  entries: gs.value.flatMap(g => g.candidates).filter(c => !data.scores[ev.value.id]?.[c.id]?.[j.id])
})).filter(m => m.entries.length))
const missingCount = computed(() => missing.value.reduce((n, m) => n + m.entries.length, 0))
const total = computed(() => ev.value.candidates.length * data.judges.length)
const weight = computed(() => ev.value.criteria.reduce((s, c) => s + c.weight, 0))

const STEPS = ['Close scoring', 'Missing sheets', 'Check results', 'Final'] as const
const step = ref(ev.value.finalized_at ? 3 : !ev.value.locked ? 0 : missingCount.value ? 1 : 2)
const force = ref(false)
const busy = ref(false)
const error = ref('')

async function closeScoring() {
  busy.value = true
  error.value = (await updateEvent(ev.value, { locked: true })) ?? ''
  busy.value = false
  if (!error.value) step.value = missingCount.value ? 1 : 2
}
function goCheck(withMissing: boolean) {
  force.value = withMissing
  error.value = ''
  step.value = 2
}

/** Per category: the top three, and whether 1st is tied. */
const podiums = computed(() => {
  const rows = rankingsFor(ev.value)
  return gs.value.map(g => {
    const ids = new Set(g.candidates.map(c => c.id))
    const r = rows.filter(x => ids.has(x.id) && x.judged > 0)
    return { g, top: r.slice(0, 3), tie: r.length > 1 && r[0].avg === r[1].avg }
  })
})
const awards = computed(() => ev.value.criteria.map(k => ({
  k,
  per: gs.value.map(g => {
    let best: { c: Candidate; avg: number } | null = null
    for (const c of g.candidates) {
      const a = criterionAverages(ev.value, data.judges, data.scores, c.id)[k.id]
      if (a !== null && (!best || a > best.avg)) best = { c, avg: a }
    }
    return { g, best }
  })
})))
const checks = computed(() => [
  { ok: ev.value.locked, text: ev.value.locked ? 'Scoring is closed.' : 'Scoring is still open.' },
  {
    ok: !missingCount.value,
    text: missingCount.value
      ? `${missingCount.value} of ${total.value} sheets are missing; results use the sheets that are in.`
      : `All ${total.value} sheets are in.`
  },
  { ok: weight.value === 100, text: `Criteria weights add up to ${weight.value}%.` },
  ...podiums.value.filter(p => p.tie).map(p => ({ ok: false, text: `Tie for 1st${p.g.name ? ` in ${p.g.name}` : ''}: they share the title in the presentation.` }))
])

async function finalize() {
  busy.value = true
  error.value = ''
  try {
    const res = await finalizeEvent(ev.value, force.value)
    if (res) {
      error.value = `${res.length} sheet${res.length > 1 ? 's are' : ' is'} still missing on the server. Import them, or continue with them missing.`
      step.value = 1
    } else step.value = 3
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function undo() {
  if (!(await askConfirm({
    title: 'Undo finalizing?',
    message: 'The results go back to provisional. The presentation shows a rehearsal watermark until you finalize again.',
    confirmLabel: 'Undo'
  }))) return
  busy.value = true
  await unfinalizeEvent(ev.value)
  busy.value = false
  step.value = 2
}
const when = computed(() => ev.value.finalized_at ? new Date(ev.value.finalized_at).toLocaleString() : '')
const MEDAL = ['bg-gold text-surface', 'bg-[#94A3B8] text-white', 'bg-[#B87333] text-white']
</script>

<template>
  <Teleport to="body">
    <div class="scrim !items-start" @click.self="emit('close')">
      <div class="dialog max-w-[760px] my-6" role="dialog" aria-modal="true" aria-labelledby="fin-title">
        <div class="flex items-start justify-between gap-3 px-6 pt-[22px]">
          <div class="flex flex-col gap-1">
            <h2 id="fin-title" class="display text-[22px] font-bold">Finalize results</h2>
            <span class="text-sm text-muted">{{ ev.name }}</span>
          </div>
          <button class="icon-btn" aria-label="Close" @click="emit('close')"><Icon name="x" /></button>
        </div>

        <ol class="grid grid-cols-4 gap-2 px-6 pt-5" aria-label="Steps">
          <li v-for="(s, i) in STEPS" :key="s" class="flex flex-col gap-1.5" :aria-current="step === i ? 'step' : undefined">
            <span class="h-1.5 rounded-full transition-colors duration-300" :class="i < step || ev.finalized_at ? 'bg-ok' : i === step ? 'bg-accent' : 'bg-sunken'"></span>
            <span class="text-xs font-semibold flex items-center gap-1" :class="i === step ? 'text-ink' : 'text-muted'">
              <Icon v-if="i < step || (ev.finalized_at && i === 3)" name="check" :size="13" class="text-ok" />
              <span v-else class="num">{{ i + 1 }}.</span>{{ s }}
            </span>
          </li>
        </ol>

        <div class="px-6 py-5 min-h-[300px] flex flex-col gap-4">
          <!-- 1 close scoring -->
          <template v-if="step === 0">
            <h3 class="display text-lg font-bold">Close scoring</h3>
            <p class="text-sm">
              Judges' tablets stop accepting changes. Sheets saved on a tablet but not yet sent can still be brought in
              with <b>Scan QR / type in</b> in the next step.
            </p>
            <div class="flex items-center gap-3 px-4 py-3 rounded-xl" :class="ev.locked ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'">
              <Icon :name="ev.locked ? 'lock' : 'unlock'" />
              <span class="font-semibold">{{ ev.locked ? 'Scoring is closed.' : 'Scoring is open right now.' }}</span>
            </div>
          </template>

          <!-- 2 missing sheets -->
          <template v-else-if="step === 1">
            <h3 class="display text-lg font-bold">Missing sheets</h3>
            <p v-if="!missingCount" class="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-ok-soft text-ok font-semibold">
              <Icon name="check" />All {{ total }} sheets are in.
            </p>
            <template v-else>
              <p class="text-sm">
                <b>{{ missingCount }} of {{ total }}</b> sheets have not reached this laptop. Ask the judge to open
                <b>Your sheets</b> on their tablet and scan its QR code, or type the scores in.
              </p>
              <ul class="card flex flex-col max-h-[300px] overflow-y-auto">
                <li v-for="(m, i) in missing" :key="m.judge.id" class="flex items-center gap-3 px-4 py-3" :class="{ 'border-t border-line': i > 0 }">
                  <span class="flex-1 min-w-0 flex flex-col">
                    <b>{{ m.judge.name }}</b>
                    <span class="num text-xs text-muted truncate">{{ m.entries.length }} missing: {{ m.entries.map(label).join(', ') }}</span>
                  </span>
                  <button class="btn !min-h-10 shrink-0" @click="emit('import', m.judge.id)"><Icon name="qr" :size="16" />Scan QR / type in</button>
                </li>
              </ul>
            </template>
          </template>

          <!-- 3 check results -->
          <template v-else-if="step === 2">
            <h3 class="display text-lg font-bold">Check the results</h3>
            <div class="grid gap-3" :class="podiums.length > 1 ? 'sm:grid-cols-2' : ''">
              <section v-for="p in podiums" :key="p.g.id ?? 'none'" class="card p-4 flex flex-col gap-2.5">
                <h4 class="font-bold text-sm">{{ hasCats ? p.g.name : 'Top three' }}</h4>
                <p v-if="!p.top.length" class="text-sm text-muted">No sheets yet.</p>
                <ol class="flex flex-col gap-2">
                  <li v-for="r in p.top" :key="r.id" class="flex items-center gap-2.5">
                    <span class="num w-7 h-7 rounded-full grid place-items-center text-xs font-bold shrink-0" :class="MEDAL[r.rank - 1] ?? 'bg-sunken'">{{ r.rank }}</span>
                    <span class="num text-muted text-sm">{{ label(r) }}</span>
                    <span class="font-semibold truncate flex-1">{{ r.name }}</span>
                    <span class="num display font-bold">{{ fmt(r.avg) }}</span>
                  </li>
                </ol>
              </section>
            </div>
            <section v-if="awards.length" class="flex flex-col gap-1.5">
              <h4 class="font-bold text-sm">Criterion awards</h4>
              <ul class="text-sm flex flex-col gap-1">
                <li v-for="a in awards" :key="a.k.id" class="flex flex-wrap gap-x-3">
                  <span class="text-muted w-32 shrink-0 truncate">{{ a.k.name }}</span>
                  <span v-for="x in a.per" :key="x.g.id ?? 'none'">
                    <template v-if="hasCats">{{ x.g.name }}: </template>
                    <b v-if="x.best">{{ label(x.best.c) }} {{ x.best.c.name }}</b><span v-else class="text-muted">–</span>
                  </span>
                </li>
              </ul>
            </section>
            <ul class="flex flex-col gap-1.5 text-sm">
              <li v-for="c in checks" :key="c.text" class="flex items-start gap-2">
                <Icon :name="c.ok ? 'check' : 'alert'" :size="16" :class="c.ok ? 'text-ok' : 'text-warn'" class="shrink-0 mt-0.5" />{{ c.text }}
              </li>
            </ul>
          </template>

          <!-- 4 final -->
          <template v-else>
            <div class="flex flex-col items-center text-center gap-3 py-4 anim-pop">
              <span class="w-16 h-16 rounded-full bg-gold-soft text-gold grid place-items-center"><Icon name="check" :size="32" /></span>
              <h3 class="display text-2xl font-bold">Results are final</h3>
              <p class="text-sm text-muted">Made final {{ when }}. The tally and the presentation now use these results.</p>
            </div>
            <div class="grid sm:grid-cols-2 gap-3">
              <button class="btn btn-primary btn-lg" @click="emit('present')"><Icon name="play" :size="18" />Present results</button>
              <button class="btn btn-lg" @click="emit('print')"><Icon name="print" :size="18" />Print tally</button>
            </div>
          </template>

          <p v-if="error" role="alert" class="text-sm font-semibold text-danger">{{ error }}</p>
        </div>

        <div class="flex items-center gap-2.5 px-6 py-4 border-t border-line">
          <button v-if="step === 1 || step === 2" class="btn" :disabled="busy" @click="step--">Back</button>
          <button v-if="step === 3" class="btn" :disabled="busy" @click="undo">Undo finalizing</button>
          <span class="flex-1"></span>
          <template v-if="step === 0">
            <button v-if="ev.locked" class="btn btn-primary" @click="step = 1">Next<Icon name="arrowRight" :size="16" /></button>
            <button v-else class="btn btn-primary" :disabled="busy" @click="closeScoring"><Icon name="lock" :size="16" />Close scoring</button>
          </template>
          <template v-else-if="step === 1">
            <button v-if="!missingCount" class="btn btn-primary" @click="goCheck(false)">Next<Icon name="arrowRight" :size="16" /></button>
            <button v-else class="btn btn-primary" @click="goCheck(true)">Continue with {{ missingCount }} missing<Icon name="arrowRight" :size="16" /></button>
          </template>
          <button v-else-if="step === 2" class="btn btn-primary" :disabled="busy || !ev.locked" @click="finalize">
            <Icon name="check" :size="16" />{{ busy ? 'Finalizing…' : 'Make results final' }}
          </button>
          <button v-else class="btn" @click="emit('close')">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
