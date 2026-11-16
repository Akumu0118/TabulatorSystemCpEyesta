<script setup>
import { ref, computed } from 'vue'
import { addCriterion, removeCriterion } from '../store'
import Icon from './Icon.vue'
const props = defineProps({ event: Object })
const open = ref(false), name = ref(''), weight = ref(null), err = ref('')
const total = computed(() => props.event.criteria.reduce((s, c) => s + c.weight, 0))
const left = computed(() => 100 - total.value)
const show = () => { name.value = ''; weight.value = left.value > 0 ? left.value : null; err.value = ''; open.value = true }
const save = () => {
  const w = Math.round(Number(weight.value))
  if (!name.value.trim()) return (err.value = 'Enter a criteria name.')
  if (!(w >= 1)) return (err.value = 'Weight must be at least 1%.')
  if (w > left.value) return (err.value = `Only ${left.value}% is left. Remove or lower another criteria first.`)
  addCriterion(props.event, name.value.trim(), w); open.value = false
}
</script>
<template>
  <section class="card">

    <div class="card-head">
      <div class="min-w-0">
        <h3 class="display font-extrabold text-lg sm:text-xl">Criteria for judging</h3>
        <p class="text-xs sm:text-sm num font-semibold mt-0.5" :style="total === 100 ? 'color:#10b981' : 'color:#ec4899'">
          {{ total }}% of 100% assigned
        </p>
      </div>
      <button class="btn btn-primary shrink-0" @click="show">
        <Icon name="plus" />Add criteria
      </button>
    </div>


    <ul class="divide-y" style="border-color:var(--line)">
      <li v-for="c in event.criteria" :key="c.id" class="row flex items-center gap-3 px-6 py-4">
        <span class="flex-1 text-base font-semibold">{{ c.name }}</span>
        <span class="num text-sm font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r from-blue-500/15 to-pink-500/15 text-blue-700 dark:text-pink-300">{{ c.weight }}%</span>
        <button class="icon-btn hover:text-pink-600" :aria-label="'Remove ' + c.name" @click="removeCriterion(event, c.id)"><Icon name="x" /></button>
      </li>
      <li v-if="!event.criteria.length" class="px-6 py-6 text-sm muted">No criteria yet. Judges will see an empty sheet until you add some.</li>
    </ul>
    <Teleport to="body">
      <div v-if="open" class="scrim" @click.self="open = false">
        <form class="card w-full max-w-lg p-6 space-y-5" role="dialog" aria-modal="true" aria-label="Add criteria" @submit.prevent="save">
          <h3 class="display font-extrabold text-xl bg-gradient-to-r from-blue-600 to-pink-600 bg-clip-text text-transparent">Add criteria</h3>
          <div><label class="label" for="cn">Criteria name</label><input id="cn" v-model="name" class="field w-full" placeholder="e.g. Costume" autofocus /></div>
          <div>
            <label class="label" for="cw">Weight (%)</label>
            <input id="cw" v-model.number="weight" class="field num w-full" type="number" min="1" :max="left" />
            <p class="text-xs muted mt-1.5">{{ left }}% still available for this event.</p>
          </div>
          <p v-if="err" class="text-sm font-medium text-pink-600" role="alert">{{ err }}</p>
          <div class="flex justify-end gap-3 pt-2"><button type="button" class="btn" @click="open = false">Cancel</button><button class="btn btn-primary">Add criteria</button></div>
        </form>
      </div>
    </Teleport>
  </section>
</template>