<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { addCandidate, addCategory, removeCandidate, removeCategory, renameCategory, updateCandidate } from '../../store'
import { askConfirm } from '../../confirm'
import { entryLabel, groups, type Group } from '../../scoring'
import type { Candidate, Category, TabEvent } from '../../types'
import Icon from '../Icon.vue'
import CriteriaManager from '../CriteriaManager.vue'

/**
 * Setup tab: criteria with their weights, then categories (e.g. Female / Male) and the
 * entries in each. Every category ranks on its own and numbers its entries from 1.
 */
const props = defineProps<{ event: TabEvent }>()
const ev = computed(() => props.event)
const gs = computed(() => groups(ev.value))
const hasCats = computed(() => ev.value.categories.length > 0)
const label = (c: Candidate) => entryLabel(ev.value, c)
const key = (g: Group) => String(g.id ?? 'none')

const catName = ref('')
const catErr = ref('')
async function addCat() {
  const n = catName.value.trim()
  if (!n) return
  const err = await addCategory(ev.value, n)
  catErr.value = err ?? ''
  if (!err) catName.value = ''
}
const renameCat = (c: Category, e: Event) => {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v && v !== c.name) renameCategory(c, v)
}
async function delCat(c: Category) {
  const n = ev.value.candidates.filter(x => x.category === c.id).length
  if (await askConfirm({
    title: `Delete the ${c.name} category?`,
    message: n ? `Its ${n} entr${n > 1 ? 'ies stay' : 'y stays'} with their scores, under "No category".` : 'It has no entries.',
    confirmLabel: 'Delete category', danger: true
  })) removeCategory(ev.value, c.id)
}

/** One add-entry form per category: name, and the next free number in that category. */
const draft = reactive<Record<string, { name: string; number: number | '' }>>({})
const form = (g: Group) => (draft[key(g)] ??= { name: '', number: '' })
const nextNo = (g: Group) => Math.max(0, ...g.candidates.map(c => c.number)) + 1
async function addEntry(g: Group) {
  const f = form(g)
  if (!f.name.trim()) return
  if (await addCandidate(ev.value, Number(f.number) || nextNo(g), f.name.trim(), g.id)) return
  f.name = ''
  f.number = ''
}

const val = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
const rename = (c: Candidate, e: Event) => {
  const v = val(e).trim()
  if (v && v !== c.name) updateCandidate(c, { name: v })
}
const renumber = (c: Candidate, e: Event) => {
  const v = Math.round(Number(val(e)))
  if (v >= 1 && v !== c.number) updateCandidate(c, { number: v })
}
const move = (c: Candidate, e: Event) => {
  const v = val(e)
  updateCandidate(c, { category: v ? Number(v) : null })
}
async function remove(c: Candidate) {
  if (await askConfirm({ title: `Remove ${label(c)} ${c.name}?`, message: 'Their scores are deleted too.', confirmLabel: 'Remove', danger: true })) {
    removeCandidate(ev.value, c.id)
  }
}
</script>

<template>
  <div class="grid xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 items-start">
    <CriteriaManager :event="ev" />

    <div class="flex flex-col gap-6">
      <section aria-labelledby="cat-title" class="card px-5 py-[18px] flex flex-col gap-3.5">
        <div class="flex flex-col gap-1">
          <h2 id="cat-title" class="display text-xl font-bold">Categories</h2>
          <span class="text-[13px] text-muted">
            Optional. Each category gets its own ranking and winner, e.g. <b>Female</b> and <b>Male</b>.
            Judges switch between them with one tap.
          </span>
        </div>
        <ul v-if="hasCats" class="flex flex-wrap gap-2.5">
          <li v-for="c in ev.categories" :key="c.id" class="flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-xl border border-line bg-ground">
            <span class="num text-xs font-bold w-8 h-8 rounded-lg grid place-items-center bg-accent-soft text-accent-ink shrink-0">
              {{ gs.find(g => g.id === c.id)?.prefix }}
            </span>
            <input :value="c.name" class="field !h-9 !w-36 font-semibold" :aria-label="`Name of category ${c.name}`" @change="renameCat(c, $event)" />
            <span class="num text-xs text-muted px-1">{{ ev.candidates.filter(x => x.category === c.id).length }}</span>
            <button class="icon-btn !w-9 !h-9" :aria-label="`Delete category ${c.name}`" @click="delCat(c)"><Icon name="trash" :size="15" /></button>
          </li>
        </ul>
        <form class="flex gap-2 max-w-[460px]" @submit.prevent="addCat">
          <input v-model="catName" class="field flex-1" placeholder="e.g. Female" aria-label="New category name" maxlength="60" />
          <button class="btn shrink-0"><Icon name="plus" />Add category</button>
        </form>
        <p v-if="catErr" role="alert" class="text-sm font-semibold text-danger">{{ catErr }}</p>
      </section>

      <section
        v-for="g in gs" :key="key(g)" :aria-label="hasCats ? `${g.name} entries` : 'Entries'"
        class="card px-5 py-[18px] flex flex-col gap-3.5"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="display text-xl font-bold">{{ hasCats ? `${g.name} entries` : 'Entries' }}</h2>
          <span class="num text-[13px] text-muted">{{ g.candidates.length }} registered</span>
        </div>
        <p v-if="g.id === null && hasCats" class="text-[13px] text-warn font-semibold">
          These entries are in no category, so they are ranked on their own. Move each one into a category.
        </p>
        <ul v-if="g.candidates.length" class="flex flex-col">
          <li
            v-for="(c, i) in g.candidates" :key="c.id"
            class="grid items-center gap-2.5 py-2"
            :class="[{ 'border-t border-line': i > 0 }, hasCats ? 'grid-cols-[44px_72px_minmax(0,1fr)_150px_40px]' : 'grid-cols-[44px_72px_minmax(0,1fr)_40px]']"
          >
            <span class="num text-sm font-bold w-11 h-9 rounded-[10px] grid place-items-center bg-sunken">{{ label(c) }}</span>
            <input :value="c.number" type="number" min="1" inputmode="numeric" class="field num !h-10" :aria-label="`Number of ${c.name}`" @change="renumber(c, $event)" />
            <input :value="c.name" class="field !h-10 font-medium" :aria-label="`Name of entry ${label(c)}`" @change="rename(c, $event)" />
            <select v-if="hasCats" class="field !h-10" :value="c.category ?? ''" :aria-label="`Category of ${c.name}`" @change="move(c, $event)">
              <option v-for="k in ev.categories" :key="k.id" :value="k.id">{{ k.name }}</option>
              <option value="">No category</option>
            </select>
            <button class="icon-btn" :aria-label="`Remove ${c.name}`" @click="remove(c)"><Icon name="x" :size="16" /></button>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">No entries yet.</p>
        <form v-if="g.id !== null || !hasCats" class="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-2" @submit.prevent="addEntry(g)">
          <input
            v-model="form(g).number" type="number" min="1" inputmode="numeric" class="field num"
            :placeholder="String(nextNo(g))" :aria-label="`Number for the new ${g.name || ''} entry`"
          />
          <input v-model="form(g).name" class="field" placeholder="Entry name" :aria-label="`Name for the new ${g.name || ''} entry`" />
          <button class="btn btn-primary shrink-0"><Icon name="plus" />Add</button>
        </form>
      </section>
    </div>
  </div>
</template>
