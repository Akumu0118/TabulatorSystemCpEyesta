<script setup>
import { onMounted } from 'vue'
import { ui, isAdmin, start } from './store'
import AppHeader from './components/AppHeader.vue'

import LoginScreen from './components/LoginScreen.vue'
import EventNav from './components/EventNav.vue'
import AdminDashboard from './components/AdminDashboard.vue'
import JudgePortal from './components/JudgePortal.vue'
onMounted(start)
</script>

<template>
  <LoginScreen v-if="!ui.session" />
  <div
    v-else
    class="h-dvh w-full overflow-hidden flex bg-gradient-to-br from-blue-100/80 via-white to-pink-100/80 dark:from-slate-900 dark:via-blue-950 dark:to-pink-950 text-slate-900 dark:text-slate-100 transition-colors duration-200"
  >
    <!-- Left Sidebar: Fixed Drawer on Mobile/Tablet, Full-Height Column on Desktop -->
    <EventNav />

    <!-- Right Workspace: Locked to Viewport Width so Inner Tables Scroll Side-to-Side -->
    <div class="flex-1 w-full max-w-full min-w-0 h-dvh flex flex-col overflow-y-auto overflow-x-hidden">
      <AppHeader />
      <main class="flex-1 w-full max-w-full min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <AdminDashboard v-if="isAdmin()" />
        <JudgePortal v-else />
      </main>
     
    </div>
  </div>
</template>