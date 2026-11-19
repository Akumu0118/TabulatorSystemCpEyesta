<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import { data, ui, currentEvent, addEvent, logout, setTheme } from '../store'
import type { Id, TabEvent } from '../types'
import Icon from './Icon.vue'
import logo from '../assets/brand/icpep-logo.png'

const adding = ref(false)
const name = ref('')
const lanUrl = ref('')

onMounted(async () => {
  try {
    const info = await api.info()
    if (info.ips.length) lanUrl.value = `${info.ips[0]}:${info.port}`
  } catch { /* shown as unknown */ }
})

/** "10 of 15 sheets in": one sheet per judge per entry. */
function progress(e: TabEvent): string {
  const total = e.candidates.length * data.judges.length
  if (!total) return 'No entries yet'
  let done = 0
  for (const c of e.candidates) for (const j of data.judges) if (data.scores[e.id]?.[c.id]?.[j.id]) done++
  return done ? `${done} of ${total} sheets in` : 'Not started'
}

const save = () => {
  if (name.value.trim()) addEvent(name.value.trim())
  name.value = ''
  adding.value = false
}
const pick = (id: Id) => {
  ui.activeEvent = id
  ui.navOpen = false
}
</script>

<template>
  <div v-if="ui.navOpen" class="no-print fixed inset-0 z-40 bg-slate-950/60 lg:hidden" @click="ui.navOpen = false"></div>

  <aside
    class="no-print fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col gap-6 px-4 py-6 bg-side text-side-ink transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:shrink-0"
    :class="ui.navOpen ? 'translate-x-0' : '-translate-x-full'"
    aria-label="Events"
  >
    <div class="flex items-center gap-3 px-2">
      <img :src="logo" alt="ICpEP.SE Cagayan State University Chapter logo" class="w-12 h-12 object-contain shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="display font-bold text-[17px] leading-tight">ICPEP Tabulator</p>
        <p class="text-xs text-side-muted">Admin</p>
      </div>
      <button class="icon-btn lg:hidden !text-side-muted hover:!bg-side-active" aria-label="Close menu" @click="ui.navOpen = false">
        <Icon name="x" />
      </button>
    </div>

    <nav class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1">
      <p class="px-2 pb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase text-side-muted">Events</p>
      <button
        v-for="e in data.events"
        :key="e.id"
        class="flex items-center gap-2.5 min-h-[52px] px-3 py-2 rounded-[10px] text-left hover:bg-side-active"
        :class="currentEvent()?.id === e.id && 'bg-side-active shadow-[inset_3px_0_0_#7A9BFF]'"
        :aria-current="currentEvent()?.id === e.id ? 'page' : undefined"
        @click="pick(e.id)"
      >
        <span class="flex-1 min-w-0">
          <span class="block font-semibold text-sm truncate">{{ e.name }}</span>
          <span class="block num text-xs text-side-muted">{{ progress(e) }}</span>
        </span>
        <span v-if="e.locked" class="pill !text-[11px] !py-0.5 bg-side-line text-side-muted">Closed</span>
      </button>

      <form v-if="adding" class="mt-2 flex flex-col gap-2" @submit.prevent="save">
        <input v-model="name" class="field !bg-surface !text-ink" placeholder="Event name" aria-label="Event name" autofocus />
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" type="submit">Add event</button>
          <button class="btn flex-1 !bg-transparent !text-side-ink !border-side-line" type="button" @click="adding = false">Cancel</button>
        </div>
      </form>
      <button
        v-else
        class="mt-2 h-11 px-3 rounded-[10px] border border-dashed border-[#3A4A66] flex items-center gap-2 text-sm font-semibold hover:bg-side-active"
        @click="adding = true"
      >
        <Icon name="plus" />New event
      </button>
    </nav>

    <div class="flex flex-col gap-3 pt-4 px-2 border-t border-side-line">
      <div class="flex items-center gap-2.5 text-[13px]">
        <span class="dot !w-2 !h-2" :class="ui.online ? 'text-emerald-400' : 'text-orange-400'"></span>
        <span class="flex flex-col">
          <span class="font-semibold">{{ ui.online ? 'Hosting on the LAN' : 'Server not responding' }}</span>
          <span class="num text-side-muted">{{ lanUrl || 'Address unknown' }}</span>
        </span>
      </div>
      <div class="flex gap-2">
        <button
          class="btn flex-1 !bg-side-active !text-side-ink !border-side-line"
          @click="setTheme(ui.theme === 'dark' ? 'light' : 'dark')"
        >
          <Icon :name="ui.theme === 'dark' ? 'sun' : 'moon'" />{{ ui.theme === 'dark' ? 'Light' : 'Dark' }}
        </button>
        <button class="btn flex-1 !bg-side-active !text-side-ink !border-side-line" @click="logout">
          <Icon name="out" />Log out
        </button>
      </div>
    </div>
  </aside>
</template>
