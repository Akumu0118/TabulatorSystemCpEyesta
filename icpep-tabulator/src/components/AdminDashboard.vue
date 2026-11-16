<script setup>
import { ref } from 'vue'
import { currentEvent, removeEvent } from '../store'
import Icon from './Icon.vue'
import LeaderboardTable from './LeaderboardTable.vue'
import CriteriaManager from './CriteriaManager.vue'
import ContestantManager from './ContestantManager.vue'
import PrintTallyModal from './PrintTallyModal.vue'
const showPrint = ref(false)
const del = ev => { if (confirm(`Delete "${ev.name}" with all its criteria, entries and scores?`)) removeEvent(ev.id) }
</script>
<template>
  <div v-if="currentEvent()" class="space-y-6 sm:space-y-8">
    <div class="card p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-4 bg-gradient-to-r from-blue-600/10 via-indigo-500/5 to-pink-600/10">
      <h2 class="display font-extrabold text-2xl sm:text-3xl lg:mr-auto bg-gradient-to-r from-blue-600 to-pink-600 dark:from-blue-300 dark:to-pink-300 bg-clip-text text-transparent">
        {{ currentEvent().name }}
      </h2>

      <div class="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3">
        <button class="btn flex-1 sm:flex-initial" @click="currentEvent().locked = !currentEvent().locked">
          <Icon :name="currentEvent().locked ? 'lock' : 'unlock'" />
          <span>{{ currentEvent().locked ? 'Scoring closed' : 'Scoring open' }}</span>
        </button>

        <button class="btn btn-primary flex-1 sm:flex-initial" @click="showPrint = true">
          <Icon name="print" />
          <span>Print tally sheet</span>
        </button>

        <button
          class="icon-btn shrink-0 border border-pink-400/30 bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-300"
          title="Delete event"
          aria-label="Delete event"
          @click="del(currentEvent())"
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>

    <div class="grid xl:grid-cols-[minmax(0,1fr)_460px] gap-6 sm:gap-8 items-start">
      <LeaderboardTable :event="currentEvent()" />
      <div class="space-y-6 sm:space-y-8">
        <CriteriaManager :event="currentEvent()" />
        <ContestantManager :event="currentEvent()" />
      </div>
    </div>

    <PrintTallyModal v-if="showPrint" :event="currentEvent()" @close="showPrint = false" />
  </div>

  <div v-else class="card p-8 sm:p-10 text-center muted text-base">
    No events yet. Use <strong class="text-pink-600 dark:text-pink-400">"+ New event"</strong> in the sidebar to create one.
  </div>
</template>