<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Placed, Step } from '../../presentation'
import { fmt } from '../../scoring'
import { reducedMotion } from '../../motion'
import CountUp from '../CountUp.vue'
import { Confetti } from './confetti'
import logo from '../../assets/brand/icpep-logo.png'

/**
 * The 1920×1080 results stage, scaled to fit its box. Every step has its own animated scene;
 * `instant` renders the end state with no motion (used for the presenter's "next" preview).
 */
const props = withDefaults(defineProps<{
  steps: Step[]
  index: number
  event: string
  blank?: boolean
  rehearsal?: boolean
  instant?: boolean
}>(), { blank: false, rehearsal: false, instant: false })

/* ---- scale to fit ---- */
const box = ref<HTMLElement | null>(null)
const scale = ref(0.25)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect
    scale.value = Math.max(0.05, Math.min(width / 1920, height / 1080))
  })
  if (box.value) ro.observe(box.value)
})

const i = computed(() => Math.min(Math.max(0, props.index), Math.max(0, props.steps.length - 1)))
const step = computed<Step | undefined>(() => props.steps[i.value])

/* ---- timed phases within a step ---- */
const PHASES: Record<Step['kind'], number[]> = {
  'title': [500, 1500],
  'criterion-intro': [700, 1500],
  'criterion-race': [1700, 3900, 4600],
  'criterion-winner': [800, 1600],
  'final-intro': [1000, 2000],
  'final-rest': [300],
  'place': [1100, 1900],
  'drumroll': [2500, 5000],
  'champion': [350, 1300, 2300],
  'table': [300],
  'closing': [700]
}
const phase = ref(0)
let timers: ReturnType<typeof setTimeout>[] = []
function runPhases() {
  timers.forEach(clearTimeout)
  timers = []
  const kind = step.value?.kind
  if (!kind) return
  if (props.instant || reducedMotion()) { phase.value = 9; return }
  phase.value = 0
  PHASES[kind].forEach((ms, n) => timers.push(setTimeout(() => { phase.value = n + 1 }, ms)))
}
watch([i, () => step.value?.kind], runPhases, { immediate: true })

/* ---- confetti ---- */
const canvas = ref<HTMLCanvasElement | null>(null)
let confetti: Confetti | null = null
onMounted(() => { if (canvas.value && !props.instant) confetti = new Confetti(canvas.value) })
onBeforeUnmount(() => { ro?.disconnect(); timers.forEach(clearTimeout); confetti?.destroy() })

const GOLD = ['#F2B653', '#FFE2A3', '#FFFFFF', '#E9A23B']
const SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
const SERIES_HEX = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9b7be0', '#e0609a']
const col = (n: number) => SERIES[n % SERIES.length]
const PLACE_COLORS = { 2: ['#F1F4F9', '#B8C2D3', '#8E9AAF', '#FFFFFF'], 3: ['#E3A26B', '#B87333', '#F5C9A0', '#8C4A1F'] }

watch(i, () => confetti?.stopRain())
watch([phase, i], ([p]) => {
  const s = step.value
  if (!confetti || !s) return
  if (s.kind === 'criterion-winner' && p === 1) {
    confetti.burst({ x: 960, y: 470, count: 180, colors: [...GOLD, SERIES_HEX[s.criterion.color % 6]], spread: 140, speed: 24 })
  } else if (s.kind === 'place' && p === 1) {
    confetti.burst({ x: 960, y: 380, count: 110, colors: PLACE_COLORS[s.place], spread: 110, speed: 20 })
  } else if (s.kind === 'champion' && p === 1) {
    confetti.burst({ x: 0, y: 1080, count: 260, colors: [...GOLD, ...SERIES_HEX], angle: -60, spread: 40, speed: 34 })
    confetti.burst({ x: 1920, y: 1080, count: 260, colors: [...GOLD, ...SERIES_HEX], angle: -120, spread: 40, speed: 34 })
    confetti.rain(7000, [...GOLD, ...SERIES_HEX], 6)
  } else if (s.kind === 'champion' && p === 3) {
    confetti.burst({ x: 960, y: 300, count: 200, colors: GOLD, spread: 360, speed: 20 })
  } else if (s.kind === 'closing' && p === 1) {
    confetti.rain(3500, [...GOLD, ...SERIES_HEX], 2)
  }
})

/* ---- helpers ---- */
function splitChars(text: string) {
  let n = 0
  return text.split(/(\s+)/).filter(Boolean).map(w =>
    /^\s+$/.test(w) ? { space: true, chars: [] as { c: string; n: number }[] } : { space: false, chars: [...w].map(c => ({ c, n: n++ })) })
}
const sizeFor = (text: string, max: number, min: number, room = 22) => Math.max(min, Math.min(max, Math.round((max * room) / Math.max(room, text.length))))
const medalCls = (rank: number) => (rank === 1 ? 'm-gold' : rank === 2 ? 'm-silver' : rank === 3 ? 'm-bronze' : 'm-plain')

/** Floating motes for the background, fixed once. */
const motes = Array.from({ length: 34 }, () => ({
  left: Math.random() * 1920,
  size: 2 + Math.random() * 4,
  dur: 14 + Math.random() * 18,
  delay: -Math.random() * 30,
  o: 0.15 + Math.random() * 0.45,
  dx: (Math.random() - 0.5) * 160
}))

/* ---- per-step derived data ---- */
const race = computed(() => {
  const s = step.value
  if (s?.kind !== 'criterion-race') return null
  const best = Math.max(...s.bars.map(b => b.value))
  const sorted = [...s.bars].sort((a, b) => b.value - a.value || a.number - b.number)
  const rows = phase.value >= 2 ? sorted : s.bars
  const rh = Math.max(54, Math.min(100, Math.floor(700 / Math.max(1, s.bars.length))))
  return {
    s, best, rh,
    rows: rows.map((b, k) => ({
      ...b,
      leader: best - b.value < 1e-9,
      // each bar jostles at its own pace while the race runs
      j1: (0.82 + ((b.number * 37) % 13) / 100).toFixed(2),
      j2: (1.04 + ((b.number * 53) % 11) / 100).toFixed(2),
      jd: `${0.42 + ((b.number * 29) % 7) / 20}s`,
      d: `${k * 90}ms`
    }))
  }
})

