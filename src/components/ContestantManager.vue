<script setup>
import { ref, computed } from 'vue'
import { addCandidate, removeCandidate } from '../store'
import Icon from './Icon.vue'
const props = defineProps({ event: Object })
const name = ref(''), number = ref(null)
const next = computed(() => Math.max(0, ...props.event.candidates.map(c => c.number)) + 1)
const add = () => {
  if (!name.value.trim()) return
  addCandidate(props.event, number.value || next.value, name.value.trim()); name.value = ''; number.value = null
}
</script>
<template>
  <section class="card">
    <div class="card-head">
      <h3 class="display font-extrabold text-lg sm:text-xl">Entries</h3>
      <span class="text-xs sm:text-sm font-bold px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-pink-300 shrink-0">
        {{ event.candidates.length }} registered
      </span>
    </div>

    <form class="grid grid-cols-[72px_1fr] sm:grid-cols-[76px_1fr_auto] gap-2.5 p-4 sm:p-5 border-b" style="border-color:var(--line)" @submit.prevent="add">
      <input
        v-model.number="number"
        type="number"
        min="1"
        class="field num w-full text-center font-bold"
        :placeholder="'#' + next"
        aria-label="Entry number"
      />
      <input
        v-model="name"
        class="field w-full min-w-0"
        placeholder="Team or candidate name"
        aria-label="Team or candidate name"
      />
      <button class="btn btn-primary col-span-2 sm:col-span-1 w-full sm:w-auto" type="submit">
        <Icon name="plus" />Add
      </button>
    </form>

    <ul class="max-h-96 overflow-y-auto divide-y" style="border-color:var(--line)">
      <li
        v-for="c in [...event.candidates].sort((a, b) => a.number - b.number)"
        :key="c.id"
        class="grid grid-cols-[68px_1fr_40px] sm:grid-cols-[76px_1fr_40px] items-center gap-2.5 px-4 sm:px-5 py-3"
      >
        <input v-model.number="c.number" type="number" min="1" class="field num w-full text-center font-bold" aria-label="Entry number" />
        <input v-model="c.name" class="field w-full min-w-0 font-medium" aria-label="Team or candidate name" />
        <button class="icon-btn hover:text-pink-600" :aria-label="'Remove ' + c.name" @click="removeCandidate(event, c.id)">
          <Icon name="x" />
        </button>
      </li>
    </ul>
  </section>
</template>