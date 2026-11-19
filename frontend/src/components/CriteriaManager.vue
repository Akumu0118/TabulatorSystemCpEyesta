<script setup lang="ts">
import { computed, ref } from 'vue'
import { addCriterion, removeCriterion, updateCriterion, ui } from '../store'
import type { Criterion, TabEvent } from '../types'
import Icon from './Icon.vue'

const props = defineProps<{ event: TabEvent }>()
const COLORS = ['#1F4FD8', '#5B7FE6', '#A3B8F2', '#0F7A4D', '#8A5200', '#9A4300']
const color = (i: number) => COLORS[i % COLORS.length]

const open = ref(false)
const busy = ref(false)
const name = ref('')
const weight = ref<number | ''>('')
const maxScore = ref<number | ''>(100)
const err = ref<{ field: 'name' | 'weight' | 'max' | ''; text: string }>({ field: '', text: '' })
const total = computed(() => props.event.criteria.reduce((s, c) => s + c.weight, 0))
const left = computed(() => 100 - total.value)

const show = () => {
  name.value = ''
  weight.value = left.value > 0 ? left.value : ''
  maxScore.value = 100
  err.value = { field: '', text: '' }
  open.value = true
}
const fail = (field: 'name' | 'weight' | 'max', text: string) => { err.value = { field, text } }

const save = async () => {
  const w = Math.round(Number(weight.value))
  const m = Math.round(Number(maxScore.value))
  if (!name.value.trim()) return fail('name', 'Enter a criteria name.')
  if (!(w >= 1)) return fail('weight', 'Weight must be at least 1%.')
  if (w > left.value) return fail('weight', `Only ${left.value}% is left. Lower this weight or reduce another criterion first.`)
  if (!(m >= 1 && m <= 999)) return fail('max', 'Highest score must be from 1 to 999.')
  busy.value = true
  const error = await addCriterion(props.event, name.value.trim(), w, m)
  busy.value = false
  if (error) fail('weight', error)
  else open.value = false
}

async function changeMax(c: Criterion, e: Event) {
  const input = e.target as HTMLInputElement
  const m = Math.round(Number(input.value))
  if (!(m >= 1 && m <= 999)) { input.value = String(c.max_score); return }
  if (m === c.max_score) return
  const error = await updateCriterion(c, { max_score: m })
  if (error) { ui.notice = error; input.value = String(c.max_score) }
}

const remove = (c: Criterion) => {
  if (confirm(`Remove "${c.name}"? Scores already given for it are deleted too.`)) removeCriterion(props.event, c.id)
}
</script>

<template>
  <section aria-labelledby="crit-title" class="card px-5 py-[18px] flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3">
      <h2 id="crit-title" class="display text-xl font-bold">Criteria</h2>
      <button class="btn !min-h-9 !px-3 !text-[13px] text-accent-ink" @click="show"><Icon name="plus" :size="16" />Add criteria</button>
    </div>

    <div
      role="img"
      :aria-label="'Weights: ' + event.criteria.map(c => `${c.name} ${c.weight} percent`).join(', ')"
      class="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-sunken"
    >
      <span v-for="(c, i) in event.criteria" :key="c.id" :style="{ width: c.weight + '%', background: color(i) }"></span>
    </div>

    <ul v-if="event.criteria.length" class="flex flex-col">
      <li class="flex items-center gap-3 pb-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase text-muted">
        <span class="flex-1 pl-[22px]">Name</span>
        <span class="w-[76px] text-center">Highest</span>
        <span class="w-12 text-right">Weight</span>
        <span class="w-11"></span>
      </li>
      <li v-for="(c, i) in event.criteria" :key="c.id" class="flex items-center gap-3 py-1.5 border-t border-line">
        <span class="w-2.5 h-2.5 rounded-[3px] shrink-0" :style="{ background: color(i) }"></span>
        <span class="flex-1 min-w-0 font-medium truncate">{{ c.name }}</span>
        <input
          class="field num !h-10 !w-[76px] !px-2 text-center font-semibold"
          type="number" min="1" max="999" step="1"
          :value="c.max_score"
          :aria-label="`Highest score for ${c.name}`"
          title="Highest score a judge may give"
          @change="changeMax(c, $event)"
        />
        <span class="num font-bold w-12 text-right">{{ c.weight }}%</span>
        <button class="icon-btn" :aria-label="'Remove ' + c.name" @click="remove(c)"><Icon name="x" :size="16" /></button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted">No criteria yet. Judges see an empty sheet until you add some.</p>

    <span class="text-[13px] font-semibold" :class="total === 100 ? 'text-ok' : 'text-warn'">
      {{ total === 100 ? '100% of weight assigned' : `${total}% assigned, ${left}% left to assign` }}
    </span>

    <Teleport to="body">
      <div v-if="open" class="scrim" @click.self="open = false">
        <form class="dialog max-w-[512px]" role="dialog" aria-modal="true" aria-labelledby="add-crit-title" @submit.prevent="save">
          <div class="flex items-start justify-between gap-3 px-6 pt-[22px]">
            <div class="flex flex-col gap-1">
              <h2 id="add-crit-title" class="display text-[22px] font-bold">Add criteria</h2>
              <span class="text-sm text-muted">{{ event.name }} · weights must add up to 100%</span>
            </div>
            <button type="button" class="icon-btn" aria-label="Close" @click="open = false"><Icon name="x" /></button>
          </div>

          <div class="flex flex-col gap-[18px] px-6 py-5">
            <label class="label">Name
              <input v-model="name" class="field font-normal" placeholder="e.g. Q&A" autofocus :aria-invalid="err.field === 'name'" />
            </label>
            <div class="grid grid-cols-2 gap-3.5">
              <label class="label">Weight
                <span class="relative block">
                  <input
                    v-model.number="weight" class="field num !pr-10 font-semibold" type="number" min="1" :max="left"
                    :aria-invalid="err.field === 'weight'" aria-describedby="crit-err"
                  />
                  <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted font-semibold">%</span>
                </span>
              </label>
              <label class="label">Highest score
                <input
                  v-model.number="maxScore" class="field num font-semibold" type="number" min="1" max="999"
                  :aria-invalid="err.field === 'max'" aria-describedby="max-hint"
                />
              </label>
            </div>
            <p v-if="err.text" id="crit-err" role="alert" class="-mt-2 flex items-center gap-2 text-sm text-danger">
              <Icon name="alert" :size="16" class="shrink-0" />{{ err.text }}
            </p>
            <p id="max-hint" class="-mt-2 text-[13px] text-muted">
              Judges type a score from 0 to this number. It's scaled to the weight when totals are worked out.
            </p>

            <div class="flex flex-col gap-2 p-3.5 rounded-xl bg-ground">
              <div class="flex justify-between text-[13px]">
                <span class="font-semibold">Weight used</span>
                <span class="num text-muted">{{ total }}% of 100%</span>
              </div>
              <div class="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-line" aria-hidden="true">
                <span v-for="(c, i) in event.criteria" :key="c.id" :style="{ width: c.weight + '%', background: color(i) }"></span>
              </div>
              <span v-if="event.criteria.length" class="num text-xs text-muted">
                {{ event.criteria.map(c => `${c.name} ${c.weight}%`).join(' · ') }}
              </span>
            </div>
          </div>

          <div class="flex justify-end gap-2.5 px-6 pt-4 pb-[22px] border-t border-line">
            <button type="button" class="btn" @click="open = false">Cancel</button>
            <button class="btn btn-primary" :disabled="busy">{{ busy ? 'Saving…' : 'Add criteria' }}</button>
          </div>
        </form>
      </div>
    </Teleport>
  </section>
</template>
