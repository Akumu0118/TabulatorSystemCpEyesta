import { reactive } from 'vue'
import { api, ApiError, setTokenProvider } from './api'
import { rankings } from './scoring'
import { askConfirm } from './confirm'
import type {
  AppState, Candidate, Category, Criterion, Id, ImportItem, Judge, PendingScore, Role, ScoreMap, ScoreRow, Session, TabEvent, Theme
} from './types'

/* ---- local persistence (offline cache for judges) ---- */
const KEYS = {
  data: 'tab_data', session: 'tab_session', pending: 'tab_pending', theme: 'tab_theme', lastSync: 'tab_last_sync'
} as const

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null } catch { return null }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or blocked */ }
}

const prefersDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

export const data = reactive<AppState>(read<AppState>(KEYS.data) ?? { events: [], judges: [], scores: {} })

export const ui = reactive({
  session: read<Session>(KEYS.session),
  activeEvent: null as Id | null,
  navOpen: false,
  pending: (read<PendingScore[]>(KEYS.pending) ?? []).map(p => ({ ...p, capturedAt: p.capturedAt ?? Date.now() })),
  online: false,
  /** A request is in flight because of "Sync now" or the retry loop. */
  syncing: false,
  lastSync: read<number>(KEYS.lastSync),
  /** When the next automatic retry happens (ms epoch), while offline. */
  nextRetry: null as number | null,
  /** server clock minus this device's clock, so "seen 8 s ago" does not trust a wrong phone clock */
  serverOffset: 0,
  /** The judge's code was changed by the admin: their data stays here until they enter the new code. */
  needsCode: false,
  theme: (localStorage.getItem(KEYS.theme) as Theme | null) ?? (prefersDark() ? 'dark' : 'light'),
  /** Short message shown as a toast (errors, rejected sheets). */
  notice: ''
})

setTokenProvider(() => ui.session?.token)

export const isAdmin = () => ui.session?.role === 'admin'
export const currentEvent = (): TabEvent | undefined =>
  data.events.find(e => e.id === ui.activeEvent) ?? data.events[0]
export const rankingsFor = (event: TabEvent | undefined) => rankings(event, data.judges, data.scores)
export const myPending = () => ui.pending.filter(p => p.judgeId === ui.session?.id)

