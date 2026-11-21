/**
 * Everything a judge's score sheet needs, shared by the phone layout and the landscape
 * tablet layout so that rotating the tablet keeps the drafts, the current entry and the
 * category the judge was on.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { data, ui, currentEvent, submitScores } from './store'
import { entryLabel, fmt, groups, parseScore, scoreError, weighted } from './scoring'
import { ago, useNow } from './motion'
import type { HandoverPayload } from './handover'
import type { Candidate, Criterion, Id, ScoreRow } from './types'

export type SheetStatus = 'sent' | 'waiting' | 'draft' | 'empty'

export const STATUS_TEXT: Record<SheetStatus, string> = {
  sent: 'Sent to tabulator',
  waiting: 'Saved here, waiting for the tabulator',
  draft: 'Changed, not submitted yet',
  empty: 'Not scored yet'
}
export const STATUS_SHORT: Record<SheetStatus, string> = {
  sent: 'Sent', waiting: 'Waiting to send', draft: 'Not submitted', empty: 'To do'
}
export const STATUS_CLS: Record<SheetStatus, string> = {
  sent: 'text-ok font-semibold', waiting: 'text-warn font-semibold', draft: 'text-accent-ink font-semibold', empty: 'text-muted'
}

/** A key the in-app keypad (or a hardware keyboard) can send. */
export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'del'

