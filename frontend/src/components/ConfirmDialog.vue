<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { answerConfirm, confirmState } from '../confirm'

const confirmBtn = ref<HTMLButtonElement | null>(null)
const cancelBtn = ref<HTMLButtonElement | null>(null)
// Focus the safe choice for destructive questions, the action otherwise.
watch(() => confirmState.open, async open => {
  if (!open) return
  await nextTick()
  ;(confirmState.options.danger ? cancelBtn.value : confirmBtn.value)?.focus()
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); answerConfirm(false) }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="confirmState.open" class="scrim !z-[95]" @click.self="answerConfirm(false)"
      @keydown.capture.stop="onKey"
    >
      <div class="dialog max-w-[440px] p-6 flex flex-col gap-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <h2 id="confirm-title" class="display text-xl font-bold">{{ confirmState.options.title }}</h2>
        <p v-if="confirmState.options.message" id="confirm-msg" class="text-sm text-muted leading-relaxed">{{ confirmState.options.message }}</p>
        <div class="flex justify-end gap-2.5 pt-1">
          <button ref="cancelBtn" class="btn" @click="answerConfirm(false)">{{ confirmState.options.cancelLabel ?? 'Cancel' }}</button>
          <button
            ref="confirmBtn" class="btn"
            :class="confirmState.options.danger ? '!bg-danger !border-danger !text-white' : 'btn-primary'"
            @click="answerConfirm(true)"
          >{{ confirmState.options.confirmLabel ?? 'OK' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
