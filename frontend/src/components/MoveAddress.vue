<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { moveTo } from '../move'

/** The hotspot gave the laptop a new IP: move this tablet (and its unsent sheets) there. */
const emit = defineEmits<{ close: [] }>()
const here = location.host
const address = ref(location.hostname)
const busy = ref(false)
const error = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(async () => { await nextTick(); input.value?.select() })

async function go() {
  busy.value = true
  error.value = ''
  error.value = (await moveTo(address.value)) ?? ''
  busy.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
}
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click.self="emit('close')" @keydown.capture="onKey">
      <form
        class="dialog max-w-[460px] p-6 flex flex-col gap-4" role="dialog" aria-modal="true" aria-labelledby="move-title"
        @submit.prevent="go"
      >
        <h2 id="move-title" class="display text-xl font-bold">Laptop has a new address?</h2>
        <p class="text-sm text-muted leading-relaxed">
          If the hotspot was restarted, the laptop may have a new address. Type the one shown on the laptop
          (<b>Judge access</b>, or the window that started the tabulator). Your unsent sheets, drafts and login come along.
        </p>
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-semibold">Laptop address</span>
          <input
            ref="input" v-model="address" class="field num text-lg" inputmode="url" autocomplete="off" autocapitalize="off"
            spellcheck="false" placeholder="192.168.43.25" aria-describedby="move-now" :aria-invalid="!!error"
          />
          <span id="move-now" class="text-xs text-muted">This tablet uses <span class="num">{{ here }}</span> now.</span>
        </label>
        <p v-if="error" role="alert" class="text-sm font-semibold text-danger">{{ error }}</p>
        <p class="text-xs text-muted leading-relaxed">
          Afterwards keep using the page that opens. A home-screen icon added earlier still points to the old address, so add it again from the new page.
        </p>
        <div class="flex justify-end gap-2.5">
          <button type="button" class="btn" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="busy || !address.trim()">{{ busy ? 'Checking…' : 'Connect' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
