<script setup>
import { ref, onMounted } from 'vue'
import { ui, isAdmin, currentEvent, setTheme } from '../store'
import Icon from './Icon.vue'
import SetupModal from './SetupModal.vue'

const showAccess = ref(false)

const applyThemeClass = (mode) => {
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.dataset.theme = mode
}

const toggleTheme = () => {
  const next = ui.theme === 'dark' ? 'light' : 'dark'
  setTheme(next)
  applyThemeClass(next)
}

onMounted(() => {
  applyThemeClass(ui.theme || 'light')
})
</script>

<template>
<header class="sticky top-0 z-20 backdrop-blur-md border-b border-blue-200/80 dark:border-pink-500/30 bg-gradient-to-r from-blue-100/95 via-white/95 to-pink-100/95 dark:from-blue-900/95 dark:via-indigo-900/95 dark:to-pink-800/95 text-slate-900 dark:text-white shadow-sm transition-colors duration-200">    <div class="px-3.5 sm:px-6 lg:px-8 h-18 sm:h-24 flex items-center gap-2 sm:gap-4">
      <!-- Hamburger Menu -->
      <button
        class="w-11 h-11 shrink-0 rounded-xl grid place-items-center lg:hidden text-blue-700 dark:text-white bg-blue-500/10 dark:bg-white/15 hover:bg-blue-500/20 transition"
        aria-label="Open events menu"
        @click="ui.navOpen = !ui.navOpen"
      >
        <Icon name="menu" class="w-6 h-6" />
      </button>

      <!-- Title -->
      <div class="min-w-0 flex-1">
        <p class="text-[10px] sm:text-xs uppercase tracking-wider font-bold text-blue-600 dark:text-pink-300 truncate">
          {{ isAdmin() ? 'Administrator Dashboard' : 'Judge Scoring Sheet' }}
        </p>
        <h2 class="display font-extrabold text-base sm:text-xl lg:text-2xl truncate mt-0.5">
          {{ currentEvent()?.name || 'Select an Event' }}
        </h2>
      </div>

      <!-- Status Indicator: Clean Circle on Mobile, Full Pill on sm+ -->
      <span
        class="chip inline-flex items-center justify-center gap-2 w-10 h-10 !p-0 sm:!w-auto sm:!h-auto sm:!px-4 sm:!py-2 text-xs sm:text-sm font-bold rounded-full border shrink-0"
        :title="ui.online ? 'Connected to the admin host' : 'Offline. Scores are kept on this device'"
      >
        <span class="dot" :class="ui.online ? 'on' : 'off'"></span>
        <span class="hidden sm:inline">{{ ui.online ? 'Connected' : 'Offline' }}</span>
        <span v-if="ui.pending.length" class="hidden sm:inline text-xs">({{ ui.pending.length }})</span>
      </span>

      <!-- Judge Access Button -->
      <button
        v-if="isAdmin()"
        class="btn !w-11 !h-11 !p-0 md:!w-auto md:!px-4 shrink-0"
        aria-label="Judge access"
        @click="showAccess = true"
      >
        <Icon name="wifi" class="w-5 h-5" />
        <span class="hidden md:inline">Judge access</span>
      </button>

      <!-- Dark / Light Mode Toggle -->
      <button
        type="button"
        class="flex items-center justify-center gap-2 w-11 h-11 sm:w-auto sm:px-5 sm:py-3 rounded-xl font-bold text-xs sm:text-base bg-gradient-to-r from-blue-600 to-pink-500 hover:brightness-110 text-white shadow-md shadow-pink-500/20 transition active:scale-95 cursor-pointer shrink-0"
        :aria-label="ui.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        <Icon :name="ui.theme === 'dark' ? 'sun' : 'moon'" class="w-5 h-5" />
        <span class="hidden sm:inline">{{ ui.theme === 'dark' ? 'Light mode' : 'Dark mode' }}</span>
      </button>
    </div>

    <SetupModal v-if="showAccess" @close="showAccess = false" />
  </header>
</template>