<script setup lang="ts">
import { ref } from 'vue'
import { myPending, reenterCode, ui } from '../store'
import Icon from './Icon.vue'

/** Shown when the organizer gave this judge a new code. Nothing on the phone is lost. */
const emit = defineEmits<{ handover: [] }>()
const code = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  if (!/^\d{4}$/.test(code.value)) { error.value = 'Enter the 4-digit code.'; return }
  busy.value = true
  error.value = (await reenterCode(code.value)) ?? ''
  busy.value = false
  if (error.value) code.value = ''
}
</script>

<template>
  <div class="fixed inset-0 z-[60] bg-ground overflow-y-auto">
    <div class="min-h-full max-w-[440px] mx-auto px-5 py-10 flex flex-col justify-center gap-5">
      <div class="flex flex-col items-center gap-3 text-center anim-fade-up">
        <span class="w-14 h-14 rounded-2xl bg-accent-soft text-accent-ink grid place-items-center anim-pop"><Icon name="lock" :size="26" /></span>
        <h1 class="display text-2xl font-bold">Your code was changed</h1>
        <p class="text-muted text-sm leading-normal">
          Ask the organizer for {{ ui.session?.name ? `${ui.session.name}'s` : 'your' }} new 4-digit code.
          <b class="text-ink">Your scores are still saved on this phone</b><template v-if="myPending().length">, including
          {{ myPending().length }} sheet{{ myPending().length === 1 ? '' : 's' }} not sent yet</template>.
        </p>
      </div>
      <form class="card p-5 flex flex-col gap-3 anim-fade-up" style="--i: 2" @submit.prevent="submit">
        <label for="new-code" class="text-sm font-semibold">New code</label>
        <input
          id="new-code" v-model="code" class="field num display !h-16 text-center !text-3xl font-bold tracking-[0.5em]"
          inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="\d{4}" placeholder="••••"
          :aria-invalid="!!error" aria-describedby="code-error"
        />
        <p id="code-error" role="alert" class="text-sm text-danger min-h-5">{{ error }}</p>
        <button class="btn btn-primary btn-lg" :disabled="busy">
          <span v-if="busy" class="w-4 h-4 rounded-full border-2 border-current border-t-transparent anim-spin"></span>
          Continue scoring
        </button>
      </form>
      <button class="btn anim-fade-up" style="--i: 4" @click="emit('handover')">
        Can't reach the tabulator? Hand over by QR
      </button>
    </div>
  </div>
</template>