export function setTheme(theme: Theme) {
  ui.theme = theme
  localStorage.setItem(KEYS.theme, theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme
}

/* ---- network helpers ---- */
function track(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong.'
  ui.online = err.status !== 0
  if (err.status === 401 && ui.session) {
    // A judge whose code changed keeps everything on the phone; only the code is asked again.
    if (ui.session.role === 'judge') ui.needsCode = true
    else clearSession()
  }
  return err.message
}

function markSynced() {
  ui.online = true
  ui.lastSync = Date.now()
  write(KEYS.lastSync, ui.lastSync)
}

/** Runs an admin action; on failure shows the error and re-syncs so the UI reflects the server. */
async function act(fn: () => Promise<unknown>, { inline = false } = {}): Promise<string | null> {
  try {
    await fn()
    ui.online = true
    return null
  } catch (err) {
    const msg = track(err)
    if (!inline) ui.notice = msg
    void pull()
    return msg
  }
}

const sheetKey = (p: Pick<PendingScore, 'eventId' | 'candidateId' | 'judgeId'>) =>
  `${p.eventId}|${p.candidateId}|${p.judgeId}`

function overlayPending(scores: ScoreMap): ScoreMap {
  for (const p of ui.pending) ((scores[p.eventId] ??= {})[p.candidateId] ??= {})[p.judgeId] = { ...p.scores }
  return scores
}

export async function pull(): Promise<boolean> {
  if (!ui.session || ui.needsCode) return false
  try {
    const s = await api.state()
    data.events = s.events
    data.judges = s.judges
    data.scores = overlayPending(s.scores)
    if (s.serverTime) ui.serverOffset = Date.parse(s.serverTime) - Date.now()
    if (ui.activeEvent !== null && !data.events.some(e => e.id === ui.activeEvent)) ui.activeEvent = null
    markSynced()
    if (!isAdmin()) write(KEYS.data, data)
    return true
  } catch (err) {
    track(err)
    return false
  }
}

/* ---- judges: save locally first, then send when the host is reachable ---- */
function savePending() { write(KEYS.pending, ui.pending) }

/** Sends this judge's queued sheets. Returns false when the host could not be reached. */
export async function flush(): Promise<boolean> {
  if (ui.needsCode) return false
  const judgeId = ui.session?.role === 'judge' ? ui.session.id : null
  // Only send this judge's sheets; another judge's queued sheets wait for their own login.
  const sent = ui.pending.filter(p => p.judgeId === judgeId)
  if (!sent.length) return true
  try {
    const res = await api.submitScores(
      sent.map(({ eventId, candidateId, scores, capturedAt }) => ({ eventId, candidateId, scores, capturedAt }))
    )
    // Drop what was sent, unless the judge changed it again while the request was in flight.
    ui.pending = ui.pending.filter(p => !sent.includes(p))
    savePending()
    markSynced()
    if (res.rejected.length) {
      ui.notice = `${res.rejected.length} sheet(s) were not accepted: ${res.rejected[0].reason}`
      void pull()
    }
    return true
  } catch (err) {
    track(err)
    return !(err instanceof ApiError && err.status === 0)
  }
}

export function submitScores(eventId: Id, rows: ScoreRow[]) {
  if (ui.session?.role !== 'judge') return
  const judgeId = ui.session.id
  const capturedAt = Date.now()
  for (const { candidateId, scores } of rows) {
    ((data.scores[eventId] ??= {})[candidateId] ??= {})[judgeId] = { ...scores }
    const key = sheetKey({ eventId, candidateId, judgeId })
    ui.pending = ui.pending.filter(p => sheetKey(p) !== key)
    ui.pending.push({ eventId, candidateId, judgeId, scores: { ...scores }, capturedAt })
  }
  savePending()
  write(KEYS.data, data)
  void syncNow()
}

/* ---- sync loop: steady every 4 s while online, backing off to 30 s while offline ---- */
let timer: ReturnType<typeof setTimeout> | undefined
let failures = 0
let running: Promise<boolean> | null = null

async function tick(): Promise<boolean> {
  if (!ui.session) return true // nothing to sync; keep the steady pace
  if (ui.needsCode) return false
  ui.syncing = true
  try {
    const sent = isAdmin() ? true : await flush()
    const pulled = await pull()
    return sent && pulled
  } finally {
    ui.syncing = false
  }
}

function schedule(ok: boolean) {
  clearTimeout(timer)
  failures = ok ? 0 : failures + 1
  const delay = ok ? 4000 : Math.min(30000, 2000 * 2 ** (failures - 1)) + Math.random() * 1000
  ui.nextRetry = ok ? null : Date.now() + delay
  timer = setTimeout(() => void syncNow(), delay)
}

/** Try to reach the tabulator right away (button, reconnect, app back in view). */
export function syncNow(): Promise<boolean> {
  if (running) return running
  running = tick().then(ok => { schedule(ok); return ok }).finally(() => { running = null })
  return running
}

/* ---- auth ---- */
export async function login(role: Role, secret: string): Promise<string | null> {
  try {
    ui.session = await api.login(role, secret)
  } catch (err) {
    return track(err)
  }
  write(KEYS.session, ui.session)
  ui.needsCode = false
  ui.activeEvent = null
  await syncNow()
  return null
}

/** The judge enters the new code their organizer gave them; nothing stored on the phone is lost. */
export async function reenterCode(code: string): Promise<string | null> {
  const before = ui.session
  try {
    const next = await api.login('judge', code)
    if (before && next.id !== before.id) {
      return `That code belongs to ${next.name}. Ask the organizer for ${before.name}'s new code.`
    }
    ui.session = next
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return err.message
    return track(err)
  }
  write(KEYS.session, ui.session)
  ui.needsCode = false
  await syncNow()
  return null
}

function clearSession() {
  ui.session = null
  ui.needsCode = false
  ui.activeEvent = null
  localStorage.removeItem(KEYS.session)
  localStorage.removeItem(KEYS.data)
  Object.assign(data, { events: [], judges: [], scores: {} })
}

export async function logout() {
  const mine = myPending().length
  if (mine && ui.session?.role === 'judge' && !(await askConfirm({
    title: 'Log out anyway?',
    message: `${mine} score sheet${mine === 1 ? ' has' : 's have'} not reached the tabulator yet. They stay on this phone and are sent the next time you log in.`,
    confirmLabel: 'Log out'
  }))) return
  clearSession()
}

/* ---- admin actions ---- */
export const addEvent = (name: string) => act(async () => {
  const ev = await api.createEvent(name)
  data.events.push(ev)
  ui.activeEvent = ev.id
})
export const updateEvent = (ev: TabEvent, patch: Partial<Pick<TabEvent, 'name' | 'locked'>>) =>
  act(async () => { Object.assign(ev, await api.updateEvent(ev.id, patch)) })
export const removeEvent = (id: Id) => act(async () => {
  await api.deleteEvent(id)
  data.events = data.events.filter(e => e.id !== id)
  delete data.scores[id]
  ui.activeEvent = null
})

export const addCriterion = (ev: TabEvent, name: string, weight: number, maxScore: number) =>
  act(async () => { ev.criteria.push(await api.createCriterion(ev.id, name, weight, maxScore)) }, { inline: true })
export const updateCriterion = (c: Criterion, patch: Partial<Pick<Criterion, 'name' | 'weight' | 'max_score'>>) =>
  act(async () => { Object.assign(c, await api.updateCriterion(c.id, patch)) }, { inline: true })
export const removeCriterion = (ev: TabEvent, id: Id) => act(async () => {
  await api.deleteCriterion(id)
  ev.criteria = ev.criteria.filter(c => c.id !== id)
})

export const addCandidate = (ev: TabEvent, number: number, name: string, category: Id | null = null) =>
  act(async () => { ev.candidates.push(await api.createCandidate(ev.id, number, name, category)) })
export const updateCandidate = (c: Candidate, patch: Partial<Omit<Candidate, 'id'>>) =>
  act(async () => { Object.assign(c, await api.updateCandidate(c.id, patch)) })
export const removeCandidate = (ev: TabEvent, id: Id) => act(async () => {
  await api.deleteCandidate(id)
  ev.candidates = ev.candidates.filter(c => c.id !== id)
})

export const addCategory = (ev: TabEvent, name: string) => act(async () => {
  const order = Math.max(-1, ...(ev.categories ?? []).map(c => c.order)) + 1
  ;(ev.categories ??= []).push(await api.createCategory(ev.id, name, order))
}, { inline: true })
export const renameCategory = (c: Category, name: string) =>
  act(async () => { Object.assign(c, await api.updateCategory(c.id, { name })) }, { inline: true })
/** Removes the category; its entries stay in the event without a category. */
export const removeCategory = (ev: TabEvent, id: Id) => act(async () => {
  await api.deleteCategory(id)
  ev.categories = ev.categories.filter(c => c.id !== id)
  for (const c of ev.candidates) if (c.category === id) c.category = null
})

export const addJudge = (name: string) => act(async () => { data.judges.push(await api.createJudge(name)) })
export const updateJudge = (j: Judge, name: string) =>
  act(async () => { Object.assign(j, await api.updateJudge(j.id, { name })) })
export const removeJudge = (id: Id) => act(async () => {
  await api.deleteJudge(id)
  data.judges = data.judges.filter(j => j.id !== id)
})
export const regenCode = (j: Judge) => act(async () => { Object.assign(j, await api.regenerateJudgeCode(j.id)) })

/** Brings in sheets from a judge's phone (QR) or typed by the organizer. Throws an Error with a readable message. */
export async function importSheets(judgeId: Id, source: 'qr' | 'manual', items: ImportItem[]) {
  try {
    const res = await api.importScores(judgeId, source, items)
    await pull()
    return res
  } catch (err) {
    throw new Error(track(err))
  }
}

/** Finalizes results. Returns the missing sheets when blocked (and not forced), or null on success. */
export async function finalizeEvent(ev: TabEvent, force = false) {
  try {
    const res = await api.finalize(ev.id, force)
    ev.finalized_at = res.finalized_at
    return null
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return (err.body as { missing: { judgeId: Id; candidateId: Id }[] }).missing
    }
    throw new Error(track(err))
  }
}
export const unfinalizeEvent = (ev: TabEvent) =>
  act(async () => { Object.assign(ev, await api.unfinalize(ev.id)) })

/* ---- lifecycle ---- */
let started = false
export function start() {
  setTheme(ui.theme)
  if (started) return
  started = true
  // Ask the browser not to evict this site's storage (scores waiting on the phone live there).
  void navigator.storage?.persist?.().catch(() => false)
  void syncNow()
  addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
}
