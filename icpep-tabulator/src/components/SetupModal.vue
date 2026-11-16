<script setup>
import { ref, onMounted } from 'vue'
import { data, addJudge, removeJudge, regenCode } from '../store'
import Icon from './Icon.vue'
defineEmits(['close'])
const urls = ref([location.origin]), name = ref(''), copied = ref('')
onMounted(async () => {
  try { const i = await (await fetch('/api/info')).json(); urls.value = i.ips.map(ip => `http://${ip}:${i.port}`) } catch {}
})
const copy = async t => { try { await navigator.clipboard.writeText(t); copied.value = t; setTimeout(() => copied.value = '', 1500) } catch {} }
const add = () => { if (name.value.trim()) addJudge(name.value.trim()); name.value = '' }
</script>
<template>
  <Teleport to="body">
    <div class="scrim items-start p-4" @click.self="$emit('close')">
      <div class="card w-full max-w-2xl my-8" role="dialog" aria-modal="true" aria-label="Judge access">
        <div class="card-head">
          <h3 class="display font-extrabold text-xl bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">Judge access</h3>
          <button class="icon-btn hover:text-pink-600" aria-label="Close" @click="$emit('close')"><Icon name="x" /></button>
        </div>

        <div class="p-6 space-y-6 text-base">
          <div>
            <p class="font-bold mb-1.5">1. Share the access point</p>
            <p class="muted text-sm mb-3">Run <code class="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-pink-300 font-semibold">node server.js</code> on this computer. Judges join the same Wi-Fi and open:</p>
            <div v-for="u in urls" :key="u" class="flex items-center gap-3 mb-2">
              <code class="field flex-1 num font-semibold bg-gradient-to-r from-blue-500/5 to-pink-500/5">{{ u }}</code>
              <button class="btn shrink-0 border border-blue-400/30 hover:bg-blue-500/10" @click="copy(u)">{{ copied === u ? 'Copied!' : 'Copy' }}</button>
            </div>
          </div>

          <div>
            <p class="font-bold mb-2">2. Give each judge a code</p>
            <ul class="card divide-y" style="border-color:var(--line)">
              <li v-for="j in data.judges" :key="j.id" class="row flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3.5">
                <input v-model="j.name" class="field flex-1 font-medium" :aria-label="'Name of ' + j.name" />
                <code class="num font-extrabold text-base px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600/15 to-pink-600/15 text-blue-700 dark:text-pink-300 tracking-wider">
                  {{ j.code }}
                </code>
                <button class="btn shrink-0 text-sm" @click="regenCode(j)">New code</button>
                <button class="icon-btn hover:text-pink-600" :aria-label="'Remove ' + j.name" @click="removeJudge(j.id)"><Icon name="x" /></button>
              </li>
            </ul>

            <form class="flex gap-3 mt-4" @submit.prevent="add">
              <input v-model="name" class="field flex-1" placeholder="Judge name" />
              <button class="btn btn-primary shrink-0"><Icon name="plus" />Add judge</button>
            </form>
          </div>

          <p class="text-sm muted p-4 rounded-xl bg-gradient-to-r from-blue-500/5 to-pink-500/5 border" style="border-color:var(--line)">
            If a judge loses signal, their scores stay on their device and are sent here when the connection returns.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>