const restRows = computed(() => (step.value?.kind === 'final-rest' ? [...step.value.rows].reverse() : []))
const restCols = computed(() => (restRows.value.length > 8 ? 2 : 1))

const podiumCols = computed(() => {
  const s = step.value
  if (s?.kind !== 'champion') return []
  // Centre-out: the best in the middle, then left, right, far left, far right.
  const pos = [2, 1, 3, 0, 4]
  const slots: (Placed & { h: number; d: number })[] = []
  s.podium.slice(0, 5).forEach((p, k) => {
    slots[pos[k]] = { ...p, h: p.rank === 1 ? 300 : p.rank === 2 ? 220 : 160, d: p.rank === 1 ? 500 : p.rank === 2 ? 250 : 0 }
  })
  return slots.filter(Boolean)
})

const tableRh = computed(() => {
  const s = step.value
  return s?.kind === 'table' ? Math.max(40, Math.min(72, Math.floor(720 / Math.max(1, s.rows.length)))) : 60
})

const showBrand = computed(() => !!step.value && !['title', 'closing', 'drumroll'].includes(step.value.kind))
</script>

<template>
  <div ref="box" class="relative w-full h-full overflow-hidden bg-[#02050c]">
    <div class="stage" :class="{ instant }" :style="{ transform: `scale(${scale})` }" aria-live="polite">
      <!-- living background -->
      <div class="bg" aria-hidden="true">
        <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
        <div class="gridlines"></div>
        <span
          v-for="(m, k) in motes" :key="k" class="mote"
          :style="{ left: `${m.left}px`, width: `${m.size}px`, height: `${m.size}px`, '--dur': `${m.dur}s`, '--delay': `${m.delay}s`, '--o': m.o, '--dx': `${m.dx}px` }"
        ></span>
        <div class="vignette"></div>
      </div>

      <Transition name="brand">
        <div v-if="showBrand" class="brand"><img :src="logo" alt="" /><span>{{ event }}</span></div>
      </Transition>

      <Transition name="deck" mode="out-in">
        <section v-if="step" :key="i" class="slide" :class="`k-${step.kind}`">
          <!-- TITLE -->
          <template v-if="step.kind === 'title'">
            <div class="rays rays-soft"></div>
            <div class="center">
              <div class="logo-wrap">
                <div class="logo-ring"></div><div class="logo-ring r2"></div>
                <img :src="logo" alt="ICPEP" class="logo-img" />
              </div>
              <p class="eyebrow gold track-in">Official results</p>
              <h1 class="mega" :style="{ fontSize: `${sizeFor(step.event, 132, 72, 16)}px` }">
                <template v-for="(w, wi) in splitChars(step.event)" :key="wi">
                  <span v-if="w.space">{{ ' ' }}</span>
                  <span v-else class="word"><span v-for="ch in w.chars" :key="ch.n" class="ch" :style="{ '--d': `${300 + ch.n * 38}ms` }">{{ ch.c }}</span></span>
                </template>
              </h1>
              <div class="rule" :class="{ grow: phase >= 1 }"></div>
              <div v-if="phase >= 1" class="stats">
                <div v-for="(st, k) in [{ v: step.entries, l: 'Entries' }, { v: step.criteria, l: 'Criteria' }, { v: step.judges, l: 'Judges' }]" :key="st.l" class="stat" :style="{ '--d': `${k * 160}ms` }">
                  <CountUp class="stat-n" :value="st.v" :duration="1400" :delay="k * 160" />
                  <span class="stat-l">{{ st.l }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- CRITERION INTRO -->
          <template v-else-if="step.kind === 'criterion-intro'">
            <div class="rays rays-color" :style="{ '--col': col(step.criterion.color) }"></div>
            <div class="center">
              <p class="eyebrow drop">Award {{ step.index }} of {{ step.total }}</p>
              <p class="best-in drop" style="--d: 200ms">Best in</p>
              <h1 class="mega wipe shine" :style="{ fontSize: `${sizeFor(step.criterion.name, 170, 90, 12)}px`, '--col': col(step.criterion.color) }">{{ step.criterion.name }}</h1>
              <div class="color-bar" :class="{ grow: phase >= 1 }" :style="{ background: col(step.criterion.color) }"></div>
              <p v-if="phase >= 1" class="chip-lg pop">Counts {{ step.criterion.weight }}% · scored out of {{ step.criterion.max }}</p>
            </div>
          </template>

          <!-- CRITERION RACE -->
          <template v-else-if="step.kind === 'criterion-race' && race">
            <header class="head">
              <p class="eyebrow" :style="{ color: col(step.criterion.color) }">Best in {{ step.criterion.name }}</p>
              <h2 class="h2">{{ phase >= 2 ? 'And the leader is…' : 'Average score of every entry' }}</h2>
            </header>
            <TransitionGroup tag="div" name="race" class="race" :style="{ '--rh': `${race.rh}px`, '--col': col(step.criterion.color) }">
              <div
                v-for="b in race.rows" :key="b.id" class="race-row"
                :class="{ leader: phase >= 3 && b.leader, dim: phase >= 3 && !b.leader }" :style="{ '--d': b.d }"
              >
                <span class="race-num">#{{ b.number }}</span>
                <span class="race-name">{{ b.name }}</span>
                <span class="track">
                  <span
                    class="fill" :class="{ jostle: phase === 0 }"
                    :style="{ width: phase >= 1 ? `${Math.max(2, b.share * 100)}%` : '58%', '--j1': b.j1, '--j2': b.j2, '--jd': b.jd }"
                  ></span>
                </span>
                <span class="race-val" :class="{ on: phase >= 1 }">
                  <CountUp :value="phase >= 1 ? b.value : 0" :decimals="2" :duration="1900" /><small> / {{ step.criterion.max }}</small>
                </span>
              </div>
            </TransitionGroup>
          </template>

          <!-- CRITERION WINNER -->
          <template v-else-if="step.kind === 'criterion-winner'">
            <div class="beam beam-l"></div><div class="beam beam-r"></div>
            <div class="spot" :class="{ on: phase >= 1 }"></div>
            <div class="rays rays-gold" :class="{ on: phase >= 1 }"></div>
            <div class="center">
              <p class="ribbon" :style="{ '--col': col(step.criterion.color) }">Best in {{ step.criterion.name }}</p>
              <div class="winners">
                <div v-for="(w, wi) in step.winners" :key="w.id" class="wcard" :style="{ '--d': `${300 + wi * 220}ms` }">
                  <div class="medallion" :class="{ small: step.winners.length > 2 }">
                    <svg viewBox="0 0 240 240" class="ring"><circle cx="120" cy="120" r="110" /></svg>
                    <span class="wnum">#{{ w.number }}</span>
                  </div>
                  <h2 class="wname" :style="{ fontSize: `${sizeFor(w.name, step.winners.length > 1 ? 64 : 104, 44, 16)}px` }">{{ w.name }}</h2>
                  <p class="wscore"><CountUp :value="phase >= 1 ? w.value : 0" :decimals="2" :duration="1500" /><small> / {{ step.criterion.max }} average</small></p>
                </div>
              </div>
              <p v-if="step.winners.length > 1" class="tie pop">A tie</p>
            </div>
          </template>

          <!-- FINAL INTRO -->
          <template v-else-if="step.kind === 'final-intro'">
            <div class="heart"><span v-for="n in 4" :key="n" class="hb" :style="{ '--d': `${n * 0.55}s` }"></span></div>
            <div class="streak"></div>
            <div class="center">
              <p class="lead-in">And now</p>
              <h1 v-if="phase >= 1" class="mega gold-text zoom-in">The final results</h1>
              <p v-if="phase >= 2" class="sub fade">{{ step.event }}</p>
            </div>
          </template>

          <!-- THE REST -->
          <template v-else-if="step.kind === 'final-rest'">
            <header class="head">
              <p class="eyebrow gold">Final standings</p>
              <h2 class="h2">Ranks {{ restRows[restRows.length - 1]?.rank }} to {{ restRows[0]?.rank }}</h2>
            </header>
            <div class="rest" :style="{ '--cols': restCols, '--rows': Math.ceil(restRows.length / restCols) }">
              <div
                v-for="(r, ri) in restRows" :key="r.id" class="rest-row"
                :style="{ '--d': `${300 + (restRows.length - 1 - ri) * 320}ms` }"
              >
                <span class="rest-rank">{{ r.rank }}</span>
                <span class="rest-name"><small>#{{ r.number }}</small> {{ r.name }}</span>
                <span class="rest-bar"><span :style="{ width: `${r.avg}%` }"></span></span>
                <CountUp class="rest-score" :value="r.avg" :decimals="2" :duration="1100" :delay="300 + (restRows.length - 1 - ri) * 320" />
              </div>
            </div>
          </template>

          <!-- 3RD / 2ND -->
          <template v-else-if="step.kind === 'place'">
            <div class="tint" :class="step.place === 2 ? 'tint-silver' : 'tint-bronze'"></div>
            <div class="rays" :class="step.place === 2 ? 'rays-silver' : 'rays-bronze'"></div>
            <div class="center">
              <div class="medal" :class="step.place === 2 ? 'm-silver' : 'm-bronze'"><span>{{ step.place === 2 ? '2nd' : '3rd' }}</span></div>
              <p class="eyebrow track-in" style="--d: 500ms">{{ step.place === 2 ? 'Second place' : 'Third place' }}</p>
              <div class="pnames">
                <div v-for="(r, ri) in step.rows" :key="r.id" class="pname" :style="{ '--d': `${900 + ri * 200}ms` }">
                  <span class="chip-num">#{{ r.number }}</span>
                  <h2 class="mask-up" :style="{ fontSize: `${sizeFor(r.name, step.rows.length > 1 ? 72 : 110, 48, 16)}px` }">{{ r.name }}</h2>
                  <p class="pscore"><CountUp :value="phase >= 1 ? r.avg : 0" :decimals="2" :duration="1700" /><small> / 100</small></p>
                </div>
              </div>
            </div>
          </template>

          <!-- DRUMROLL -->
          <template v-else-if="step.kind === 'drumroll'">
            <div class="dim-all"></div>
            <div class="search s1"></div><div class="search s2"></div>
            <span v-for="n in 4" :key="n" class="pulse" :style="{ '--d': `${n * 0.4}s` }"></span>
            <div class="center">
              <div class="build" :class="{ hard: phase >= 1, harder: phase >= 2 }">
                <div class="shake">
                  <div class="mystery"><span class="q">?</span></div>
                </div>
              </div>
              <p class="dr-text">And the champion is<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
            </div>
          </template>

          <!-- CHAMPION -->
          <template v-else-if="step.kind === 'champion'">
            <div class="flash"></div>
            <div class="rays rays-gold on fast"></div>
            <div class="champ">
              <svg class="crown" viewBox="0 0 120 80" aria-hidden="true">
                <path d="M8 70 L14 22 L38 46 L60 8 L82 46 L106 22 L112 70 Z" />
                <circle cx="14" cy="20" r="6" /><circle cx="60" cy="7" r="7" /><circle cx="106" cy="20" r="6" />
              </svg>
              <p class="eyebrow gold champ-eyebrow">{{ step.rows.length > 1 ? 'Champions' : 'Champion' }}</p>
              <h1 class="champ-name gold-text" :style="{ fontSize: `${sizeFor(step.rows.map(r => r.name).join(' & '), 150, 64, 14)}px` }">
                {{ step.rows.map(r => r.name).join(' & ') }}
              </h1>
              <p class="champ-meta">
                <span class="chip-num">#{{ step.rows.map(r => r.number).join(' & #') }}</span>
                <span><CountUp :value="phase >= 1 ? step.rows[0].avg : 0" :decimals="2" :duration="2200" /><small> / 100</small></span>
              </p>
            </div>
            <div class="podium" :class="{ up: phase >= 2 }">
              <div v-for="p in podiumCols" :key="p.id" class="pcol" :class="medalCls(p.rank)" :style="{ '--h': `${p.h}px`, '--d': `${p.d}ms` }">
                <div class="pc-label"><b>#{{ p.number }} {{ p.name }}</b><span>{{ fmt(p.avg) }}</span></div>
                <div class="pc-block"><span>{{ p.rank }}</span></div>
              </div>
            </div>
          </template>

          <!-- TABLE -->
          <template v-else-if="step.kind === 'table'">
            <header class="head head-row">
              <div>
                <p class="eyebrow gold">Full results</p>
                <h2 class="h2">{{ event }}</h2>
              </div>
              <ul class="legend">
                <li v-for="c in step.criteria" :key="c.id"><span :style="{ background: col(c.color) }"></span>{{ c.name }} <small>{{ c.weight }}%</small></li>
              </ul>
            </header>
            <div class="tbl" :style="{ '--rh': `${tableRh}px` }">
              <div v-for="(r, ri) in step.rows" :key="r.id" class="trow" :class="{ first: r.rank === 1 }" :style="{ '--d': `${ri * 85}ms`, '--sd': `${ri * 85 + 350}ms` }">
                <span class="rank-badge" :class="medalCls(r.rank)">{{ r.rank }}</span>
                <span class="tname"><small>#{{ r.number }}</small> {{ r.name }}</span>
                <span class="ttrack"><span class="tinner">
                  <span v-for="c in step.criteria" :key="c.id" class="tseg" :style="{ width: `${r.parts[c.id]}%`, background: col(c.color) }"></span>
                </span></span>
                <CountUp class="tscore" :value="r.avg" :decimals="2" :duration="1300" :delay="ri * 85 + 350" />
              </div>
            </div>
          </template>

          <!-- CLOSING -->
          <template v-else-if="step.kind === 'closing'">
            <div class="rays rays-soft"></div>
            <div class="center">
              <img :src="logo" alt="ICPEP" class="logo-img closing-logo" />
              <h1 class="mega gold-text zoom-in">Thank you</h1>
              <p class="sub fade" style="--d: 700ms">Congratulations to every participant of {{ step.event }}</p>
            </div>
          </template>
        </section>
      </Transition>

      <canvas ref="canvas" width="1920" height="1080" class="fx" aria-hidden="true"></canvas>

      <div v-if="rehearsal" class="rehearsal" aria-hidden="true"><span>Rehearsal · results not final</span></div>
      <Transition name="blank"><div v-if="blank" class="blank"></div></Transition>
    </div>
  </div>
</template>

<style scoped>
/* ===== stage ===== */
.stage {
  --gold: #F2B653; --gold2: #FFE2A3; --gold3: #B8862E; --ink: #EEF2FF; --muted: #9AA8C7;
  --c1: #3987e5; --c2: #d95926; --c3: #199e70; --c4: #c98500; --c5: #9b7be0; --c6: #e0609a;
  position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; margin: -540px 0 0 -960px;
  transform-origin: center; overflow: hidden; color: var(--ink);
  font-family: "Inter Variable", system-ui, sans-serif;
  background: radial-gradient(1400px 900px at 50% -10%, #16295c 0%, #0a1430 45%, #050913 100%);
}
.stage :where(h1, h2, .display, .mega, .h2, .eyebrow, .stat-n, .wnum, .tscore, .rest-score, .pscore, .champ-meta, .race-val, .race-num, .medal, .pc-block, .rank-badge, .rest-rank, .q) {
  font-family: "Space Grotesk Variable", "Inter Variable", system-ui, sans-serif; letter-spacing: -0.01em;
}
.stage .num, .stage :where(.stat-n, .tscore, .rest-score, .pscore, .race-val, .wscore, .champ-meta) { font-variant-numeric: tabular-nums; }
.instant :deep(*), .instant * {
  animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
  animation-fill-mode: both !important; transition: none !important;
}

/* ===== background ===== */
.bg { position: absolute; inset: 0; pointer-events: none; }
.blob { position: absolute; border-radius: 50%; filter: blur(130px); mix-blend-mode: screen; }
.b1 { width: 950px; height: 950px; left: -250px; top: -350px; background: #1F4FD8; opacity: 0.5; animation: drift1 22s ease-in-out infinite alternate; }
.b2 { width: 760px; height: 760px; right: -200px; top: 220px; background: #7A3CFF; opacity: 0.32; animation: drift2 27s ease-in-out infinite alternate; }
.b3 { width: 900px; height: 620px; left: 520px; bottom: -380px; background: #F2B653; opacity: 0.16; animation: drift3 31s ease-in-out infinite alternate; }
@keyframes drift1 { to { transform: translate(380px, 200px) scale(1.15); } }
@keyframes drift2 { to { transform: translate(-420px, -160px) scale(0.9); } }
@keyframes drift3 { to { transform: translate(-260px, -120px) scale(1.2); } }
.gridlines {
  position: absolute; inset: -80px;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 80px 80px;
  mask-image: radial-gradient(ellipse at center, #000 25%, transparent 72%);
  animation: gridpan 30s linear infinite;
}
@keyframes gridpan { to { transform: translate(80px, 80px); } }
.mote { position: absolute; bottom: -20px; border-radius: 50%; background: #fff; opacity: 0; animation: rise var(--dur) linear var(--delay) infinite; box-shadow: 0 0 8px #fff; }
@keyframes rise { 0% { transform: translate(0, 0); opacity: 0; } 10%, 85% { opacity: var(--o); } 100% { transform: translate(var(--dx), -1160px); opacity: 0; } }
.vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55) 100%); }

.brand { position: absolute; left: 64px; top: 48px; display: flex; align-items: center; gap: 18px; z-index: 3; color: var(--muted); font-size: 24px; font-weight: 600; }
.brand img { width: 56px; height: 56px; object-fit: contain; }
.brand-enter-active, .brand-leave-active { transition: opacity .6s, transform .6s; }
.brand-enter-from, .brand-leave-to { opacity: 0; transform: translateY(-16px); }

.fx { position: absolute; inset: 0; width: 1920px; height: 1080px; pointer-events: none; z-index: 5; }
.rehearsal { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 6; }
.rehearsal span { transform: rotate(-16deg); font: 800 120px/1 "Space Grotesk Variable", sans-serif; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.06); white-space: nowrap; }
.blank { position: absolute; inset: 0; background: #000; z-index: 9; }
.blank-enter-active, .blank-leave-active { transition: opacity .6s ease; }
.blank-enter-from, .blank-leave-to { opacity: 0; }

/* ===== slide transitions ===== */
.slide { position: absolute; inset: 0; z-index: 2; }
.deck-enter-active { transition: opacity .7s ease, transform 1s cubic-bezier(.16,1,.3,1), filter .7s ease; }
.deck-leave-active { transition: opacity .4s ease, transform .45s ease-in, filter .4s ease; }
.deck-enter-from { opacity: 0; transform: scale(.93); filter: blur(16px); }
.deck-leave-to { opacity: 0; transform: scale(1.07); filter: blur(12px); }

/* ===== shared pieces ===== */
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 120px; gap: 26px; }
.eyebrow { font-size: 30px; font-weight: 700; letter-spacing: .32em; text-transform: uppercase; color: var(--muted); }
.gold { color: var(--gold); }
.mega { font-weight: 800; line-height: 1.02; margin: 0; text-wrap: balance; max-width: 1650px; }
.h2 { font-size: 64px; font-weight: 800; margin: 8px 0 0; line-height: 1.05; }
.sub { font-size: 34px; color: var(--muted); margin: 0; }
.head { position: absolute; left: 120px; right: 120px; top: 132px; }
.head-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 40px; }
.word { display: inline-block; white-space: nowrap; }
.ch { display: inline-block; opacity: 0; transform: translateY(.55em) rotate(7deg); filter: blur(10px); animation: chIn .9s cubic-bezier(.16,1,.3,1) forwards; animation-delay: var(--d); }
@keyframes chIn { to { opacity: 1; transform: none; filter: none; } }
.track-in { animation: trackIn 1.1s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d, 0ms); }
@keyframes trackIn { from { opacity: 0; letter-spacing: 1em; filter: blur(6px); } to { opacity: 1; filter: none; } }
.drop { animation: drop .8s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d, 0ms); }
@keyframes drop { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: none; } }
.pop { animation: pop .7s cubic-bezier(.34,1.56,.64,1) both; animation-delay: var(--d, 0ms); }
@keyframes pop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }
.fade { animation: fadeIn 1s ease both; animation-delay: var(--d, 0ms); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.zoom-in { animation: zoomIn 1.2s cubic-bezier(.16,1,.3,1) both; }
@keyframes zoomIn { from { opacity: 0; transform: scale(1.6); filter: blur(18px); letter-spacing: .1em; } to { opacity: 1; transform: none; filter: none; } }
.gold-text {
  background: linear-gradient(100deg, var(--gold3) 0%, var(--gold) 30%, #fff6dd 48%, var(--gold) 66%, var(--gold3) 100%);
  background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: zoomIn 1.2s cubic-bezier(.16,1,.3,1) both, sheen 3.2s linear 1.2s infinite;
  filter: drop-shadow(0 6px 30px rgba(242,182,83,.35));
}
@keyframes sheen { from { background-position: 100% 0; } to { background-position: -150% 0; } }
.chip-lg { font-size: 30px; font-weight: 600; padding: 14px 30px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); margin: 0; }
.chip-num { display: inline-block; font-size: 32px; font-weight: 700; padding: 8px 22px; border-radius: 999px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); }

