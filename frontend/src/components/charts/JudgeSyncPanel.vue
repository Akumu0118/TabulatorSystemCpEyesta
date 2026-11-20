<script setup lang="ts">
import { computed } from 'vue'
import { data, ui } from '../../store'
import { ago, useNow } from '../../motion'
import type { Id, TabEvent } from '../../types'
import Icon from '../Icon.vue'

/** Per judge: which sheets reached the tabulator, and when their phone was last heard from. */
const props = defineProps<{ event: TabEvent }>()
const emit = defineEmits<{ import: [judgeId: Id] }>()
const now = useNow(2000)

const entries = computed(() => [...props.event.candidates].sort((a, b) => a.number - b.number))
const judges = computed(() => data.judges.map(j => {
  const cells = entries.value.map(c => ({ c, sent: !!data.scores[props.event.id]?.[c.id]?.[j.id] }))
  const seen = j.last_seen_at ? Date.parse(j.last_seen_at) : null
  const age = seen === null ? null : now.value + ui.serverOffset - seen
  return { ...j, cells, sent: cells.filter(x => x.sent).length, age, live: age !== null && age < 30000 }
}))
</script>

<template>
  <section aria-labelledby="sync-panel-title" class="card p-5 flex flex-col gap-4">
    <div class="flex flex-col gap-1">
      <h2 id="sync-panel-title" class="display text-xl font-bold">Judges' tablets</h2>
      <span class="text-[13px] text-muted">Sheets received per entry · last contact</span>
    </div>
    <p v-if="!judges.length" class="py-6 text-center text-muted">No judges yet. Add them in Judge access.</p>
    <ul v-else class="flex flex-col gap-3.5">
      <li v-for="(j, i) in judges" :key="j.id" class="flex flex-col gap-2 anim-fade-up" :style="{ '--i': i }">
        <div class="flex items-center gap-2.5">
          <span class="dot !w-2 !h-2" :class="j.live ? 'ping text-ok' : j.age === null ? 'text-line-strong' : 'text-warn'"></span>
          <span class="font-semibold truncate flex-1 min-w-0">{{ j.name }}</span>
          <span class="num text-xs text-muted shrink-0">{{ j.age === null ? 'never connected' : j.live ? 'online' : `seen ${ago(j.age)}` }}</span>
          <span class="num text-[13px] font-semibold shrink-0" :class="j.sent === entries.length ? 'text-ok' : ''">{{ j.sent }}/{{ entries.length }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex-1 flex gap-[2px] h-2.5" role="img" :aria-label="`${j.name}: ${j.sent} of ${entries.length} sheets received`">
            <span
              v-for="x in j.cells" :key="x.c.id" :title="`#${x.c.number} ${x.sent ? 'received' : 'missing'}`"
              class="flex-1 first:rounded-l last:rounded-r transition-colors duration-500"
              :class="x.sent ? 'bg-ok' : 'bg-sunken border border-line'"
            ></span>
          </span>
          <button
            v-if="j.sent < entries.length" class="btn !min-h-8 !px-2.5 !text-xs shrink-0"
            :aria-label="`Import ${j.name}'s sheets`" @click="emit('import', j.id)"
          ><Icon name="plus" :size="14" />Import</button>
          <span v-else class="w-[74px] text-right text-ok shrink-0"><Icon name="check" :size="16" class="inline" /></span>
        </div>
      </li>
    </ul>
  </section>
</template>
