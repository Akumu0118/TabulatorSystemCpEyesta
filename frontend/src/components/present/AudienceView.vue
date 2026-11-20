<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useDeck } from './useDeck'
import PresentationStage from './PresentationStage.vue'

/** The projector window: only the stage. Follows the presenter window; keys and clickers work here too. */
const props = defineProps<{ eventId: number }>()
const { event, steps, index, blank, fullscreen } = useDeck(() => props.eventId, 'audience')

const idle = ref(false)
let t: ReturnType<typeof setTimeout> | undefined
function wake() {
  idle.value = false
  clearTimeout(t)
  t = setTimeout(() => { idle.value = true }, 2000)
}
onBeforeUnmount(() => clearTimeout(t))
</script>

<template>
  <div class="fixed inset-0 bg-black" :class="{ 'cursor-none': idle }" @mousemove="wake" @dblclick="fullscreen">
    <PresentationStage
      v-if="event && steps.length" :steps="steps" :index="index" :blank="blank"
      :rehearsal="!event.finalized_at" :event="event.name"
    />
    <div v-else class="h-full grid place-items-center text-white/60 text-lg">Loading results…</div>
    <p v-if="!idle" class="fixed bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/50 pointer-events-none">
      Double-click or press F for full screen · → next · ← back · B blank
    </p>
  </div>
</template>
