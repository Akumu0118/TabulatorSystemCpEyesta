<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDeck } from './useDeck'
import { cue, stepLabel } from '../../presentation'
import { useNow } from '../../motion'
import { askConfirm } from '../../confirm'
import PresentationStage from './PresentationStage.vue'
import logo from '../../assets/brand/icpep-logo.png'

/** The organizer's screen: the live slide, what comes next, cues, a timer and the controls. */
const props = defineProps<{ eventId: number }>()
const { event, steps, index, blank, startedAt, next, prev, go, toggleBlank } = useDeck(() => props.eventId, 'presenter')
const now = useNow(1000)

const current = computed(() => steps.value[Math.min(index.value, steps.value.length - 1)])
const upcoming = computed(() => steps.value[index.value + 1])
const elapsed = computed(() => {
  if (startedAt.value === null) return '00:00'
  const s = Math.floor((now.value - startedAt.value) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})
const clock = computed(() => new Date(now.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))

let audience: Window | null = null
function openAudience() {
  const url = `${location.pathname}${location.search}#/present/${props.eventId}`
  audience = window.open(url, `tab-audience-${props.eventId}`, 'popup,width=1280,height=720')
  audience?.focus()
}
async function exit() {
  if (index.value > 0 && !(await askConfirm({
    title: 'Leave the presentation?',
    message: 'The audience window closes. Opening the presentation again resumes at this slide.',
    confirmLabel: 'Leave'
  }))) return
  audience?.close()
  location.hash = ''
}

const list = ref<HTMLElement | null>(null)
watch(index, async () => {
  await nextTick()
  list.value?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>

<template>
  <div class="fixed inset-0 flex flex-col bg-[#060B17] text-[#E6EAF2] select-none">
    <header class="flex items-center gap-4 px-5 h-16 border-b border-white/10 shrink-0">
      <img :src="logo" alt="" class="w-9 h-9 object-contain" />
      <div class="min-w-0 flex-1">
        <p class="text-xs text-white/50">Presenter view</p>
        <p class="font-semibold truncate">{{ event?.name ?? 'Loading…' }}</p>
      </div>
      <span v-if="event && !event.finalized_at" class="pill bg-[#3A220F] text-[#FDBA74]">Rehearsal · results not final</span>
      <span class="num text-2xl font-bold tabular-nums" title="Time since the first click">{{ elapsed }}</span>
      <span class="num text-sm text-white/50">{{ clock }}</span>
      <button class="btn !bg-white/10 !border-white/15 !text-white hover:!bg-white/20" @click="openAudience">Open audience window</button>
      <button class="btn !bg-transparent !border-white/15 !text-white/80 hover:!bg-white/10" @click="exit">Exit</button>
    </header>

    <div v-if="!event || !steps.length" class="flex-1 grid place-items-center text-white/60">Loading results…</div>
    <div v-else class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_380px] gap-5 p-5">
      <section class="min-h-0 flex flex-col gap-4">
        <div class="flex items-center gap-3 text-sm">
          <span class="pill bg-[#1F4FD8] text-white">Now · {{ index + 1 }} / {{ steps.length }}</span>
          <span class="font-semibold">{{ current && stepLabel(current) }}</span>
          <span v-if="blank" class="pill bg-white text-black">Screen blanked</span>
        </div>
        <div class="flex-1 min-h-0 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl">
          <PresentationStage :steps="steps" :index="index" :blank="blank" :rehearsal="!event.finalized_at" :event="event.name" />
        </div>
        <p class="text-xl leading-snug min-h-[3.5rem]"><span class="text-white/50 text-sm block mb-1">Cue</span>{{ current && cue(current) }}</p>
        <div class="grid grid-cols-[1fr_1fr_2fr] gap-3">
          <button class="btn btn-lg !bg-white/10 !border-white/15 !text-white hover:!bg-white/20" :disabled="index === 0" @click="prev">← Back</button>
          <button class="btn btn-lg !border-white/15" :class="blank ? '!bg-white !text-black' : '!bg-white/10 !text-white hover:!bg-white/20'" @click="toggleBlank">{{ blank ? 'Show' : 'Blank' }} (B)</button>
          <button class="btn btn-lg btn-primary !text-lg" :disabled="index >= steps.length - 1 && !blank" @click="next">Next →</button>
        </div>
        <p class="text-xs text-white/40">Keys and presentation clickers: → / Space / Page Down next · ← back · B blank · F full screen (in the audience window) · Home / End</p>
      </section>

      <aside class="min-h-0 flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <span class="text-sm text-white/60">Next · {{ upcoming ? stepLabel(upcoming) : 'End of the presentation' }}</span>
          <div class="aspect-video rounded-xl overflow-hidden ring-1 ring-white/10 bg-black">
            <PresentationStage v-if="upcoming" :steps="steps" :index="index + 1" :event="event.name" instant />
          </div>
        </div>
        <ol ref="list" class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1" aria-label="All steps">
          <li v-for="(s, k) in steps" :key="k">
            <button
              class="w-full text-left px-3 py-2 rounded-lg text-sm flex gap-3 items-center transition-colors"
              :class="k === index ? 'bg-[#1F4FD8] text-white' : k < index ? 'text-white/40 hover:bg-white/5' : 'text-white/80 hover:bg-white/5'"
              :aria-current="k === index ? 'step' : undefined" @click="go(k)"
            >
              <span class="num w-6 text-right text-xs opacity-70">{{ k + 1 }}</span>{{ stepLabel(s) }}
            </button>
          </li>
        </ol>
      </aside>
    </div>
  </div>
</template>
