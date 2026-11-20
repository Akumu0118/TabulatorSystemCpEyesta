import { describe, expect, it } from 'vitest'
import { encodeHandover, HandoverCollector, parsePart, toImportItems } from './handover'

const payload = {
  judgeId: 2,
  eventId: 7,
  sheets: Array.from({ length: 6 }, (_, i) => ({
    candidateId: 10 + i,
    capturedAt: 1_700_000_000_000 + i,
    scores: { '1': 8.5, '2': 9, '3': 17.25 }
  }))
}

describe('QR hand-over', () => {
  it('splits into several parts and restores the sheets in any scan order', () => {
    const parts = encodeHandover(payload, 60)
    expect(parts.length).toBeGreaterThan(2)
    const c = new HandoverCollector()
    for (const p of [...parts].reverse()) c.add(p)
    expect(c.done).toBe(true)
    expect(c.complete()).toEqual(payload)
  })

  it('ignores repeated parts and reports progress', () => {
    const parts = encodeHandover(payload, 60)
    const c = new HandoverCollector()
    expect(c.add(parts[0])).toBe('new')
    expect(c.add(parts[0])).toBe('seen')
    expect(c.received).toEqual([1])
    expect(c.done).toBe(false)
    expect(c.complete()).toBeNull()
  })

  it('restarts when a different judge is scanned', () => {
    const c = new HandoverCollector()
    c.add(encodeHandover(payload, 60)[0])
    const other = encodeHandover({ ...payload, judgeId: 3 }, 60)
    expect(c.add(other[1])).toBe('other')
    expect(c.judgeId).toBe(3)
    expect(c.received).toEqual([2])
  })

  it('rejects unrelated QR codes', () => {
    expect(parsePart('https://example.com')).toBeNull()
    expect(parsePart('TAB1|1|1|3/2|x')).toBeNull()
    expect(new HandoverCollector().add('hello')).toBe('invalid')
  })

  it('converts to import items with the phone capture time', () => {
    expect(toImportItems(payload)[0]).toEqual({ eventId: 7, candidateId: 10, scores: payload.sheets[0].scores, capturedAt: 1_700_000_000_000 })
  })

  it('handles an empty hand-over', () => {
    const parts = encodeHandover({ ...payload, sheets: [] })
    expect(parts).toHaveLength(1)
    const c = new HandoverCollector()
    c.add(parts[0])
    expect(c.complete()?.sheets).toEqual([])
  })
})
