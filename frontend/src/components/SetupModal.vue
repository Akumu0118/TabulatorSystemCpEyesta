<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { api } from '../api'
import { data, addJudge, removeJudge, regenCode, updateJudge } from '../store'
import type { Judge } from '../types'
import Icon from './Icon.vue'

defineEmits<{ close: [] }>()
const urls = ref<string[]>([location.origin])
const qr = ref('')
const name = ref('')
const copied = ref('')
const onlyLocal = computed(() => urls.value.every(u => /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(u)))

onMounted(async () => {
  try {
    const info = await api.info()
    if (info.ips.length) urls.value = info.ips.map(ip => `http://${ip}:${info.port}`)
  } catch { /* keep location.origin */ }
})

// Generated in the browser: no internet needed.
watch(urls, async list => {
  try { qr.value = await QRCode.toDataURL(list[0], { margin: 1, width: 360, errorCorrectionLevel: 'M' }) } catch { qr.value = '' }
}, { immediate: true })

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => { copied.value = '' }, 1500)
  } catch { /* clipboard is blocked on plain http; the address is selectable */ }
}
const add = () => {
  if (name.value.trim()) addJudge(name.value.trim())
  name.value = ''
}
const rename = (j: Judge, e: Event) => {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== j.name) updateJudge(j, v)
}
const newCode = (j: Judge) => {
  if (confirm(`Give ${j.name} a new code? They will be signed out and need the new code to sign in again.`)) regenCode(j)
}
const remove = (j: Judge) => {
  if (confirm(`Remove ${j.name}? Their scores are deleted too.`)) removeJudge(j.id)
}
</script>

<template>
  <Teleport to="body">
    <div class="scrim !items-start" @click.self="$emit('close')">
      <div class="dialog max-w-[720px] my-6" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <div class="flex items-start justify-between gap-3 px-6 pt-[22px]">
          <div class="flex flex-col gap-1">
            <h2 id="access-title" class="display text-[22px] font-bold">Judge access</h2>
            <span class="text-sm text-muted">Judges' phones and this computer must be on the same Wi-Fi. No internet is needed.</span>
          </div>
          <button class="icon-btn" aria-label="Close" @click="$emit('close')"><Icon name="x" /></button>
        </div>

        <div class="flex flex-col gap-6 px-6 py-5">
          <section class="grid sm:grid-cols-[180px_1fr] gap-5 items-center">
            <div class="w-[180px] h-[180px] mx-auto rounded-xl border border-line bg-white p-2 grid place-items-center">
              <img v-if="qr" :src="qr" :alt="`QR code for ${urls[0]}`" class="w-full h-full" />
            </div>
            <div class="flex flex-col gap-3">
              <p class="font-semibold">1. Judges scan the code or open this address</p>
              <p v-if="onlyLocal" role="alert" class="text-sm font-semibold text-danger">
                This computer's LAN address is unknown, and judges cannot use "localhost". Re-run the start-lan script
                while connected to the event Wi-Fi, or set HOST_LAN_IP in .env.
              </p>
              <div v-for="u in urls" :key="u" class="flex items-center gap-2">
                <code class="field num flex-1 flex items-center font-semibold !bg-ground select-all">{{ u }}</code>
                <button class="btn shrink-0" @click="copy(u)"><Icon name="copy" :size="16" />{{ copied === u ? 'Copied' : 'Copy' }}</button>
              </div>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <p class="font-semibold">2. Give each judge their 4-digit code</p>
            <ul class="card flex flex-col">
              <li v-for="(j, i) in data.judges" :key="j.id" class="flex flex-wrap sm:flex-nowrap items-center gap-2.5 px-4 py-3" :class="{ 'border-t border-line': i > 0 }">
                <input :value="j.name" class="field flex-1 basis-40 !h-11 font-medium" :aria-label="'Name of ' + j.name" @change="rename(j, $event)" />
                <code class="num display text-lg font-bold tracking-[0.2em] px-3 py-1.5 rounded-lg bg-accent-soft text-accent-ink">{{ j.code }}</code>
                <button class="btn !min-h-11" @click="newCode(j)"><Icon name="refresh" :size="16" />New code</button>
                <button class="icon-btn" :aria-label="'Remove ' + j.name" @click="remove(j)"><Icon name="x" :size="16" /></button>
              </li>
              <li v-if="!data.judges.length" class="px-4 py-3 text-sm text-muted">No judges yet.</li>
            </ul>
            <form class="flex gap-2" @submit.prevent="add">
              <input v-model="name" class="field flex-1" placeholder="Judge name" aria-label="New judge name" />
              <button class="btn btn-primary shrink-0"><Icon name="plus" />Add judge</button>
            </form>
          </section>

          <p class="text-sm text-muted p-4 rounded-xl bg-ground">
            If a phone drops off the Wi-Fi, its scores stay saved on the phone and are sent here automatically when it reconnects.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
