<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { ui, isAdmin, start } from './store'
import LoginScreen from './components/LoginScreen.vue'
import EventNav from './components/EventNav.vue'
import AdminDashboard from './components/AdminDashboard.vue'
import JudgePortal from './components/JudgePortal.vue'
import Icon from './components/Icon.vue'

onMounted(start)

let noticeTimer: ReturnType<typeof setTimeout> | undefined
watch(() => ui.notice, msg => {
  clearTimeout(noticeTimer)
  if (msg) noticeTimer = setTimeout(() => { ui.notice = '' }, 6000)
})
</script>

<template>
  <div
    v-if="ui.notice"
    class="no-print fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-lg card shadow-lg px-4 py-2 flex items-center gap-3 text-sm font-semibold text-danger"
    role="alert"
  >
    <Icon name="alert" class="shrink-0" />
    <span class="flex-1">{{ ui.notice }}</span>
    <button class="icon-btn" aria-label="Dismiss" @click="ui.notice = ''"><Icon name="x" /></button>
  </div>

  <LoginScreen v-if="!ui.session" />

  <div v-else-if="isAdmin()" class="min-h-dvh lg:flex bg-ground text-ink">
    <EventNav />
    <main class="flex-1 min-w-0">
      <AdminDashboard />
    </main>
  </div>

  <JudgePortal v-else />
</template>
