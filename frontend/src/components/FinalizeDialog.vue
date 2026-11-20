<script setup lang="ts">
import { computed, ref } from 'vue'
import { data, finalizeEvent, unfinalizeEvent, updateEvent } from '../store'
import { askConfirm } from '../confirm'
import type { Id, TabEvent } from '../types'
import Icon from './Icon.vue'

/** Checklist before the results are made final, then the hand-off to the presentation. */
const props = defineProps<{ event: TabEvent }>()
const emit = defineEmits<{ close: []; import: [judgeId: Id]; present: [] }>()

const force = ref(false)
const busy = ref(false)
const error = ref('')
const serverMissing = ref<{ judgeId: Id; candidateId: Id }[] | null>(null)

const missing = computed(() => {
  const ev = props.event
  return data.judges.map(j => ({
    judge: j,
    entries: ev.candidates.filter(c => !data.scores[ev.id]?.[c.id]?.[j.id]).sort((a, b) => a.number - b.number)
  })).filter(m => m.entries.length)
})
const missingCount = computed(() => missing.value.reduce((n, m) => n + m.entries.length, 0))
const weight = computed(() => props.event.criteria.reduce((s, c) => s + c.weight, 0))
const final = computed(() => !!props.event.finalized_at)
const justFinalized = ref(false)

const checks = computed(() => [
  { ok: props.event.locked, title: 'Scoring is closed', text: props.event.locked ? 'Judges can no longer change sheets.' : 'Close scoring first so no sheet changes after the results are final.' },
  { ok: !missingCount.value, title: 'Every sheet is in', text: missingCount.value ? `${missingCount.value} sheet${missingCount.value === 1 ? '' : 's'} missing.` : `${props.event.candidates.length * data.judges.length} sheets from ${data.judges.length} judges.` },
  { ok: weight.value === 100, title: 'Weights add up to 100%', text: `Currently ${weight.value}%.`, soft: true }
])

async function finalize() {
  busy.value = true
  error.value = ''
  try {
    const res = await finalizeEvent(props.event, force.value)
    if (res) { serverMissing.value = res; force.value = false } else justFinalized.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
async function reopen() {
  if (!(await askConfirm({
    title: 'Reopen the results?',
    message: 'The presentation shows a rehearsal watermark until you finalize again.',
    confirmLabel: 'Reopen'
  }))) return
  busy.value = true
  await unfinalizeEvent(props.event)
  busy.value = false
  justFinalized.value = false
}
const when = computed(() => props.event.finalized_at ? new Date(props.event.finalized_at).toLocaleString() : '')
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click.self="emit('close')">
      <div class="dialog max-w-[560px] relative overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="fin-title">
        <!-- Final -->
        <div v-if="final" class="px-6 py-8 flex flex-col items-center gap-3 text-center">
          <div class="relative w-20 h-20 grid place-items-center">
            <span v-if="justFinalized" class="absolute inset-0 rounded-full bg-gold/30 animate-[burst_1.2s_ease-out_both]"></span>
            <span v-if="justFinalized" class="absolute inset-0 rounded-full bg-gold/20 animate-[burst_1.2s_.25s_ease-out_both]"></span>
            <span class="relative w-20 h-20 rounded-full bg-gold text-surface grid place-items-center anim-pop"><Icon name="check" :size="38" /></span>
          </div>
          <h2 id="fin-title" class="display text-2xl font-bold anim-fade-up" style="--i: 2">Results are final</h2>
          <p class="text-sm text-muted anim-fade-up" style="--i: 3">{{ event.name }} · finalized {{ when }}. Scores can't change unless you reopen.</p>
          <div class="flex flex-wrap justify-center gap-2.5 mt-3 anim-fade-up" style="--i: 4">
            <button class="btn" :disabled="busy" @click="reopen"><Icon name="unlock" />Reopen results</button>
            <button class="btn btn-primary btn-lg" @click="emit('present')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              Start presentation
            </button>
          </div>
          <button class="text-sm text-muted underline underline-offset-2 mt-1" @click="emit('close')">Close</button>
        </div>

        <!-- Checklist -->
        <template v-else>
          <div class="flex items-start justify-between gap-3 px-6 pt-[22px]">
            <div class="flex flex-col gap-1">
              <h2 id="fin-title" class="display text-[22px] font-bold">Finalize results</h2>
              <span class="text-sm text-muted">Locks the tally for {{ event.name }} so it can be presented.</span>
            </div>
            <button class="icon-btn" aria-label="Close" @click="emit('close')"><Icon name="x" /></button>
          </div>
          <div class="px-6 py-5 flex flex-col gap-4">
            <ul class="flex flex-col gap-2.5">
              <li v-for="(c, i) in checks" :key="c.title" class="flex gap-3 p-3.5 rounded-xl border border-line anim-fade-up" :style="{ '--i': i }">
                <span class="w-7 h-7 shrink-0 rounded-full grid place-items-center"
                      :class="c.ok ? 'bg-ok-soft text-ok' : c.soft ? 'bg-sunken text-muted' : 'bg-warn-soft text-warn'">
                  <Icon :name="c.ok ? 'check' : 'alert'" :size="16" />
                </span>
                <span class="flex-1 flex flex-col gap-0.5">
                  <b class="text-[15px]">{{ c.title }}</b>
                  <span class="text-[13px] text-muted">{{ c.text }}</span>
                </span>
                <button v-if="i === 0 && !c.ok" class="btn !min-h-9 shrink-0 self-center" @click="updateEvent(event, { locked: true })"><Icon name="lock" :size="16" />Close now</button>
              </li>
            </ul>

            <div v-if="missing.length" class="flex flex-col gap-2 p-3.5 rounded-xl bg-warn-soft anim-fade-up" style="--i: 3">
              <p class="text-sm font-semibold text-warn">Missing sheets</p>
              <ul class="flex flex-col gap-1.5">
                <li v-for="m in missing" :key="m.judge.id" class="flex items-center gap-2 text-sm">
                  <span class="flex-1"><b>{{ m.judge.name }}</b> · #{{ m.entries.map(e => e.number).join(', #') }}</span>
                  <button class="btn !min-h-8 !px-2.5 !text-xs" @click="emit('import', m.judge.id)">Import</button>
                </li>
              </ul>
              <label class="flex items-start gap-2.5 mt-1 text-sm">
                <input v-model="force" type="checkbox" class="mt-1 w-4 h-4 accent-[var(--warn)]" />
                <span>Finalize anyway. Missing sheets are left out; those entries are averaged over the judges who scored them.</span>
              </label>
            </div>
            <p v-if="serverMissing && !missing.length" class="text-sm text-warn">The tabulator still reports {{ serverMissing.length }} missing sheet(s). Check the box to finalize anyway.</p>
            <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>

            <div class="flex justify-end gap-2.5 pt-1">
              <button class="btn" @click="emit('present')">Rehearse presentation</button>
              <button class="btn btn-primary" :disabled="busy || !event.locked || (missingCount > 0 && !force)" @click="finalize">
                <span v-if="busy" class="w-4 h-4 rounded-full border-2 border-current border-t-transparent anim-spin"></span>
                Finalize results
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
