<script setup>
import { ref, computed } from 'vue'
import * as store from '../store'

const { data, ui, currentEvent } = store
const event = computed(() => currentEvent())
const scroller = ref(null)
const draft = ref({})

const scrollBy = px => {
  if (scroller.value) scroller.value.scrollBy({ left: px, behavior: 'smooth' })
}

const criteriaList = computed(() =>
  event.value?.criteria || event.value?.rubrics || []
)

const candidateList = computed(() =>
  event.value?.candidates || event.value?.entries || event.value?.contestants || []
)

const judgeId = computed(() => ui.session?.id || ui.session?.judgeId || 'judge-1')
const key = (cId, kId) => `${event.value?.id}:${cId}:${kId}`

const getScore = (cId, kId) => {
  const k = key(cId, kId)
  if (draft.value[k] !== undefined) return draft.value[k]
  const saved = data.scores?.[event.value?.id]?.[cId]?.[judgeId.value]?.[kId]
  return saved !== undefined ? saved : ''
}

const setScore = (cId, kId, val) => {
  const k = key(cId, kId)
  if (val === '') {
    delete draft.value[k]
    return
  }
  const n = Math.max(0, Math.min(100, Number(val)))
  draft.value[k] = Number.isNaN(n) ? '' : n
}

const rowReady = cId => {
  if (!criteriaList.value.length) return false
  return criteriaList.value.every(k => {
    const v = getScore(cId, k.id)
    return v !== '' && v !== undefined && !Number.isNaN(Number(v))
  })
}

const rowTotal = cId => {
  if (!rowReady(cId)) return null
  return criteriaList.value.reduce(
    (sum, k) => sum + Number(getScore(cId, k.id)) * (Number(k.weight) / 100),
    0
  )
}

const readyCount = computed(() =>
  candidateList.value.filter(c => rowReady(c.id)).length
)

const submitAll = async () => {
  const ev = event.value
  if (!ev || !readyCount.value) return

  const payload = {}
  data.scores ||= {}
  data.scores[ev.id] ||= {}

  for (const c of candidateList.value) {
    if (!rowReady(c.id)) continue
    payload[c.id] = {}
    data.scores[ev.id][c.id] ||= {}
    data.scores[ev.id][c.id][judgeId.value] = {}
    for (const k of criteriaList.value) {
      const val = Number(getScore(c.id, k.id))
      payload[c.id][k.id] = val
      data.scores[ev.id][c.id][judgeId.value][k.id] = val
    }
  }

  localStorage.setItem('tab_data', JSON.stringify(data))

  // Call whichever submit/sync function exists in store.js
  if (typeof store.submitScores === 'function') {
    store.submitScores(ev.id, payload)
  } else if (typeof store.saveScores === 'function') {
    store.saveScores(ev.id, payload)
  } else {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: data.scores })
      })
    } catch {
      // Stays saved in localStorage if offline
    }
  }
}
</script>

