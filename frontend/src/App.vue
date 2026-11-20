<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { ui, isAdmin, start } from './store'
import { applyUpdate, pwa } from './pwa'
import LoginScreen from './components/LoginScreen.vue'
import EventNav from './components/EventNav.vue'
import AdminDashboard from './components/AdminDashboard.vue'
import JudgePortal from './components/JudgePortal.vue'
import Icon from './components/Icon.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'

// The presentation is only loaded when it is opened.
const PresenterView = defineAsyncComponent(() => import('./components/present/PresenterView.vue'))
const AudienceView = defineAsyncComponent(() => import('./components/present/AudienceView.vue'))

onMounted(start)

/* #/present/<eventId> is the projector window; #/present/<eventId>/presenter is the organizer's. */
const hash = ref(location.hash)
addEventListener('hashchange', () => { hash.value = location.hash })
const present = computed(() => {
  const m = /^#\/present\/(\d+)(\/presenter)?$/.exec(hash.value)
  return m ? { id: Number(m[1]), presenter: !!m[2] } : null
})
const updateDismissed = ref(false)

let noticeTimer: ReturnType<typeof setTimeout> | undefined
watch(() => ui.notice, msg => {
  clearTimeout(noticeTimer)
  if (msg) noticeTimer = setTimeout(() => { ui.notice = '' }, 6000)
})
</script>

<template>
  <ConfirmDialog />

  <Transition name="toast">
    <div
      v-if="ui.notice"
      class="no-print fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[calc(100%-2rem)] max-w-lg card shadow-lg px-4 py-2 flex items-center gap-3 text-sm font-semibold text-danger"
      role="alert"
    >
      <Icon name="alert" class="shrink-0" />
      <span class="flex-1">{{ ui.notice }}</span>
      <button class="icon-btn" aria-label="Dismiss" @click="ui.notice = ''"><Icon name="x" /></button>
    </div>
  </Transition>

  <Transition name="toast">
    <div
      v-if="pwa.updateReady && ui.online && !present && !updateDismissed"
      class="no-print fixed bottom-4 right-4 z-[75] max-w-sm card shadow-lg p-4 flex flex-col gap-3 text-sm" role="status"
    >
      <span><b>A new version of the tabulator is ready.</b> Your scores stay on this device.</span>
      <span class="flex justify-end gap-2">
        <button class="btn !min-h-9" @click="updateDismissed = true">Later</button>
        <button class="btn btn-primary !min-h-9" @click="applyUpdate">Update now</button>
      </span>
    </div>
  </Transition>

  <LoginScreen v-if="!ui.session" />

  <template v-else-if="present && isAdmin()">
    <PresenterView v-if="present.presenter" :key="`p${present.id}`" :event-id="present.id" />
    <AudienceView v-else :key="`a${present.id}`" :event-id="present.id" />
  </template>

  <div v-else-if="isAdmin()" class="min-h-dvh lg:flex bg-ground text-ink">
    <EventNav />
    <main class="flex-1 min-w-0">
      <AdminDashboard />
    </main>
  </div>

  <JudgePortal v-else />
</template>