/* rotating light rays */
.rays {
  position: absolute; left: 50%; top: 50%; width: 2600px; height: 2600px; margin: -1300px 0 0 -1300px;
  background: repeating-conic-gradient(from 0deg, rgba(255,255,255,.07) 0deg 6deg, transparent 6deg 18deg);
  mask-image: radial-gradient(circle, #000 0%, transparent 55%);
  animation: spin 60s linear infinite; opacity: .9;
}
.rays-soft { opacity: .5; }
.rays-color { background: repeating-conic-gradient(from 0deg, color-mix(in oklab, var(--col) 30%, transparent) 0deg 5deg, transparent 5deg 15deg); animation-duration: 40s; }
.rays-gold { background: repeating-conic-gradient(from 0deg, rgba(242,182,83,.22) 0deg 5deg, transparent 5deg 14deg); opacity: 0; transition: opacity 1.2s ease; animation-duration: 45s; }
.rays-gold.on { opacity: 1; }
.rays-gold.fast { animation: spin 18s linear infinite; }
.rays-silver { background: repeating-conic-gradient(from 0deg, rgba(220,228,240,.14) 0deg 5deg, transparent 5deg 14deg); }
.rays-bronze { background: repeating-conic-gradient(from 0deg, rgba(227,162,107,.16) 0deg 5deg, transparent 5deg 14deg); }
@keyframes spin { to { transform: rotate(360deg); } }

/* ===== title ===== */
.logo-wrap { position: relative; width: 230px; height: 230px; display: grid; place-items: center; margin-bottom: 10px; }
.logo-img { position: relative; width: 200px; height: 200px; object-fit: contain; animation: pop 1s cubic-bezier(.34,1.56,.64,1) both, float 6s ease-in-out 1s infinite; filter: drop-shadow(0 10px 40px rgba(76,123,255,.45)); }
@keyframes float { 50% { transform: translateY(-10px); } }
.logo-ring { position: absolute; inset: -14px; border-radius: 50%; border: 2px solid rgba(242,182,83,.55); animation: ringPulse 2.8s ease-out infinite; }
.logo-ring.r2 { animation-delay: 1.4s; }
@keyframes ringPulse { from { transform: scale(.85); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
.rule { width: 0; height: 4px; border-radius: 4px; background: linear-gradient(90deg, transparent, var(--gold), transparent); transition: width 1.2s cubic-bezier(.16,1,.3,1); }
.rule.grow { width: 720px; }
.stats { display: flex; gap: 90px; margin-top: 18px; }
.stat { display: flex; flex-direction: column; align-items: center; gap: 4px; animation: fadeIn .9s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d); }
.stat-n { font-size: 84px; font-weight: 800; line-height: 1; }
.stat-l { font-size: 24px; letter-spacing: .2em; text-transform: uppercase; color: var(--muted); }

/* ===== criterion intro ===== */
.best-in { font-size: 44px; color: var(--muted); margin: 0; font-weight: 500; }
.wipe { clip-path: inset(0 100% 0 0); animation: wipe 1.1s cubic-bezier(.77,0,.18,1) .35s forwards; }
@keyframes wipe { to { clip-path: inset(0 -5% 0 0); } }
.shine {
  background: linear-gradient(100deg, #fff 0%, #fff 40%, color-mix(in oklab, var(--col) 50%, #fff) 50%, #fff 60%, #fff 100%);
  background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: wipe 1.1s cubic-bezier(.77,0,.18,1) .35s forwards, sheen 2.6s ease-in-out 1.4s infinite;
}
.color-bar { width: 0; height: 10px; border-radius: 10px; transition: width 1s cubic-bezier(.16,1,.3,1); box-shadow: 0 0 30px currentColor; }
.color-bar.grow { width: 260px; }

/* ===== race ===== */
.race { position: absolute; left: 120px; right: 120px; top: 300px; display: flex; flex-direction: column; }
.race-row {
  display: grid; grid-template-columns: 110px 420px 1fr 210px; align-items: center; gap: 28px; height: var(--rh);
  opacity: 0; animation: rowIn .8s cubic-bezier(.16,1,.3,1) forwards; animation-delay: var(--d);
  transition: opacity .8s ease, filter .8s ease;
}
@keyframes rowIn { from { opacity: 0; transform: translateX(-80px); } to { opacity: 1; transform: none; } }
.race-move { transition: transform 1.1s cubic-bezier(.2,.8,.2,1); }
.race-num { font-size: calc(var(--rh) * .42); font-weight: 800; color: var(--muted); }
.race-name { font-size: calc(var(--rh) * .38); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { position: relative; height: calc(var(--rh) * .5); border-radius: 14px; background: rgba(255,255,255,.06); overflow: hidden; }
.fill {
  position: absolute; inset: 0 auto 0 0; border-radius: 14px; transform-origin: left center;
  background: linear-gradient(90deg, color-mix(in oklab, var(--col) 55%, #000), var(--col));
  transition: width 1.9s cubic-bezier(.16,1,.3,1), background .8s, box-shadow .8s;
}
.fill::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(115deg, rgba(255,255,255,.2) 0 14px, transparent 14px 34px); animation: stripes .7s linear infinite; transition: opacity .8s; }
.fill:not(.jostle)::after { opacity: .25; }
@keyframes stripes { to { background-position: 48px 0; } }
.fill.jostle { animation: jostle var(--jd) ease-in-out infinite alternate; }
@keyframes jostle { from { transform: scaleX(var(--j1)); } to { transform: scaleX(var(--j2)); } }
.race-val { font-size: calc(var(--rh) * .44); font-weight: 800; text-align: right; opacity: 0; transition: opacity .6s; }
.race-val.on { opacity: 1; }
.race-val small, .wscore small, .pscore small, .champ-meta small { font-size: .5em; color: var(--muted); font-weight: 600; }
.leader .fill { background: linear-gradient(90deg, var(--gold3), var(--gold), var(--gold2)); box-shadow: 0 0 50px rgba(242,182,83,.55); }
.leader .race-name, .leader .race-num, .leader .race-val { color: var(--gold2); }
.leader { animation: rowIn .8s cubic-bezier(.16,1,.3,1) forwards, leaderPulse 1.6s ease-in-out .3s infinite; }
@keyframes leaderPulse { 50% { filter: brightness(1.25); } }
.dim { opacity: .38 !important; filter: saturate(.4); }

/* ===== criterion winner ===== */
.beam {
  position: absolute; top: -260px; width: 560px; height: 1600px; transform-origin: top center; mix-blend-mode: screen;
  background: linear-gradient(to bottom, rgba(255,236,190,.55), rgba(255,236,190,0) 78%);
  clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%); filter: blur(16px); opacity: 0;
}
.beam-l { left: 220px; animation: sweepL 1.6s cubic-bezier(.2,.8,.2,1) forwards; }
.beam-r { right: 220px; animation: sweepR 1.6s cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes sweepL { from { transform: rotate(18deg); opacity: 0; } 30% { opacity: 1; } to { transform: rotate(-24deg); opacity: .9; } }
@keyframes sweepR { from { transform: rotate(-18deg); opacity: 0; } 30% { opacity: 1; } to { transform: rotate(24deg); opacity: .9; } }
.spot { position: absolute; inset: 0; background: radial-gradient(620px 520px at 50% 52%, rgba(255,230,170,.22), transparent 70%); opacity: 0; transition: opacity 1s; }
.spot.on { opacity: 1; }
.ribbon {
  position: relative; margin: 0; padding: 14px 44px; font-size: 34px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
  color: #1b1405; background: linear-gradient(90deg, var(--gold3), var(--gold), var(--gold2), var(--gold));
  clip-path: polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%);
  animation: ribbonIn 1s cubic-bezier(.16,1,.3,1) both;
}
@keyframes ribbonIn { from { opacity: 0; transform: scaleX(.2); } to { opacity: 1; transform: none; } }
.winners { display: flex; gap: 80px; justify-content: center; align-items: flex-start; }
.wcard { display: flex; flex-direction: column; align-items: center; gap: 18px; max-width: 760px; animation: winIn 1.2s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d); }
@keyframes winIn { from { opacity: 0; transform: scale(.4) translateY(60px); filter: blur(20px); } to { opacity: 1; transform: none; filter: none; } }
.medallion { position: relative; width: 240px; height: 240px; display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle at 35% 30%, rgba(255,226,163,.25), rgba(242,182,83,.06) 60%); }
.medallion.small { width: 180px; height: 180px; }
.ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: var(--gold); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 691; stroke-dashoffset: 691; animation: draw 1.4s cubic-bezier(.65,0,.35,1) .5s forwards; filter: drop-shadow(0 0 10px rgba(242,182,83,.8)); }
@keyframes draw { to { stroke-dashoffset: 0; } }
.wnum { font-size: 92px; font-weight: 800; color: var(--gold2); }
.medallion.small .wnum { font-size: 66px; }
.wname { margin: 0; font-weight: 800; line-height: 1.05; text-wrap: balance; }
.wscore { margin: 0; font-size: 46px; font-weight: 700; }
.tie { margin: 0; font-size: 30px; letter-spacing: .3em; text-transform: uppercase; color: var(--gold); }

/* ===== final intro ===== */
.lead-in { margin: 0; font-size: 56px; color: var(--muted); font-weight: 500; animation: fadeIn 1s ease both; }
.heart { position: absolute; left: 50%; top: 50%; }
.hb { position: absolute; left: -300px; top: -300px; width: 600px; height: 600px; border-radius: 50%; border: 3px solid rgba(242,182,83,.45); animation: heartbeat 2.2s ease-out infinite; animation-delay: var(--d); opacity: 0; }
@keyframes heartbeat { 0% { transform: scale(.3); opacity: .9; } 100% { transform: scale(2.4); opacity: 0; } }
.streak { position: absolute; top: 50%; left: -40%; width: 40%; height: 3px; background: linear-gradient(90deg, transparent, #fff, transparent); filter: blur(1px); animation: streak 2.6s cubic-bezier(.7,0,.3,1) .9s infinite; box-shadow: 0 0 30px #fff; }
@keyframes streak { to { left: 110%; } }

/* ===== the rest ===== */
.rest { position: absolute; left: 120px; right: 120px; top: 310px; bottom: 90px; display: grid; grid-template-columns: repeat(var(--cols), 1fr); grid-template-rows: repeat(var(--rows), minmax(0, 92px)); grid-auto-flow: column; gap: 14px 60px; align-content: start; }
.rest-row {
  display: grid; grid-template-columns: 90px 1fr 220px 140px; align-items: center; gap: 22px; padding: 0 28px; border-radius: 18px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
  opacity: 0; animation: restIn .9s cubic-bezier(.16,1,.3,1) forwards; animation-delay: var(--d);
}
@keyframes restIn { from { opacity: 0; transform: translateX(160px) rotateY(-30deg); filter: blur(8px); } to { opacity: 1; transform: none; filter: none; } }
.rest-rank { font-size: 48px; font-weight: 800; color: var(--muted); animation: flip .9s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d); }
@keyframes flip { from { transform: rotateX(90deg); } to { transform: none; } }
.rest-name { font-size: 36px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rest-name small, .tname small { color: var(--muted); font-weight: 600; margin-right: 8px; }
.rest-bar { height: 12px; border-radius: 12px; background: rgba(255,255,255,.08); overflow: hidden; }
.rest-bar span { display: block; height: 100%; border-radius: 12px; background: linear-gradient(90deg, #4C7BFF, #8fb0ff); transform-origin: left; animation: grow 1.1s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d); }
@keyframes grow { from { transform: scaleX(0); } to { transform: none; } }
.rest-score { font-size: 40px; font-weight: 800; text-align: right; }

/* ===== 3rd / 2nd ===== */
.tint { position: absolute; inset: 0; animation: fadeIn 1.2s ease both; }
.tint-silver { background: radial-gradient(900px 600px at 50% 40%, rgba(200,212,232,.16), transparent 70%); }
.tint-bronze { background: radial-gradient(900px 600px at 50% 40%, rgba(205,127,50,.18), transparent 70%); }
.medal {
  position: relative; width: 280px; height: 280px; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
  font-size: 88px; font-weight: 800; color: rgba(20,14,6,.85);
  box-shadow: 0 30px 80px rgba(0,0,0,.5), inset 0 -10px 30px rgba(0,0,0,.25), inset 0 10px 30px rgba(255,255,255,.35);
  animation: medalIn 1.6s cubic-bezier(.16,1,.3,1) both;
}
.medal::after { content: ''; position: absolute; inset: -40%; background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.75) 50%, transparent 60%); animation: shine 3s ease-in-out 1.6s infinite; }
@keyframes medalIn { from { opacity: 0; transform: perspective(900px) rotateY(-720deg) scale(.2); } to { opacity: 1; transform: perspective(900px) rotateY(0) scale(1); } }
@keyframes shine { from { transform: translateX(-60%); } 60%, to { transform: translateX(60%); } }
.medal.m-silver { background: conic-gradient(from 200deg, #8E9AAF, #F1F4F9, #B8C2D3, #FFFFFF, #8E9AAF); }
.medal.m-bronze { background: conic-gradient(from 200deg, #8C4A1F, #E3A26B, #B87333, #F5C9A0, #8C4A1F); }
.pnames { display: flex; gap: 80px; justify-content: center; }
.pname { display: flex; flex-direction: column; align-items: center; gap: 14px; animation: fadeIn .9s cubic-bezier(.16,1,.3,1) both; animation-delay: var(--d); }
.mask-up { margin: 0; font-weight: 800; line-height: 1.05; text-wrap: balance; clip-path: inset(100% 0 0 0); animation: maskUp 1s cubic-bezier(.77,0,.18,1) both; animation-delay: var(--d); }
@keyframes maskUp { to { clip-path: inset(-10% 0 -10% 0); } }
.pscore { margin: 0; font-size: 56px; font-weight: 800; }

/* ===== drumroll ===== */
.dim-all { position: absolute; inset: 0; background: rgba(0,0,0,.45); animation: fadeIn 1.2s ease both; }
.search { position: absolute; top: -300px; left: 50%; width: 420px; height: 1600px; margin-left: -210px; transform-origin: top center; mix-blend-mode: screen; background: linear-gradient(to bottom, rgba(255,240,200,.35), transparent 75%); clip-path: polygon(45% 0, 55% 0, 100% 100%, 0 100%); filter: blur(14px); }
.s1 { animation: search 2.4s ease-in-out infinite alternate; }
.s2 { animation: search 3.1s ease-in-out -1.2s infinite alternate-reverse; }
@keyframes search { from { transform: rotate(-28deg); } to { transform: rotate(28deg); } }
.pulse { position: absolute; left: 50%; top: 46%; width: 420px; height: 420px; margin: -210px; border-radius: 40px; border: 2px solid rgba(242,182,83,.5); animation: pulseOut 1.6s ease-out infinite; animation-delay: var(--d); opacity: 0; }
@keyframes pulseOut { from { transform: scale(.9); opacity: .8; } to { transform: scale(2.2); opacity: 0; } }
.build { animation: grow2 7s ease-in forwards; }
@keyframes grow2 { from { transform: scale(.9); } to { transform: scale(1.18); } }
.shake { animation: shake .12s linear infinite; animation-play-state: paused; }
.hard .shake { animation-play-state: running; }
.harder .shake { animation-name: shakeHard; animation-duration: .08s; }
@keyframes shake { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-3px, 2px) rotate(-.6deg); } 75% { transform: translate(3px, -2px) rotate(.6deg); } }
@keyframes shakeHard { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-7px, 4px) rotate(-1.4deg); } 75% { transform: translate(7px, -4px) rotate(1.4deg); } }
.mystery {
  position: relative; width: 400px; height: 400px; border-radius: 44px; display: grid; place-items: center;
  background: rgba(10,16,34,.85); overflow: hidden; box-shadow: 0 0 80px rgba(242,182,83,.25);
}
.mystery::before { content: ''; position: absolute; inset: -50%; background: conic-gradient(from 0deg, transparent 0deg, var(--gold) 60deg, transparent 120deg, transparent 180deg, var(--gold2) 240deg, transparent 300deg); animation: spin 2.2s linear infinite; }
.mystery::after { content: ''; position: absolute; inset: 5px; border-radius: 40px; background: radial-gradient(circle at 50% 40%, #1b2a55, #070c1c 70%); }
.q { position: relative; z-index: 1; font-size: 260px; font-weight: 800; color: var(--gold); text-shadow: 0 0 60px rgba(242,182,83,.7); animation: qPulse .5s ease-in-out infinite alternate; }
@keyframes qPulse { to { transform: scale(1.08); text-shadow: 0 0 100px rgba(242,182,83,1); } }
.dr-text { margin: 30px 0 0; font-size: 52px; font-weight: 600; }
.dots i { font-style: normal; animation: dot 1.2s infinite; opacity: 0; }
.dots i:nth-child(2) { animation-delay: .2s; }
.dots i:nth-child(3) { animation-delay: .4s; }
@keyframes dot { 0%, 20% { opacity: 0; } 40%, 100% { opacity: 1; } }

/* ===== champion ===== */
.flash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 40%, #fff, #ffe9b8 40%, transparent 75%); z-index: 4; pointer-events: none; animation: flash 1.1s ease-out forwards; }
@keyframes flash { from { opacity: 1; } to { opacity: 0; } }
.champ { position: absolute; left: 0; right: 0; top: 70px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 0 120px; }
.crown { width: 170px; height: 113px; fill: var(--gold); filter: drop-shadow(0 0 30px rgba(242,182,83,.8)); animation: crownDrop 1.2s cubic-bezier(.34,1.56,.64,1) .3s both, float 4s ease-in-out 1.6s infinite; }
@keyframes crownDrop { from { opacity: 0; transform: translateY(-260px) rotate(-25deg); } to { opacity: 1; transform: none; } }
.champ-eyebrow { font-size: 40px; animation: trackIn 1.2s cubic-bezier(.16,1,.3,1) .4s both; }
.champ-name { margin: 0; font-weight: 800; line-height: 1.02; text-wrap: balance; max-width: 1680px; }
.champ-meta { margin: 6px 0 0; display: flex; align-items: center; gap: 26px; font-size: 64px; font-weight: 800; animation: fadeIn 1s ease 1s both; }
.podium { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; align-items: flex-end; gap: 22px; }
.pcol { width: 330px; display: flex; flex-direction: column; align-items: stretch; gap: 14px; }
.pc-label { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 26px; text-align: center; opacity: 0; transition: opacity .8s ease; transition-delay: calc(var(--d) + .7s); }
.pc-label b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 330px; }
.pc-label span { color: var(--muted); font-variant-numeric: tabular-nums; }
.pc-block {
  height: var(--h); border-radius: 18px 18px 0 0; display: grid; place-items: start center; padding-top: 18px;
  font-size: 90px; font-weight: 800; transform: translateY(100%); transition: transform 1.1s cubic-bezier(.16,1,.3,1); transition-delay: var(--d);
  box-shadow: inset 0 10px 30px rgba(255,255,255,.25);
}
.m-gold .pc-block { background: linear-gradient(180deg, #FFE2A3, #F2B653 40%, #B8862E); color: #2a1d05; }
.m-silver .pc-block { background: linear-gradient(180deg, #FFFFFF, #C9D2E0 40%, #8E9AAF); color: #1d2533; }
.m-bronze .pc-block { background: linear-gradient(180deg, #F5C9A0, #CD7F32 40%, #8C4A1F); color: #2a1406; }
.m-plain .pc-block { background: rgba(255,255,255,.12); }
.podium.up .pc-block { transform: none; }
.podium.up .pc-label { opacity: 1; }

/* ===== table ===== */
.legend { display: flex; flex-wrap: wrap; gap: 14px 30px; list-style: none; margin: 0; padding: 0; font-size: 24px; justify-content: flex-end; max-width: 900px; }
.legend li { display: flex; align-items: center; gap: 10px; }
.legend span { width: 22px; height: 22px; border-radius: 6px; }
.legend small { color: var(--muted); }
.tbl { position: absolute; left: 120px; right: 120px; top: 300px; display: flex; flex-direction: column; gap: 8px; }
.trow {
  display: grid; grid-template-columns: 70px 460px 1fr 150px; align-items: center; gap: 26px; height: var(--rh); padding: 0 20px; border-radius: 14px;
  background: rgba(255,255,255,.04); opacity: 0; animation: fadeIn .7s cubic-bezier(.16,1,.3,1) forwards; animation-delay: var(--d);
}
.trow.first { background: linear-gradient(90deg, rgba(242,182,83,.18), rgba(242,182,83,.03)); box-shadow: inset 0 0 0 1px rgba(242,182,83,.35); }
.rank-badge { width: calc(var(--rh) * .72); height: calc(var(--rh) * .72); border-radius: 50%; display: grid; place-items: center; font-size: calc(var(--rh) * .36); font-weight: 800; overflow: visible; box-shadow: none; animation: none; }
.rank-badge.m-gold { background: conic-gradient(from 200deg, #B8862E, #FFE2A3, #F2B653, #FFF3D1, #B8862E); }
.rank-badge.m-silver { background: conic-gradient(from 200deg, #8E9AAF, #F1F4F9, #B8C2D3, #FFFFFF, #8E9AAF); color: #1d2533; }
.rank-badge.m-bronze { background: conic-gradient(from 200deg, #8C4A1F, #E3A26B, #B87333, #F5C9A0, #8C4A1F); color: #2a1406; }
.rank-badge.m-plain { background: rgba(255,255,255,.08); color: var(--muted); }
.tname { font-size: calc(var(--rh) * .42); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ttrack { height: calc(var(--rh) * .42); border-radius: 10px; background: rgba(255,255,255,.06); overflow: hidden; }
.tinner { display: flex; height: 100%; clip-path: inset(0 100% 0 0); animation: reveal 1.3s cubic-bezier(.16,1,.3,1) forwards; animation-delay: var(--sd); }
@keyframes reveal { to { clip-path: inset(0 0 0 0); } }
.tseg { height: 100%; border-right: 2px solid #0b1430; }
.tseg:last-child { border-right: 0; }
.tscore { font-size: calc(var(--rh) * .46); font-weight: 800; text-align: right; }
.trow.first .tscore, .trow.first .tname { color: var(--gold2); }

/* ===== closing ===== */
.closing-logo { width: 180px; height: 180px; }

@media (prefers-reduced-motion: reduce) {
  .stage *, .stage *::before, .stage *::after { animation-iteration-count: 1 !important; }
}
</style>