<template>
  <div v-if="event" class="w-full max-w-full min-w-0 space-y-5 sm:space-y-7">
    <!-- Event Header Card -->
    <div class="card p-5 sm:p-6 bg-gradient-to-r from-blue-600/10 via-indigo-500/5 to-pink-600/10">
      <h2 class="display font-extrabold text-2xl sm:text-3xl bg-gradient-to-r from-blue-600 to-pink-600 dark:from-blue-300 dark:to-pink-300 bg-clip-text text-transparent">
        {{ event.name }}
      </h2>
      <p class="text-sm sm:text-base muted mt-1">
        Score each criteria from 0 to 100. The weight shows how much it counts.
      </p>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span class="chip">
          <span class="dot" :class="ui.online ? 'on' : 'off'"></span>
          {{ ui.online ? 'Connected' : 'Offline' }}
          <template v-if="ui.pending?.length"> · {{ ui.pending.length }} waiting</template>
        </span>
        <span v-if="event.locked" class="chip text-pink-600 dark:text-pink-300">
          Scoring closed by admin
        </span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="!criteriaList.length || !candidateList.length" class="card p-8 text-center muted">
      Waiting for the administrator to add criteria and entries for this event.
    </div>

    <!-- Side-to-Side Scrollable Scoreboard Panel -->
    <section v-else class="card w-full max-w-full min-w-0">
      <div class="px-4 py-2.5 border-b flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-900/80 rounded-t-2xl" style="border-color:var(--line)">
        <span class="text-xs font-bold muted">Swipe or scroll sideways to see all criteria</span>
        <div class="flex gap-1.5">
          <button type="button" class="icon-btn !w-8 !h-8 border" style="border-color:var(--line)" aria-label="Scroll left" @click="scrollBy(-180)">←</button>
          <button type="button" class="icon-btn !w-8 !h-8 border" style="border-color:var(--line)" aria-label="Scroll right" @click="scrollBy(180)">→</button>
        </div>
      </div>

      <div ref="scroller" class="table-scroll max-h-[60vh]">
        <table class="w-max min-w-full border-collapse">
          <thead>
            <tr>
              <th class="th sticky top-0 z-10 min-w-[165px] bg-slate-100 dark:bg-slate-800 text-left whitespace-nowrap">
                Entry
              </th>
              <th
                v-for="k in criteriaList"
                :key="k.id"
                class="th sticky top-0 z-10 min-w-[145px] bg-slate-100 dark:bg-slate-800 text-center whitespace-nowrap"
              >
                {{ k.name }}
                <span class="block num font-bold text-pink-600 dark:text-pink-400 mt-0.5">{{ k.weight }}%</span>
              </th>
              <th class="th sticky top-0 z-10 min-w-[100px] bg-slate-100 dark:bg-slate-800 text-right whitespace-nowrap">
                Total
              </th>
              <th class="th sticky top-0 z-10 min-w-[115px] bg-slate-100 dark:bg-slate-800 text-left whitespace-nowrap">
                Status
              </th>
            </tr>
          </thead>

          <tbody class="divide-y" style="border-color:var(--line)">
            <tr
              v-for="c in [...candidateList].sort((a, b) => a.number - b.number)"
              :key="c.id"
              class="hover:bg-blue-500/5 transition-colors"
            >
              <td class="td min-w-[165px] font-bold text-sm sm:text-base whitespace-nowrap">
                <span class="num text-blue-600 dark:text-pink-400 mr-2">#{{ c.number }}</span>{{ c.name }}
              </td>

              <td v-for="k in criteriaList" :key="k.id" class="td text-center">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  inputmode="decimal"
                  :disabled="event.locked"
                  :value="getScore(c.id, k.id)"
                  placeholder="0–100"
                  class="field num w-24 sm:w-28 text-center font-bold"
                  @input="setScore(c.id, k.id, $event.target.value)"
                />
              </td>

              <td class="td num text-right font-extrabold text-base sm:text-lg whitespace-nowrap">
                {{ rowTotal(c.id) !== null ? rowTotal(c.id).toFixed(2) : '–' }}
              </td>

              <td class="td text-xs sm:text-sm font-semibold whitespace-nowrap">
                <span v-if="rowReady(c.id)" class="text-emerald-600 dark:text-emerald-400">Ready</span>
                <span v-else class="muted">Incomplete</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Bottom Submit Bar -->
    <div v-if="criteriaList.length && candidateList.length" class="card p-4 sm:p-5 flex flex-wrap items-center justify-end gap-4">
      <span class="text-sm sm:text-base font-semibold muted">{{ readyCount }} entries ready</span>
      <button class="btn btn-primary" :disabled="event.locked || !readyCount" @click="submitAll">
        Submit scores
      </button>
    </div>
  </div>

  <div v-else class="card p-8 text-center muted">
    Select an event from the menu to begin scoring.
  </div>
</template>