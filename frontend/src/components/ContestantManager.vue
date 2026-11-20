<script setup lang="ts">
import { computed, ref } from 'vue'
import { addCandidate, removeCandidate, updateCandidate } from '../store'
import { askConfirm } from '../confirm'
import type { Candidate, TabEvent } from '../types'
import Icon from './Icon.vue'

const props = defineProps<{ event: TabEvent }>()
const name = ref('')
const number = ref<number | ''>('')
const next = computed(() => Math.max(0, ...props.event.candidates.map(c => c.number)) + 1)
const sorted = computed(() => [...props.event.candidates].sort((a, b) => a.number - b.number))

const add = async () => {
  if (!name.value.trim()) return
  if (await addCandidate(props.event, Number(number.value) || next.value, name.value.trim())) return
  name.value = ''
  number.value = ''
}
const valueOf = (e: Event) => (e.target as HTMLInputElement).value
const rename = (c: Candidate, e: Event) => {
  const v = valueOf(e).trim()
  if (v && v !== c.name) updateCandidate(c, { name: v })
}
const renumber = (c: Candidate, e: Event) => {
  const v = Math.round(Number(valueOf(e)))
  if (v >= 1 && v !== c.number) updateCandidate(c, { number: v })
}
const remove = async (c: Candidate) => {
  if (await askConfirm({ title: `Remove #${c.number} ${c.name}?`, message: 'Their scores are deleted too.', confirmLabel: 'Remove', danger: true })) {
    removeCandidate(props.event, c.id)
  }
}
</script>

<template>
  <section aria-labelledby="ent-title" class="card px-5 py-[18px] flex flex-col gap-3.5">
    <div class="flex items-center justify-between gap-3">
      <h2 id="ent-title" class="display text-xl font-bold">Entries</h2>
      <span class="num text-[13px] text-muted">{{ event.candidates.length }} registered</span>
    </div>

    <form class="grid grid-cols-[72px_minmax(0,1fr)_auto] gap-2" @submit.prevent="add">
      <label class="flex flex-col gap-1 text-xs text-muted">No.
        <input v-model.number="number" class="field num !h-11 !px-2.5 !bg-ground" type="number" min="1" :placeholder="String(next)" />
      </label>
      <label class="flex flex-col gap-1 text-xs text-muted">Team or candidate name
        <input v-model="name" class="field !h-11 !bg-ground" :placeholder="`Candidate ${next}`" />
      </label>
      <button class="btn btn-primary self-end">Add</button>
    </form>

    <ul class="flex flex-col">
      <li v-for="c in sorted" :key="c.id" class="flex items-center gap-2 py-1.5 border-t border-line">
        <input
          class="num w-11 h-9 rounded-lg bg-accent-soft text-accent-ink text-center font-bold text-[13px] border-0 shrink-0"
          type="number" min="1" :value="c.number" :aria-label="`Number of ${c.name}`"
          @change="renumber(c, $event)"
        />
        <input
          class="flex-1 min-w-0 h-11 px-2 rounded-lg bg-transparent font-medium border border-transparent hover:border-line focus:border-line-strong"
          :value="c.name" :aria-label="`Name of entry ${c.number}`"
          @change="rename(c, $event)"
        />
        <button class="icon-btn" :aria-label="'Remove ' + c.name" @click="remove(c)"><Icon name="x" :size="16" /></button>
      </li>
      <li v-if="!sorted.length" class="py-3 text-sm text-muted border-t border-line">No entries yet.</li>
    </ul>
  </section>
</template>
