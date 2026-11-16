import { reactive } from 'vue'

const read = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v))
export const uid = p => p + Math.random().toString(36).slice(2, 8)
const code = () => String(Math.floor(1000 + Math.random() * 9000))
const mk = (id, name, crit, label) => ({
  id, name, locked: false,
  criteria: crit.map(([n, w], i) => ({ id: id + '_c' + i, name: n, weight: w })),
  candidates: [1, 2, 3, 4, 5].map(n => ({ id: id + '_t' + n, number: n, name: `${label} ${n}` }))
})
const seed = () => ({
  adminPass: 'admin',
  judges: [1, 2, 3].map(n => ({ id: 'j' + n, name: 'Judge ' + n, code: code() })),
  events: [
    mk('pageant', 'Pageant', [['Poise & Bearing', 40], ['Stage Presence', 30], ['Overall Impact', 30]], 'Candidate'),
    mk('bench', 'Bench Yell', [['Choreography', 40], ['Spirit & Energy', 30], ['Synchronization', 30]], 'Team'),
    mk('mtv', 'MTV', [['Concept', 35], ['Performance', 40], ['Execution', 25]], 'Team')
  ],
  scores: {} // scores[eventId][candidateId][judgeId] = { criterionId: 0-100 }
})

export const data = reactive(read('tab_data') || seed())
export const ui = reactive({
  session: read('tab_session'), // { role: 'admin' | 'judge', id, name }
  activeEvent: null, navOpen: false, pending: read('tab_pending') || [], online: false, lastSync: null,
  theme: localStorage.getItem('tab_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
})
export const isAdmin = () => ui.session?.role === 'admin'
export const eventById = id => data.events.find(e => e.id === id)
export const currentEvent = () => eventById(ui.activeEvent) || data.events[0]

export function setTheme(t) {
  ui.theme = t; localStorage.setItem('tab_theme', t)
  document.documentElement.classList.toggle('dark', t === 'dark')
}
export const clamp = v => v === '' || v == null ? '' : Math.min(100, Math.max(0, Math.round(Number(v) * 100) / 100 || 0))

/* ---- scoring math ---- */
export const judgeTotal = (event, sc) => event.criteria.reduce((s, c) => s + (Number(sc?.[c.id]) || 0) * c.weight / 100, 0)
export function rankings(event) {
  if (!event) return []
  const ev = data.scores[event.id] || {}
  const list = event.candidates.map(c => {
    const totals = {}; let sum = 0, n = 0
    data.judges.forEach(j => { const s = ev[c.id]?.[j.id]; if (s) { totals[j.id] = judgeTotal(event, s); sum += totals[j.id]; n++ } })
    return { ...c, totals, avg: n ? sum / n : 0, judged: n }
  }).sort((a, b) => b.avg - a.avg || a.number - b.number)
  list.forEach((r, i) => { r.rank = i && list[i - 1].avg === r.avg ? list[i - 1].rank : i + 1 })
  return list
}

/* ---- admin actions ---- */
export const addEvent = name => { const e = { id: uid('e_'), name, locked: false, criteria: [], candidates: [] }; data.events.push(e); ui.activeEvent = e.id }
export const removeEvent = id => { data.events.splice(data.events.findIndex(e => e.id === id), 1); delete data.scores[id]; ui.activeEvent = null }
export const addCriterion = (ev, name, weight) => ev.criteria.push({ id: uid('c_'), name, weight })
export const removeCriterion = (ev, id) => { ev.criteria = ev.criteria.filter(c => c.id !== id) }
export const addCandidate = (ev, number, name) => ev.candidates.push({ id: uid('t_'), number, name })
export const removeCandidate = (ev, id) => { ev.candidates = ev.candidates.filter(c => c.id !== id) }
export const addJudge = name => data.judges.push({ id: uid('j_'), name, code: code() })
export const removeJudge = id => { data.judges = data.judges.filter(j => j.id !== id) }
export const regenCode = j => { j.code = code() }

/* ---- network: judges save locally first, then sync when the admin's host is reachable ---- */
async function api(path, opts = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000)
  try {
    const r = await fetch('/api' + path, { ...opts, signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-admin-pass': isAdmin() ? data.adminPass : '' } })
    if (!r.ok) throw new Error(r.status); ui.online = true; return await r.json()
  } catch { ui.online = false; return null } finally { clearTimeout(t) }
}
function merge(remote, onlyJudge) {
  for (const e in remote) for (const c in remote[e]) for (const j in remote[e][c]) {
    if (onlyJudge && j !== onlyJudge) continue
    const key = [e, c, j].join('|')
    if (ui.pending.some(p => [p.eventId, p.candidateId, p.judgeId].join('|') === key)) continue
    ((data.scores[e] ||= {})[c] ||= {})[j] = remote[e][c][j]
  }
}
export async function pull() {
  const s = await api('/state'); if (!s) return false
  if (!isAdmin()) { data.events = s.events; data.judges = s.judges }
  merge(s.scores, isAdmin() ? null : ui.session?.id); ui.lastSync = Date.now(); return true
}
export async function flush() {
  if (!ui.pending.length) return
  const sent = [...ui.pending]
  if (await api('/scores', { method: 'POST', body: JSON.stringify({ items: sent }) })) {
    ui.pending = ui.pending.filter(p => !sent.includes(p)); write('tab_pending', ui.pending); ui.lastSync = Date.now()
  }
}
export function submitScores(eventId, rows) {
  const jid = ui.session.id
  rows.forEach(({ candidateId, scores }) => {
    ((data.scores[eventId] ||= {})[candidateId] ||= {})[jid] = { ...scores }
    ui.pending = ui.pending.filter(p => !(p.eventId === eventId && p.candidateId === candidateId && p.judgeId === jid))
    ui.pending.push({ eventId, candidateId, judgeId: jid, scores: { ...scores } })
  })
  write('tab_pending', ui.pending); flush()
}

/* ---- auth ---- */
export async function login(role, secret) {
  if (role === 'admin') {
    if (secret !== data.adminPass) return 'Wrong admin password.'
    ui.session = { role: 'admin', id: 'admin', name: 'Admin' }
  } else {
    let j = data.judges.find(x => x.code === secret)
    if (!j && await pull()) j = data.judges.find(x => x.code === secret)
    if (!j) return 'Access code not found. Check the code and make sure you are on the event Wi-Fi.'
    ui.session = { role: 'judge', id: j.id, name: j.name }
  }
  write('tab_session', ui.session); ui.activeEvent = null; return null
}
export const logout = () => { ui.session = null; localStorage.removeItem('tab_session') }

let pushT
export function start() {
  setTheme(ui.theme)
  const save = () => { write('tab_data', data); if (isAdmin()) { clearTimeout(pushT); pushT = setTimeout(() => api('/config', { method: 'POST', body: JSON.stringify({ events: data.events, judges: data.judges }) }), 500) } }
  setInterval(save, 1500)
  setInterval(() => { if (!ui.session) return; if (!isAdmin()) flush(); pull() }, 4000)
  addEventListener('online', () => { flush(); pull() })
  addEventListener('storage', e => { if (e.key === 'tab_data') { const d = read('tab_data'); if (d) Object.assign(data, d) } })
}
