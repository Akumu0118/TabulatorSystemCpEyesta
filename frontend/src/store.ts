import { reactive } from 'vue'
import { api, ApiError, setTokenProvider } from './api'
import { rankings } from './scoring'
import type {
  AppState, Candidate, Criterion, Id, Judge, PendingScore, Role, ScoreMap, ScoreRow, Session, TabEvent, Theme
} from './types'

/* ---- local persistence (offline cache for judges) ---- */
const KEYS = { data: 'tab_data', session: 'tab_session', pending: 'tab_pending', theme: 'tab_theme' } as const

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
  pending: read<PendingScore[]>(KEYS.pending) ?? [],
  online: false,
  lastSync: null as number | null,
  theme: (localStorage.getItem(KEYS.theme) as Theme | null) ?? (prefersDark() ? 'dark' : 'light'),
  /** Short message shown as a toast (errors, rejected sheets). */
  notice: ''
})

setTokenProvider(() => ui.session?.token)

export const isAdmin = () => ui.session?.role === 'admin'
export const currentEvent = (): TabEvent | undefined =>
  data.events.find(e => e.id === ui.activeEvent) ?? data.events[0]
export const rankingsFor = (event: TabEvent | undefined) => rankings(event, data.judges, data.scores)

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
  if (err.status === 401 && ui.session) clearSession()
  return err.message
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
  if (!ui.session) return false
  try {
    const s = await api.state()
    data.events = s.events
    data.judges = s.judges
    data.scores = overlayPending(s.scores)
    if (ui.activeEvent !== null && !data.events.some(e => e.id === ui.activeEvent)) ui.activeEvent = null
    ui.online = true
    ui.lastSync = Date.now()
    if (!isAdmin()) write(KEYS.data, data)
    return true
  } catch (err) {
    track(err)
    return false
  }
}

/* ---- judges: save locally first, then send when the host is reachable ---- */
function savePending() { write(KEYS.pending, ui.pending) }

export async function flush() {
  const judgeId = ui.session?.role === 'judge' ? ui.session.id : null
  // Only send this judge's sheets; another judge's queued sheets wait for their own login.
  const sent = ui.pending.filter(p => p.judgeId === judgeId)
  if (!sent.length) return
  try {
    const res = await api.submitScores(sent.map(({ eventId, candidateId, scores }) => ({ eventId, candidateId, scores })))
    ui.online = true
    ui.pending = ui.pending.filter(p => !sent.includes(p))
    savePending()
    ui.lastSync = Date.now()
    if (res.rejected.length) {
      ui.notice = `${res.rejected.length} sheet(s) were not accepted: ${res.rejected[0].reason}`
      void pull()
    }
  } catch (err) {
    track(err)
  }
}

export function submitScores(eventId: Id, rows: ScoreRow[]) {
  if (ui.session?.role !== 'judge') return
  const judgeId = ui.session.id
  for (const { candidateId, scores } of rows) {
    ((data.scores[eventId] ??= {})[candidateId] ??= {})[judgeId] = { ...scores }
    const key = sheetKey({ eventId, candidateId, judgeId })
    ui.pending = ui.pending.filter(p => sheetKey(p) !== key)
    ui.pending.push({ eventId, candidateId, judgeId, scores: { ...scores } })
  }
  savePending()
  write(KEYS.data, data)
  void flush()
}

/* ---- auth ---- */
export async function login(role: Role, secret: string): Promise<string | null> {
  try {
    ui.session = await api.login(role, secret)
  } catch (err) {
    return track(err)
  }
  write(KEYS.session, ui.session)
  ui.activeEvent = null
  await pull()
  if (role === 'judge') void flush()
  return null
}

function clearSession() {
  ui.session = null
  ui.activeEvent = null
  localStorage.removeItem(KEYS.session)
  localStorage.removeItem(KEYS.data)
  Object.assign(data, { events: [], judges: [], scores: {} })
}

export function logout() {
  const mine = ui.pending.filter(p => p.judgeId === ui.session?.id).length
  if (mine && ui.session?.role === 'judge' &&
      !confirm(`${mine} score sheet(s) have not reached the admin yet. They stay on this device and are sent the next time you log in. Log out anyway?`)) return
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

export const addCandidate = (ev: TabEvent, number: number, name: string) =>
  act(async () => { ev.candidates.push(await api.createCandidate(ev.id, number, name)) })
export const updateCandidate = (c: Candidate, patch: Partial<Omit<Candidate, 'id'>>) =>
  act(async () => { Object.assign(c, await api.updateCandidate(c.id, patch)) })
export const removeCandidate = (ev: TabEvent, id: Id) => act(async () => {
  await api.deleteCandidate(id)
  ev.candidates = ev.candidates.filter(c => c.id !== id)
})

export const addJudge = (name: string) => act(async () => { data.judges.push(await api.createJudge(name)) })
export const updateJudge = (j: Judge, name: string) =>
  act(async () => { Object.assign(j, await api.updateJudge(j.id, { name })) })
export const removeJudge = (id: Id) => act(async () => {
  await api.deleteJudge(id)
  data.judges = data.judges.filter(j => j.id !== id)
})
export const regenCode = (j: Judge) => act(async () => { Object.assign(j, await api.regenerateJudgeCode(j.id)) })

/* ---- lifecycle ---- */
let started = false
export function start() {
  setTheme(ui.theme)
  if (started) return
  started = true
  void pull()
  const tick = async () => {
    if (!ui.session) return
    if (!isAdmin()) await flush()
    await pull()
  }
  setInterval(tick, 4000)
  addEventListener('online', tick)
}
