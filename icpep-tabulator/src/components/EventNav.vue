<script setup>
import { ref } from 'vue'
import { data, ui, isAdmin, currentEvent, addEvent, logout } from '../store'
import Icon from './Icon.vue'

const adding = ref(false), name = ref('')
const logo = ref(localStorage.getItem('tab_logo'))

const upload = e => {
  const f = e.target.files[0]; if (!f) return
  const r = new FileReader()
  r.onload = () => { logo.value = r.result; localStorage.setItem('tab_logo', r.result) }
  r.readAsDataURL(f)
}

const save = () => { if (name.value.trim()) addEvent(name.value.trim()); name.value = ''; adding.value = false }
const pick = id => { ui.activeEvent = id; ui.navOpen = false }
</script>

<template>
  <!-- Mobile/Tablet Backdrop -->
  <div
    v-if="ui.navOpen"
    class="fixed inset-0 z-40 lg:hidden bg-slate-950/60 backdrop-blur-xs"
    @click="ui.navOpen = false"
  ></div>

  <aside
    class="fixed inset-y-0 left-0 z-50 w-[82vw] max-w-72 h-dvh flex flex-col overflow-hidden transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:w-72 lg:shrink-0 border-r border-blue-200/80 dark:border-pink-500/30 bg-gradient-to-b from-blue-100 via-indigo-50 to-pink-100 dark:from-blue-900 dark:via-indigo-900 dark:to-pink-800 text-slate-900 dark:text-white shadow-xl"
    :class="ui.navOpen ? 'translate-x-0' : '-translate-x-full'"
    aria-label="Events"
  >
    <!-- Brand Logo & Title -->
    <div class="px-5 pt-6 pb-5 border-b border-blue-300/50 dark:border-white/15 flex items-center gap-3.5 shrink-0">
      <label
        class="relative w-12 h-12 shrink-0 rounded-2xl grid place-items-center overflow-hidden cursor-pointer bg-gradient-to-br from-blue-600 to-pink-500 text-white ring-2 ring-blue-400/50 dark:ring-white/40 hover:scale-105 transition shadow-md"
        title="Click to change logo"
      >
        <img v-if="logo" :src="logo" alt="Logo" class="w-full h-full object-cover" />
        <span v-else class="display font-extrabold text-sm tracking-wide">ICPEP</span>
        <input type="file" accept="image/*" class="absolute inset-0 opacity-0 cursor-pointer" @change="upload" />
      </label>

      <div class="min-w-0 flex-1">
        <h1 class="display font-extrabold text-lg leading-tight truncate bg-gradient-to-r from-blue-700 to-pink-600 dark:from-blue-200 dark:to-pink-200 bg-clip-text text-transparent">
          ICPEP Tabulator
        </h1>
        <p class="text-xs font-semibold text-slate-600 dark:text-blue-100/90 truncate mt-0.5">
          {{ isAdmin() ? 'Admin Control Panel' : ui.session.name }}
        </p>
      </div>

      <button
        class="p-2 rounded-lg lg:hidden text-slate-700 dark:text-white hover:bg-black/10 dark:hover:bg-white/15"
        aria-label="Close menu"
        @click="ui.navOpen = false"
      >
        <Icon name="x" />
      </button>
    </div>

    <!-- Scrollable Events List -->
    <p class="px-6 pt-5 pb-2.5 text-xs uppercase tracking-wider font-extrabold text-blue-700 dark:text-pink-200 shrink-0">
      Events
    </p>

    <nav class="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-1.5">
      <button
        v-for="e in data.events"
        :key="e.id"
        class="sidenav-item"
        :aria-current="currentEvent()?.id === e.id"
        @click="pick(e.id)"
      >
        <span class="flex-1 truncate text-left">{{ e.name }}</span>
        <Icon v-if="e.locked" name="lock" class="!w-4 !h-4 opacity-90 shrink-0" />
      </button>
    </nav>

    <!-- Bottom Actions -->
    <div class="p-4 border-t border-blue-300/50 dark:border-white/15 space-y-2.5 shrink-0">
      <template v-if="isAdmin()">
        <form v-if="adding" class="space-y-2.5" @submit.prevent="save">
          <input
            v-model="name"
            class="field w-full !bg-white/95 !text-slate-900"
            placeholder="Event name"
            aria-label="Event name"
            autofocus
          />
          <div class="flex gap-2">
            <button class="btn btn-primary flex-1 justify-center" type="submit">Add event</button>
            <button class="sidenav-item !w-auto !justify-center" type="button" @click="adding = false">Cancel</button>
          </div>
        </form>
        <button
          v-else
          class="sidenav-item bg-white/55 hover:bg-white/80 dark:bg-white/15 dark:hover:bg-white/25 border border-blue-300/60 dark:border-white/20"
          @click="adding = true"
        >
          <Icon name="plus" />New event
        </button>
      </template>

      <button
        type="button"
        class="sidenav-item bg-gradient-to-r from-blue-600/15 to-pink-600/20 hover:from-blue-600/25 hover:to-pink-600/30 dark:from-white/15 dark:to-pink-500/30 dark:hover:from-white/25 dark:hover:to-pink-500/45 text-pink-700 dark:text-white border border-pink-400/40 dark:border-white/25 shadow-xs"
        @click="logout"
      >
        <Icon name="out" />
        <span>Log out</span>
      </button>
    </div>
  </aside>
</template>