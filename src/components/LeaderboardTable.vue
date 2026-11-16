<script setup>
import { ref, computed } from 'vue'
import { data, ui, rankings } from '../store'

const props = defineProps({ event: Object })
const rows = computed(() => rankings(props.event))
const time = computed(() => ui.lastSync ? new Date(ui.lastSync).toLocaleTimeString() : 'not yet')
const scroller = ref(null)

const scrollBy = px => {
  if (scroller.value) scroller.value.scrollBy({ left: px, behavior: 'smooth' })
}
</script>

<template>
  <section class="card w-full max-w-full min-w-0 flex flex-col">
    <div class="card-head shrink-0">
      <div class="min-w-0">
        <h3 class="display font-extrabold text-lg sm:text-xl">Live scoring</h3>
        <p class="text-xs sm:text-sm muted mt-0.5">Average of all judges, out of 100. Last sync: {{ time }}</p>
      </div>
      <span class="chip shrink-0">
        <span class="dot on"></span>Live
      </span>
    </div>

    <div v-if="!rows.length" class="px-5 py-10 text-center text-sm sm:text-base muted">
      No entries yet. Add them in the <strong class="font-semibold">Entries</strong> panel.
    </div>

    <template v-else>
      <!-- Quick Side-to-Side Scroll Bar -->
      <div class="px-4 py-2 border-b flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-900/80" style="border-color:var(--line)">
        <span class="text-xs font-bold muted">Swipe or scroll sideways for all judges</span>
        <div class="flex gap-1.5">
          <button type="button" class="icon-btn !w-8 !h-8 border" style="border-color:var(--line)" aria-label="Scroll left" @click="scrollBy(-180)">←</button>
          <button type="button" class="icon-btn !w-8 !h-8 border" style="border-color:var(--line)" aria-label="Scroll right" @click="scrollBy(180)">→</button>
        </div>
      </div>

      <!-- Non-Overlapping Horizontal & Vertical Scroll Container -->
      <div ref="scroller" class="table-scroll max-h-[420px] sm:max-h-[500px]">
        <table class="w-max min-w-full border-collapse">
          <thead>
            <tr>
              <th class="th sticky top-0 z-10 w-20 bg-slate-100 dark:bg-slate-800 text-left whitespace-nowrap">
                Rank
              </th>
              <th class="th sticky top-0 z-10 min-w-[180px] bg-slate-100 dark:bg-slate-800 text-left whitespace-nowrap">
                Entry
              </th>
              <th
                v-for="j in data.judges"
                :key="j.id"
                class="th sticky top-0 z-10 min-w-[120px] bg-slate-100 dark:bg-slate-800 text-right whitespace-nowrap"
              >
                {{ j.name }}
              </th>
              <th class="th sticky top-0 z-10 min-w-[120px] bg-slate-100 dark:bg-slate-800 text-right whitespace-nowrap">
                Average
              </th>
            </tr>
          </thead>

          <tbody class="divide-y" style="border-color:var(--line)">
            <tr
              v-for="r in rows"
              :key="r.id"
              class="hover:bg-blue-500/5 transition-colors"
            >
              <td
                class="td w-20 num font-extrabold text-base whitespace-nowrap"
                :style="r.rank === 1 && r.judged ? 'color:#ec4899;box-shadow:inset 4px 0 0 #ec4899' : ''"
              >
                {{ r.judged ? r.rank : '–' }}
              </td>
              <td class="td min-w-[180px] whitespace-nowrap">
                <span class="num font-bold text-blue-600 dark:text-blue-400 mr-2">#{{ r.number }}</span>
                <span class="font-bold text-sm sm:text-base">{{ r.name }}</span>
              </td>
              <td
                v-for="j in data.judges"
                :key="j.id"
                class="td min-w-[120px] num text-right muted text-sm sm:text-base whitespace-nowrap"
              >
                {{ r.totals[j.id] !== undefined ? r.totals[j.id].toFixed(2) : '–' }}
              </td>
              <td class="td min-w-[120px] num text-right font-extrabold text-base sm:text-lg bg-gradient-to-r from-blue-600 to-pink-600 dark:from-blue-300 dark:to-pink-300 bg-clip-text text-transparent whitespace-nowrap">
                {{ r.judged ? r.avg.toFixed(2) : '–' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>