/**
 * Moving a tablet to the laptop's new address.
 *
 * A phone hotspot can hand the laptop a different IP after the hotspot or the laptop restarts.
 * Browsers keep storage per address, so a tablet opened on the old address can no longer reach
 * the tabulator, and the new address starts with empty storage. moveTo() carries this tablet's
 * unsent sheets, drafts and login to the new address in the URL fragment (#...), which is never
 * sent over the network, and acceptMove() unpacks it there before the app starts.
 */

const PREFIX = '#/move/'
/** What travels: the login, unsent sheets, drafts and theme. Cached results are pulled again. */
const CARRIED = /^tab_(session|pending|theme|last_sync|draft_.+)$/

type Store = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

interface MovePayload { v: 1; from: string; items: Record<string, string> }
interface Pending { eventId: number; candidateId: number; judgeId: number; capturedAt?: number }
interface SessionLike { role: string; id: number }

function toBase64Url(text: string): string {
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}
const parse = <T>(raw: string | null): T | null => {
  try { return raw === null ? null : JSON.parse(raw) as T } catch { return null }
}

/** The fragment that carries this tablet's data to another address. */
export function encodeMove(storage: Store, from: string): string {
  const items: Record<string, string> = {}
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    const value = key === null ? null : storage.getItem(key)
    if (key && value !== null && CARRIED.test(key)) items[key] = value
  }
  return PREFIX + toBase64Url(JSON.stringify({ v: 1, from, items } satisfies MovePayload))
}

export function decodeMove(hash: string): MovePayload | null {
  if (!hash.startsWith(PREFIX)) return null
  const p = parse<MovePayload>((() => { try { return fromBase64Url(hash.slice(PREFIX.length)) } catch { return null } })())
  return p && p.v === 1 && p.items && typeof p.items === 'object' ? p : null
}

const sheetKey = (p: Pending) => `${p.eventId}|${p.candidateId}|${p.judgeId}`

/** Unsent sheets from both addresses; for the same sheet the newest capture wins. */
export function mergePending(here: Pending[], incoming: Pending[]): Pending[] {
  const out = new Map<string, Pending>()
  for (const p of [...here, ...incoming]) {
    const prev = out.get(sheetKey(p))
    if (!prev || (p.capturedAt ?? 0) >= (prev.capturedAt ?? 0)) out.set(sheetKey(p), p)
  }
  return [...out.values()]
}

/** Writes a received payload into this address's storage. Returns where it came from. */
export function applyMove(payload: MovePayload, storage: Store): string {
  for (const [key, value] of Object.entries(payload.items)) {
    const existing = storage.getItem(key)
    if (key === 'tab_pending') {
      const merged = mergePending(parse<Pending[]>(existing) ?? [], parse<Pending[]>(value) ?? [])
      storage.setItem(key, JSON.stringify(merged))
    } else if (key === 'tab_session') {
      // Never replace someone else's login on this address; their sheets still come along above.
      const mine = parse<SessionLike>(existing)
      const theirs = parse<SessionLike>(value)
      if (!mine || (theirs && mine.role === theirs.role && mine.id === theirs.id)) storage.setItem(key, value)
    } else if (key.startsWith('tab_draft_') || existing === null) {
      storage.setItem(key, value) // drafts: the tablet's latest working copy
    }
  }
  return payload.from
}

/** Runs once at startup, before the store reads storage. Removes the data from the address bar. */
export function acceptMove(loc: Location = location, storage: Store = localStorage): string | null {
  const payload = decodeMove(loc.hash)
  if (!payload) return null
  let from: string | null = null
  try { from = applyMove(payload, storage) } catch { /* storage blocked: nothing to keep */ }
  history.replaceState(null, '', loc.pathname + loc.search)
  return from
}

/** "192.168.43.7", "192.168.43.7:8443" or a pasted link → the origin to move to (same http/https). */
export function targetOrigin(input: string, loc: Pick<Location, 'protocol' | 'port'> = location): string | null {
  const s = input.trim().replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '')
  const m = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i.exec(s)
  if (!m) return null
  const port = m[2] ?? loc.port
  return `${loc.protocol}//${m[1].toLowerCase()}${port ? `:${port}` : ''}`
}

/** True when the tabulator answers at that address (and, over https, its certificate is trusted). */
export async function reachable(origin: string, timeout = 5000): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    // no-cors: the answer is unreadable, but getting one at all proves the address works.
    await fetch(`${origin}/api/health`, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Opens the app at the new address with this tablet's data. Returns an error message, or null. */
export async function moveTo(input: string): Promise<string | null> {
  const origin = targetOrigin(input)
  if (!origin) return 'Type the address shown on the laptop, for example 192.168.43.25'
  if (origin === location.origin) return 'That is the address this tablet already uses.'
  if (!(await reachable(origin))) {
    return location.protocol === 'https:'
      ? `No answer from ${origin}. Check the address, that this tablet is on the hotspot, and that the tabulator is running.`
      : `No answer from ${origin}. Check the address and that this tablet is on the hotspot.`
  }
  location.assign(`${origin}/${encodeMove(localStorage, location.origin)}`)
  return null
}
