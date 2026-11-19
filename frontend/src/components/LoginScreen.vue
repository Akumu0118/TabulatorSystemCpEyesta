<script setup lang="ts">
import { computed, ref } from 'vue'
import { ui, login, setTheme } from '../store'
import type { Role } from '../types'
import Icon from './Icon.vue'
import logo from '../assets/brand/icpep-logo.png'

const role = ref<Role>('judge')
const secret = ref('')
const show = ref(false)
const err = ref('')
const busy = ref(false)
const digits = computed(() => secret.value.replace(/\D/g, '').slice(0, 4))

const switchRole = (r: Role) => {
  role.value = r
  secret.value = ''
  err.value = ''
}
const onCode = (e: Event) => {
  secret.value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4)
  err.value = ''
  if (secret.value.length === 4) void submit()
}
const submit = async () => {
  if (busy.value) return
  if (role.value === 'judge' && digits.value.length !== 4) return (err.value = 'Enter all 4 digits of your code.')
  if (role.value === 'admin' && !secret.value) return (err.value = 'Enter the admin password.')
  busy.value = true
  err.value = (await login(role.value, role.value === 'judge' ? digits.value : secret.value)) ?? ''
  busy.value = false
}
</script>

<template>
  <div class="min-h-dvh flex flex-wrap bg-ground text-ink">
    <section
      aria-label="About this system"
      class="hidden md:flex flex-1 basis-[420px] flex-col justify-between gap-10 p-[clamp(28px,5vw,64px)] bg-side text-side-ink"
    >
      <div class="flex items-center gap-3.5">
        <img :src="logo" alt="" class="w-11 h-11 object-contain" />
        <span class="display font-bold text-lg">ICPEP Tabulator</span>
      </div>
      <div class="flex flex-col items-start gap-6 max-w-[460px]">
        <img :src="logo" alt="ICpEP.SE Cagayan State University Chapter logo" class="w-[clamp(140px,18vw,200px)] h-auto" />
        <h1 class="display text-[clamp(30px,3.4vw,42px)] leading-[1.1] font-bold">Live scoring for every event on campus.</h1>
        <p class="text-base leading-relaxed text-side-muted">
          Judges score from their phones over the event Wi-Fi. Totals and rankings update on the tabulator as each sheet comes in. No internet needed.
        </p>
      </div>
      <span class="text-[13px] text-side-muted">ICpEP.SE · Cagayan State University Chapter</span>
    </section>

    <main class="flex-1 basis-[420px] grid place-items-center px-4 py-10 relative">
      <button
        class="icon-btn absolute top-4 right-4"
        :aria-label="ui.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="setTheme(ui.theme === 'dark' ? 'light' : 'dark')"
      >
        <Icon :name="ui.theme === 'dark' ? 'sun' : 'moon'" />
      </button>

      <form class="w-full max-w-[380px] flex flex-col gap-5" novalidate @submit.prevent="submit">
        <img :src="logo" alt="ICpEP.SE logo" class="md:hidden w-20 h-20 object-contain" />

        <template v-if="role === 'judge'">
          <div class="flex flex-col gap-1.5">
            <h2 class="display text-[30px] leading-tight font-bold">Welcome, judge.</h2>
            <p class="text-muted leading-normal">Enter the 4-digit code the tabulator gave you.</p>
          </div>
          <label class="label">Access code
            <input
              :value="digits"
              class="field num display !h-16 !text-[32px] font-bold text-center tracking-[0.6em] !pl-[0.6em]"
              inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]*"
              placeholder="••••" autofocus :aria-invalid="!!err" aria-describedby="login-err"
              @input="onCode"
            />
          </label>
        </template>

        <template v-else>
          <div class="flex flex-col gap-1.5">
            <h2 class="display text-[28px] font-bold">Admin sign in</h2>
            <p class="text-muted leading-normal">Only the tabulator computer needs this. Judges use their 4-digit code.</p>
          </div>
          <label class="label">Admin password
            <span class="relative block">
              <input
                v-model="secret" :type="show ? 'text' : 'password'" autocomplete="current-password"
                class="field !h-[52px] !pr-14 font-normal" autofocus :aria-invalid="!!err" aria-describedby="login-err"
              />
              <button
                type="button" class="icon-btn absolute right-1 top-1"
                :aria-label="show ? 'Hide password' : 'Show password'" :aria-pressed="show" @click="show = !show"
              ><Icon name="eye" :size="20" /></button>
            </span>
          </label>
        </template>

        <p v-if="err" id="login-err" role="alert" class="-mt-2 flex items-start gap-2 text-sm text-danger">
          <Icon name="alert" :size="16" class="shrink-0 mt-0.5" />{{ err }}
        </p>

        <button class="btn btn-primary btn-lg" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>

        <button type="button" class="self-center text-sm font-semibold text-accent-ink underline-offset-4 hover:underline min-h-11 px-2" @click="switchRole(role === 'judge' ? 'admin' : 'judge')">
          {{ role === 'judge' ? 'I am the tabulator (admin)' : 'I am a judge' }}
        </button>
      </form>
    </main>
  </div>
</template>
