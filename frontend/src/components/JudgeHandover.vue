<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { encodeHandover, type HandoverPayload } from '../handover'
import { entryLabel } from '../scoring'
import type { TabEvent } from '../types'
import Icon from './Icon.vue'

/**
 * Shows this phone's sheets as a cycle of QR codes the organizer scans with "Import sheets".
 * Works with no network at all; the newest copy of each sheet wins on the tabulator.
 */
const props = defineProps<{ payload: HandoverPayload; event: TabEvent; judgeName: string }>()
const emit = defineEmits<{ close: [] }>()

const parts = computed(() => encodeHandover(props.payload))
const images = ref<string[]>([])
const idx = ref(0)
const paused = ref(false)
const showTable = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

watch(parts, async list => {
  idx.value = 0
  images.value = await Promise.all(list.map(text =>
    QRCode.toDataURL(text, { margin: 2, width: 560, errorCorrectionLevel: 'L' }).catch(() => '')))
}, { immediate: true })

function restart() {
  clearInterval(timer)
  timer = setInterval(() => {
    if (!paused.value && images.value.length > 1) idx.value = (idx.value + 1) % images.value.length
  }, 1800)
}
onMounted(restart)
onBeforeUnmount(() => clearInterval(timer))
const go = (d: number) => { idx.value = (idx.value + d + images.value.length) % images.value.length; restart() }

const crit = computed(() => props.event.criteria)
const rows = computed(() => props.payload.sheets.map(s => ({
  ...s,
  candidate: props.event.candidates.find(c => c.id === s.candidateId)
})).sort((a, b) => (a.candidate?.number ?? 0) - (b.candidate?.number ?? 0)))
</script>

<template>
  <section aria-labelledby="handover-title" class="flex flex-col gap-3 anim-fade-up">
    <div class="card p-4 flex flex-col items-center gap-3.5 text-center">
      <div class="flex flex-col gap-1">
        <h2 id="handover-title" class="display text-lg font-bold">Show this to the organizer</h2>
        <p class="text-[13px] text-muted leading-normal">
          They scan it with <b class="text-ink">Import sheets</b> on the tabulator. Turn your screen brightness up.
          No Wi-Fi is needed.
        </p>
      </div>

      <div v-if="!payload.sheets.length" class="py-10 text-muted">No sheets to hand over yet.</div>
      <template v-else>
        <div class="relative w-full max-w-[300px] aspect-square rounded-2xl bg-white p-2 shadow-[0_8px_30px_rgba(15,23,42,.12)] grid place-items-center overflow-hidden">
          <Transition name="fade" mode="out-in">
            <img v-if="images[idx]" :key="idx" :src="images[idx]" :alt="`Hand-over code, part ${idx + 1} of ${images.length}`" class="w-full h-full [image-rendering:pixelated]" />
            <span v-else class="w-8 h-8 rounded-full border-2 border-accent border-t-transparent anim-spin"></span>
          </Transition>
        </div>

        <div class="flex items-center gap-3">
          <button class="icon-btn" aria-label="Previous code" :disabled="images.length < 2" @click="go(-1)">‹</button>
          <div class="flex flex-col items-center gap-1.5">
            <span class="num text-sm font-semibold">Part {{ idx + 1 }} of {{ images.length }}</span>
            <div class="flex gap-1" aria-hidden="true">
              <span
                v-for="(_, i) in images" :key="i"
                class="h-1.5 rounded-full transition-all duration-300"
                :class="i === idx ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"
              ></span>
            </div>
          </div>
          <button class="icon-btn" aria-label="Next code" :disabled="images.length < 2" @click="go(1)">›</button>
        </div>
        <button v-if="images.length > 1" class="btn !min-h-10 !text-[13px]" @click="paused = !paused">
          {{ paused ? 'Resume cycling' : 'Pause on this code' }}
        </button>
        <p class="num text-xs text-muted">{{ judgeName }} · {{ event.name }} · {{ payload.sheets.length }} sheet{{ payload.sheets.length === 1 ? '' : 's' }}</p>
      </template>
    </div>

    <button v-if="payload.sheets.length" class="btn btn-lg" :aria-expanded="showTable" @click="showTable = !showTable">
      <Icon name="eye" />{{ showTable ? 'Hide the scores' : 'Camera not working? Show the scores' }}
    </button>
    <section v-if="showTable" aria-label="Scores to type in" class="card overflow-x-auto anim-fade-up">
      <table class="num w-full text-sm border-collapse">
        <thead>
          <tr class="text-[11px] uppercase tracking-[0.04em] text-muted">
            <th scope="col" class="text-left px-3 py-2.5 font-semibold">No.</th>
            <th v-for="k in crit" :key="k.id" scope="col" class="px-2 py-2.5 font-semibold text-right">{{ k.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.candidateId" class="border-t border-line">
            <th scope="row" class="text-left px-3 py-2.5 font-bold">{{ r.candidate ? entryLabel(event, r.candidate) : '?' }}</th>
            <td v-for="k in crit" :key="k.id" class="px-2 py-2.5 text-right font-semibold">{{ r.scores[k.id] ?? '–' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="px-3 py-2.5 text-xs text-muted border-t border-line">The organizer types these into <b>Import sheets › Type in</b>.</p>
    </section>

    <button class="btn btn-lg" @click="emit('close')">Back to my sheets</button>
  </section>
</template>
