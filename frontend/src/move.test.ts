import { describe, expect, it } from 'vitest'
import { applyMove, decodeMove, encodeMove, mergePending, targetOrigin } from './move'

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    dump: () => Object.fromEntries(m)
  }
}

const sheet = (candidateId: number, capturedAt: number, score = 5) =>
  ({ eventId: 1, candidateId, judgeId: 3, scores: { 7: score }, capturedAt })

describe('moving a tablet to a new laptop address', () => {
  it('carries the login, unsent sheets and drafts, but not cached results or other apps\' keys', () => {
    const old = fakeStorage({
      tab_session: JSON.stringify({ role: 'judge', id: 3, name: 'Judge 3', token: '1234' }),
      tab_pending: JSON.stringify([sheet(2, 1000)]),
      tab_draft_3: JSON.stringify({ '2:7': 6 }),
      tab_data: '{"events":[]}',
      tab_present_4: '5',
      other: 'x'
    })
    const hash = encodeMove(old, 'https://192.168.43.10:8443')
    const payload = decodeMove(hash)!
    expect(payload.from).toBe('https://192.168.43.10:8443')
    expect(Object.keys(payload.items).sort()).toEqual(['tab_draft_3', 'tab_pending', 'tab_session'])

    const fresh = fakeStorage()
    applyMove(payload, fresh)
    expect(fresh.dump()).toEqual(payload.items)
  })

  it('round-trips names with non-ASCII characters', () => {
    const old = fakeStorage({ tab_session: JSON.stringify({ role: 'judge', id: 1, name: 'Niño Peña', token: '9' }) })
    const payload = decodeMove(encodeMove(old, 'http://a'))!
    expect(JSON.parse(payload.items.tab_session).name).toBe('Niño Peña')
  })

  it('keeps the newest copy of each sheet when both addresses have one', () => {
    const merged = mergePending([sheet(1, 500, 1), sheet(2, 3000, 2)], [sheet(1, 900, 9), sheet(2, 1000, 8), sheet(3, 10)])
    const by = Object.fromEntries(merged.map(p => [p.candidateId, p.capturedAt]))
    expect(by).toEqual({ 1: 900, 2: 3000, 3: 10 })
  })

  it('does not replace a different judge\'s login on the new address', () => {
    const here = fakeStorage({ tab_session: JSON.stringify({ role: 'judge', id: 9, name: 'Other', token: '5555' }) })
    applyMove({ v: 1, from: 'x', items: {
      tab_session: JSON.stringify({ role: 'judge', id: 3, name: 'Judge 3', token: '1234' }),
      tab_pending: JSON.stringify([sheet(2, 1000)])
    } }, here)
    expect(JSON.parse(here.getItem('tab_session')!).id).toBe(9)
    expect(JSON.parse(here.getItem('tab_pending')!)).toHaveLength(1)
  })

  it('ignores fragments that are not a move or are damaged', () => {
    expect(decodeMove('#/present/4')).toBeNull()
    expect(decodeMove('#/move/%%%')).toBeNull()
    expect(decodeMove('#/move/' + btoa('{"v":2}'))).toBeNull()
  })

  it('turns what the organizer types into an address on the same scheme and port', () => {
    const loc = { protocol: 'https:', port: '8443' }
    expect(targetOrigin('192.168.43.25', loc)).toBe('https://192.168.43.25:8443')
    expect(targetOrigin(' https://192.168.43.25:9000/setup ', loc)).toBe('https://192.168.43.25:9000')
    expect(targetOrigin('Laptop.local', { protocol: 'http:', port: '' })).toBe('http://laptop.local')
    expect(targetOrigin('192.168 .1.2', loc)).toBeNull()
    expect(targetOrigin('', loc)).toBeNull()
  })
})
