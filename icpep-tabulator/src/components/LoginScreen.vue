<script setup>
import { ref } from 'vue'
import { ui, login, setTheme } from '../store'
import Icon from './Icon.vue'
const role = ref('judge'), secret = ref(''), err = ref(''), busy = ref(false)
const submit = async () => { busy.value = true; err.value = (await login(role.value, secret.value.trim())) || ''; busy.value = false }
</script>
<template>
  <div class="min-h-screen grid md:grid-cols-2 bg-gradient-to-br from-blue-50 via-white to-pink-50 dark:from-slate-950 dark:via-indigo-950/50 dark:to-pink-950/30">
    <section class="hidden md:flex flex-col justify-between p-12 lg:p-16 bg-gradient-to-br from-blue-800 via-indigo-700 to-pink-600 text-white shadow-2xl">
      <div class="flex items-center gap-3">
        <span class="px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur-sm display font-extrabold text-sm tracking-wider">ICPEP</span>
        <span class="display font-extrabold text-base opacity-90">Tabulator System</span>
      </div>
      <div>
        <h2 class="display font-extrabold text-5xl lg:text-6xl leading-[1.06] max-w-md">
          One sheet per judge. One board for the admin.
        </h2>
        <p class="mt-6 text-base lg:text-lg text-blue-100 max-w-md leading-relaxed">
          Scores go from 0 to 100 on each criterion, weighted by the percentages the admin sets for each event.
        </p>
      </div>
      <p class="text-sm text-pink-100/80">Judges: ask the tabulator for your access code.</p>
    </section>

    <section class="flex items-center justify-center p-6 sm:p-10 relative">
      <button class="icon-btn absolute top-6 right-6" aria-label="Toggle theme" @click="setTheme(ui.theme === 'dark' ? 'light' : 'dark')">
        <Icon :name="ui.theme === 'dark' ? 'sun' : 'moon'" />
      </button>

      <form class="card w-full max-w-md p-8 sm:p-10 space-y-6" @submit.prevent="submit">
        <div>
          <h1 class="display font-extrabold text-3xl bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">Log in</h1>
          <p class="text-base muted mt-1">Choose how you are entering the system.</p>
        </div>

        <div class="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl bg-gradient-to-r from-blue-500/10 to-pink-500/10 border" style="border-color:var(--line)" role="tablist">
          <button
            v-for="r in ['judge', 'admin']"
            :key="r"
            type="button"
            role="tab"
            :aria-selected="role === r"
            @click="role = r; err = ''"
            class="py-2.5 rounded-lg text-sm font-bold capitalize transition-all"
            :class="role === r ? 'bg-gradient-to-r from-blue-600 to-pink-500 text-white shadow-md' : 'muted hover:opacity-80'"
          >
            {{ r }}
          </button>
        </div>

        <div>
          <label class="label block text-sm font-semibold mb-2" for="secret">
            {{ role === 'judge' ? 'Access code' : 'Admin password' }}
          </label>
          <input
            id="secret"
            v-model="secret"
            class="field w-full text-base py-3"
            :type="role === 'admin' ? 'password' : 'text'"
            :inputmode="role === 'judge' ? 'numeric' : 'text'"
            autocomplete="off"
            required
          />
        </div>

        <p v-if="err" class="text-sm font-semibold text-pink-600" role="alert">{{ err }}</p>

        <button class="btn btn-primary w-full justify-center py-3 text-base" :disabled="busy">
          {{ busy ? 'Checking...' : 'Log in' }}
        </button>
      </form>
    </section>
  </div>
</template>