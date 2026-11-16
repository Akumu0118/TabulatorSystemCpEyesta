<script setup>
import { computed } from 'vue'
import { data, rankings } from '../store'
import Icon from './Icon.vue'

const props = defineProps({ event: Object })
defineEmits(['close'])

const print = () => window.print()
const rows = computed(() => rankings(props.event))
const date = new Date().toLocaleDateString(undefined, { dateStyle: 'long' })
</script>

<template>
  <Teleport to="body">
    <div class="scrim print-portal" @click.self="$emit('close')">
      <div
        class="print-card-shell card w-full max-w-5xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-blue-200 dark:border-pink-500/30 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Tally sheet preview"
      >
        <!-- Modal Header (Hidden When Printing) -->
        <div class="no-print card-head shrink-0">
          <div>
            <h3 class="display font-extrabold text-xl bg-gradient-to-r from-blue-600 to-pink-600 dark:from-blue-300 dark:to-pink-300 bg-clip-text text-transparent">
              Tally sheet preview
            </h3>
            <p class="text-sm muted mt-0.5">In the print window, choose "Save as PDF" as the destination.</p>
          </div>
          <div class="flex gap-3">
            <button class="btn btn-primary" @click="print"><Icon name="print" />Print / Save PDF</button>
            <button class="btn" @click="$emit('close')">Close</button>
          </div>
        </div>

        <!-- Scrollable Preview Wrapper -->
        <div class="print-scroll-wrap flex-1 overflow-auto p-5 sm:p-8 bg-slate-100/80 dark:bg-slate-950/80">
          <!-- Actual Printable Sheet -->
          <div id="printable-sheet" class="mx-auto p-10 min-w-[680px] shadow-xl rounded-lg" style="background:#fff;color:#111">
            <div class="text-center pb-4 mb-5" style="border-bottom:2px solid #111">
              <h1 class="display font-extrabold text-2xl">ICPEP Tabulator</h1>
              <p class="font-bold text-base mt-0.5">{{ event.name }}: Official Score Summary</p>
              <p class="text-xs mt-1" style="color:#555">{{ date }}</p>
            </div>

            <table class="w-full text-sm" style="border-collapse:collapse">
              <thead>
                <tr style="background:#f3f4f6">
                  <th class="p-2.5 border border-black">Rank</th>
                  <th class="p-2.5 border border-black text-left">Entry</th>
                  <th v-for="j in data.judges" :key="j.id" class="p-2.5 border border-black">{{ j.name }}</th>
                  <th class="p-2.5 border border-black">Average</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rows" :key="r.id">
                  <td class="p-2.5 border border-black text-center font-bold">{{ r.judged ? r.rank : '–' }}</td>
                  <td class="p-2.5 border border-black"><b>#{{ r.number }}</b> {{ r.name }}</td>
                  <td v-for="j in data.judges" :key="j.id" class="p-2.5 border border-black text-center num">
                    {{ r.totals[j.id] !== undefined ? r.totals[j.id].toFixed(2) : '–' }}
                  </td>
                  <td class="p-2.5 border border-black text-center font-bold num">{{ r.judged ? r.avg.toFixed(2) : '–' }}</td>
                </tr>
              </tbody>
            </table>

            <p class="text-xs mt-4" style="color:#444">
              Criteria: {{ event.criteria.map(c => `${c.name} (${c.weight}%)`).join(', ') }}
            </p>

            <div class="grid grid-cols-3 gap-10 text-center text-xs" style="margin-top:64px">
              <div v-for="s in ['Tabulator', 'Head Judge', 'Chairman of Judges']" :key="s">
                <div style="border-top:1px solid #111;padding-top:6px" class="font-bold">{{ s }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>