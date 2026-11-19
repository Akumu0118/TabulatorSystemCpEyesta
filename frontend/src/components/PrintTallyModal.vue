<script setup lang="ts">
import { computed } from 'vue'
import { data, rankingsFor } from '../store'
import { fmt } from '../scoring'
import type { TabEvent } from '../types'
import Icon from './Icon.vue'
import logo from '../assets/brand/icpep-logo.png'

const props = defineProps<{ event: TabEvent }>()
defineEmits<{ close: [] }>()

const rows = computed(() => rankingsFor(props.event))
const missing = computed(() => rows.value.some(r => r.judged < data.judges.length))
const printed = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const signers = ['Tabulator', 'Head Judge', 'Chairman of Judges']
const print = () => window.print()
</script>

<template>
  <Teleport to="body">
    <div class="scrim !items-start" @click.self="$emit('close')">
      <div class="w-full max-w-[860px] my-4 flex flex-col gap-3" role="dialog" aria-modal="true" aria-label="Tally sheet preview">
        <div class="no-print dialog flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 class="display text-xl font-bold">Tally sheet</h2>
            <p class="text-sm text-muted">In the print window, pick a printer or "Save as PDF".</p>
          </div>
          <div class="flex gap-2.5">
            <button class="btn" @click="$emit('close')">Close</button>
            <button class="btn btn-primary" @click="print"><Icon name="print" />Print</button>
          </div>
        </div>

        <div class="overflow-x-auto rounded-[18px]">
          <article id="print-sheet" class="w-[794px] min-h-[1123px] mx-auto bg-white text-[#0F172A] px-[60px] py-14 flex flex-col gap-[22px] text-[13px] shadow-xl">
            <header class="flex items-center gap-[18px] pb-4 border-b-2 border-[#0F172A]">
              <img :src="logo" alt="ICpEP.SE Cagayan State University Chapter logo" class="w-[76px] h-[76px] object-contain" />
              <div class="flex-1 flex flex-col gap-[3px]">
                <span class="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#536071]">Institute of Computer Engineers of the Philippines · Student Edition</span>
                <span class="text-xs text-[#536071]">Cagayan State University Chapter</span>
                <h1 class="display mt-1 text-[26px] font-bold">{{ event.name }} · Official tally</h1>
              </div>
              <div class="num flex flex-col items-end gap-[3px] text-xs text-[#536071]">
                <span>Printed {{ printed }}</span>
                <span>{{ data.judges.length }} judges · {{ event.candidates.length }} entries</span>
              </div>
            </header>

            <p v-if="missing" class="px-3 py-2 rounded-md bg-[#FDEBDD] text-[#7A3500] font-semibold">
              Provisional: not every judge has submitted a sheet for every entry.
            </p>

            <section class="flex flex-col gap-1.5">
              <h2 class="text-xs font-bold tracking-[0.06em] uppercase">Criteria</h2>
              <p class="num text-[#334155]">
                {{ event.criteria.map(c => `${c.name} ${c.weight}% (out of ${c.max_score})`).join(' · ') }}.
                Each judge's total is out of 100; the final score is the average across judges.
              </p>
            </section>

            <table class="num w-full border-collapse text-sm">
              <thead>
                <tr class="bg-[#F0F2F5] text-[11px] tracking-[0.06em] uppercase">
                  <th scope="col" class="px-3 py-2.5 text-left border border-[#C9D0DA] w-14">Rank</th>
                  <th scope="col" class="px-3 py-2.5 text-left border border-[#C9D0DA]">Entry</th>
                  <th v-for="j in data.judges" :key="j.id" scope="col" class="px-3 py-2.5 text-right border border-[#C9D0DA]">{{ j.name }}</th>
                  <th scope="col" class="px-3 py-2.5 text-right border border-[#C9D0DA]">Average</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rows" :key="r.id">
                  <td class="px-3 py-[11px] border border-[#C9D0DA] font-bold">{{ r.rank }}</td>
                  <td class="px-3 py-[11px] border border-[#C9D0DA]"><span class="text-[#536071] mr-1.5">#{{ r.number }}</span>{{ r.name }}</td>
                  <td v-for="j in data.judges" :key="j.id" class="px-3 py-[11px] border border-[#C9D0DA] text-right">
                    {{ r.totals[j.id] !== undefined ? fmt(r.totals[j.id]) : '–' }}
                  </td>
                  <td class="px-3 py-[11px] border border-[#C9D0DA] text-right font-bold">{{ r.judged ? fmt(r.avg) : '–' }}</td>
                </tr>
              </tbody>
            </table>

            <p class="text-xs text-[#536071]">Tied entries share a rank. Scores are rounded to two decimal places.</p>

            <section aria-label="Signatures" class="mt-auto grid grid-cols-3 gap-8">
              <div v-for="s in signers" :key="s" class="flex flex-col gap-1.5 pt-12">
                <span class="border-t border-[#0F172A]"></span>
                <span class="font-semibold text-center">{{ s }}</span>
                <span class="text-[11px] text-[#536071] text-center">Signature over printed name</span>
              </div>
            </section>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
</template>