export function useJudgeSheet() {
  const event = computed(() => currentEvent())
  const criteria = computed(() => event.value?.criteria ?? [])
  const judgeId = computed(() => ui.session?.id)
  const locked = computed(() => !!event.value?.locked)

  /* ---- categories: each one is its own list of entries ---- */
  const cats = computed(() => groups(event.value))
  /** True when the event splits entries into named categories (Female / Male). */
  const hasCats = computed(() => cats.value.some(g => g.name))
  const catIdx = ref(0)
  const group = computed(() => cats.value[Math.min(catIdx.value, Math.max(0, cats.value.length - 1))])
  /** Entries of the selected category (every entry when the event has no categories). */
  const candidates = computed<Candidate[]>(() => group.value?.candidates ?? [])
  const allCandidates = computed<Candidate[]>(() => cats.value.flatMap(g => g.candidates))
  const label = (c: Pick<Candidate, 'number' | 'category'>) => entryLabel(event.value, c)

  /* ---- drafts: typed but not yet submitted; kept on this device across reloads ---- */
  const DRAFT_KEY = `tab_draft_${ui.session?.id ?? 'x'}`
  const draft = ref<Record<string, number | ''>>(readDrafts())
  function readDrafts() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Record<string, number | ''> } catch { return {} }
  }
  watch(draft, d => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage full */ } }, { deep: true })

  const key = (cId: Id, kId: Id) => `${event.value?.id}:${cId}:${kId}`
  const saved = (cId: Id, kId: Id): number | '' =>
    (event.value && judgeId.value !== undefined ? data.scores[event.value.id]?.[cId]?.[judgeId.value]?.[kId] : undefined) ?? ''

  function getScore(cId: Id, kId: Id): number | '' {
    const k = key(cId, kId)
    return k in draft.value ? draft.value[k] : saved(cId, kId)
  }
  function setScore(cId: Id, kId: Id, raw: string) {
    const v = parseScore(raw)
    const k = key(cId, kId)
    if (v === saved(cId, kId)) delete draft.value[k]
    else draft.value[k] = v
  }
  const errorFor = (cId: Id, k: Criterion) => scoreError(k, getScore(cId, k.id))
  const filledCount = (cId: Id) => criteria.value.filter(k => getScore(cId, k.id) !== '' && !errorFor(cId, k)).length
  const rowReady = (cId: Id) => criteria.value.length > 0 && filledCount(cId) === criteria.value.length
  const rowDirty = (cId: Id) => criteria.value.some(k => key(cId, k.id) in draft.value)

  function rowTotalNum(cId: Id): number | null {
    if (!rowReady(cId)) return null
    return criteria.value.reduce((sum, k) => sum + weighted(k, Number(getScore(cId, k.id))), 0)
  }
  /** Points so far, counting only the criteria filled in correctly (for the live total ring). */
  function partialTotal(cId: Id): number {
    return criteria.value.reduce((sum, k) => {
      const v = getScore(cId, k.id)
      return v === '' || errorFor(cId, k) ? sum : sum + weighted(k, Number(v))
    }, 0)
  }
  const rowTotal = (cId: Id) => { const t = rowTotalNum(cId); return t === null ? '–' : fmt(t) }

  function status(cId: Id): SheetStatus {
    if (rowDirty(cId)) return 'draft'
    const ev = event.value
    if (ev && ui.pending.some(p => p.eventId === ev.id && p.candidateId === cId && p.judgeId === judgeId.value)) return 'waiting'
    if (ev && judgeId.value !== undefined && data.scores[ev.id]?.[cId]?.[judgeId.value]) return 'sent'
    return 'empty'
  }
  const countsFor = (list: Candidate[]) => {
    const c = { sent: 0, waiting: 0, draft: 0, empty: 0 }
    for (const x of list) c[status(x.id)]++
    return c
  }
  /** How many of these entries already left the device (sent, or saved and waiting to send). */
  const doneIn = (list: Candidate[]) => list.filter(c => { const st = status(c.id); return st === 'sent' || st === 'waiting' }).length
  /** Sheet progress over every entry in the event. */
  const counts = computed(() => countsFor(allCandidates.value))
  /** Sheet progress in the selected category. */
  const catCounts = computed(() => countsFor(candidates.value))

  /** Sheets that are complete and changed since the last submit (in every category). */
  const readyToSend = computed(() => allCandidates.value.filter(c => rowDirty(c.id) && rowReady(c.id)))
  const complete = computed(() => allCandidates.value.filter(c => rowReady(c.id)).length)
  const waitingCount = computed(() => ui.pending.filter(p => p.judgeId === judgeId.value).length)

  function submitRows(list: Candidate[]) {
    const ev = event.value
    if (!ev || ev.locked || !list.length) return
    const rows: ScoreRow[] = list.map(c => ({
      candidateId: c.id,
      scores: Object.fromEntries(criteria.value.map(k => [k.id, Number(getScore(c.id, k.id))]))
    }))
    submitScores(ev.id, rows)
    for (const { candidateId } of rows) for (const k of criteria.value) delete draft.value[key(candidateId, k.id)]
  }
  const submitReady = () => submitRows(readyToSend.value)

  /* ---- sync status ---- */
  const now = useNow()
  const syncState = computed(() => ui.syncing ? 'syncing' : ui.online ? 'ok' : 'off')
  const syncText = computed(() => {
    if (ui.syncing) return 'Syncing…'
    if (ui.online) return ui.lastSync ? `Synced · ${ago(now.value - ui.lastSync)}` : 'Connected'
    return waitingCount.value ? `Offline · ${waitingCount.value} waiting` : 'Offline'
  })
  const retryIn = computed(() => ui.nextRetry ? Math.max(0, Math.ceil((ui.nextRetry - now.value) / 1000)) : null)
  const lastSyncText = computed(() => ui.lastSync ? ago(now.value - ui.lastSync) : 'not yet')

  /** Every sheet this device has for the event; unsent ones carry their capture time, sent ones lose to the server's copy. */
  const handoverPayload = computed<HandoverPayload | null>(() => {
    const ev = event.value
    const jId = judgeId.value
    if (!ev || jId === undefined) return null
    const sheets: HandoverPayload['sheets'] = []
    for (const c of allCandidates.value) {
      const p = ui.pending.find(x => x.eventId === ev.id && x.candidateId === c.id && x.judgeId === jId)
      const s = p?.scores ?? data.scores[ev.id]?.[c.id]?.[jId]
      if (s) sheets.push({ candidateId: c.id, capturedAt: p?.capturedAt ?? 1, scores: { ...s } })
    }
    return { judgeId: jId, eventId: ev.id, sheets }
  })

  /* ---- keep the device usable: no accidental reload, no screen sleep ---- */
  const hasUnsaved = () => waitingCount.value > 0 || Object.keys(draft.value).length > 0
  function guard(e: BeforeUnloadEvent) {
    if (!hasUnsaved()) return
    e.preventDefault()
    e.returnValue = ''
  }
  type WakeLock = { release: () => Promise<void> }
  let wake: WakeLock | null = null
  async function keepAwake() {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } }
    if (document.visibilityState !== 'visible' || !nav.wakeLock) return
    try { wake = await nav.wakeLock.request('screen') } catch { /* not allowed (plain http or low battery) */ }
  }
  const prevOverscroll = document.documentElement.style.overscrollBehaviorY
  onMounted(() => {
    window.addEventListener('beforeunload', guard)
    document.addEventListener('visibilitychange', keepAwake)
    document.documentElement.style.overscrollBehaviorY = 'none' // no pull-to-refresh
    void keepAwake()
  })
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', guard)
    document.removeEventListener('visibilitychange', keepAwake)
    document.documentElement.style.overscrollBehaviorY = prevOverscroll
    void wake?.release().catch(() => {})
  })

  /* ---- one-by-one navigation; each category remembers its own position ---- */
  const idx = ref(0)
  const dir = ref(1)
  const posByCat = reactive<Record<number, number>>({})
  const firstUnfinished = (list: Candidate[]) => Math.max(0, list.findIndex(c => !rowReady(c.id)))
  watch(idx, (n, o) => { dir.value = n >= o ? 1 : -1 })
  function pickCat(i: number) {
    if (i === catIdx.value || i < 0 || i >= cats.value.length) return
    posByCat[catIdx.value] = idx.value
    catIdx.value = i
    idx.value = posByCat[i] ?? firstUnfinished(cats.value[i].candidates)
  }
  watch(candidates, list => {
    if (idx.value >= list.length) idx.value = Math.max(0, list.length - 1)
  }, { immediate: true })
  watch(() => event.value?.id, () => {
    // Start in the first category, on the first entry that still needs scores.
    for (const k of Object.keys(posByCat)) delete posByCat[Number(k)]
    const c = cats.value.findIndex(g => g.candidates.some(x => !rowReady(x.id)))
    catIdx.value = c === -1 ? 0 : c
    idx.value = firstUnfinished(candidates.value)
  }, { immediate: true })
  const cur = computed<Candidate | undefined>(() => candidates.value[idx.value])
  const atLastEntry = computed(() => idx.value >= candidates.value.length - 1)
  const nextCat = computed(() => (catIdx.value < cats.value.length - 1 ? cats.value[catIdx.value + 1] : undefined))

  /** Next entry, or the first unfinished entry of the next category after the last one. */
  function advance() {
    if (!atLastEntry.value) idx.value++
    else if (nextCat.value) pickCat(catIdx.value + 1)
  }

  /* ---- keypad entry: one target box at a time, so the system keyboard never covers the sheet ---- */
  const target = ref<{ cId: Id; kId: Id } | null>(null)
  /** What the judge has typed into the target box, kept as text so "8." survives until the next digit. */
  const typed = ref('')
  function focusCell(cId: Id, kId: Id) {
    target.value = { cId, kId }
    const v = getScore(cId, kId)
    typed.value = v === '' ? '' : String(v)
  }
  const isTarget = (cId: Id, kId: Id) => target.value?.cId === cId && target.value?.kId === kId
  /** The text to show in a box: what is being typed for the target, otherwise the stored value. */
  const shown = (cId: Id, kId: Id): string => {
    if (isTarget(cId, kId)) return typed.value
    const v = getScore(cId, kId)
    return v === '' ? '' : String(v)
  }
  function press(k: PadKey) {
    const t = target.value
    if (!t || locked.value) return
    let s = typed.value
    if (k === 'del') s = s.slice(0, -1)
    else if (k === '.') { if (s.includes('.')) return; s = s === '' ? '0.' : `${s}.` }
    else if (s.replace('.', '').length >= 5) return
    else s = s === '0' ? k : s + k
    typed.value = s
    setScore(t.cId, t.kId, s)
  }
  /** In one-by-one: whenever the entry changes, aim the keypad at its first empty criterion. */
  watch(cur, c => {
    if (!c || !criteria.value.length) return
    if (target.value?.cId === c.id) return
    const k = criteria.value.find(x => getScore(c.id, x.id) === '') ?? criteria.value[0]
    focusCell(c.id, k.id)
  }, { immediate: true })
  const fieldIndex = computed(() => criteria.value.findIndex(k => k.id === target.value?.kId))
  /** Moves the keypad through the grid (criteria across, entries down). */
  function moveCell(delta: number) {
    const list = candidates.value
    const n = criteria.value.length
    if (!target.value || !n) return
    const r = list.findIndex(c => c.id === target.value!.cId)
    const pos = Math.max(0, r) * n + Math.max(0, fieldIndex.value) + delta
    if (pos < 0 || pos >= list.length * n) return
    focusCell(list[Math.floor(pos / n)].id, criteria.value[pos % n].id)
  }

  /** The tablet's big button: next criterion, then submit this sheet and move on. */
  const primary = computed(() => {
    const c = cur.value
    const k = criteria.value
    if (!c || !k.length) return { text: '', disabled: true, run: () => {} }
    const t = target.value
    const bad = t ? !!errorFor(t.cId, k.find(x => x.id === t.kId) ?? k[0]) : false
    const lastField = fieldIndex.value >= k.length - 1
    const onward = atLastEntry.value ? (nextCat.value ? `go to ${nextCat.value.name}` : '') : 'next entry'
    if (!lastField) {
      const nxt = k[fieldIndex.value + 1]
      return { text: `Next: ${nxt.name}`, disabled: bad, run: () => focusCell(c.id, nxt.id) }
    }
    if (rowDirty(c.id)) {
      const ready = rowReady(c.id)
      return {
        text: ready ? (onward ? `Submit & ${onward}` : 'Submit sheet') : `Fill all ${k.length} criteria`,
        disabled: bad || !ready || locked.value,
        run: () => { submitRows([c]); advance() }
      }
    }
    return { text: onward ? `Next: ${onward}` : 'All entries done', disabled: !onward, run: advance }
  })

  return {
    event, criteria, judgeId, locked,
    cats, hasCats, catIdx, group, candidates, allCandidates, label, pickCat, nextCat,
    draft, getScore, setScore, errorFor, filledCount, rowReady, rowDirty, rowTotalNum, partialTotal, rowTotal, status,
    doneIn, counts, catCounts, readyToSend, complete, waitingCount, submitRows, submitReady,
    now, syncState, syncText, retryIn, lastSyncText, handoverPayload,
    idx, dir, cur, atLastEntry, advance,
    target, typed, focusCell, isTarget, shown, press, fieldIndex, moveCell, primary
  }
}

export type JudgeSheet = ReturnType<typeof useJudgeSheet>
