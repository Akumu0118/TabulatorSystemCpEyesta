/**
 * Hand-over of a judge's unsent sheets by QR code, for a phone that cannot reach the tabulator.
 *
 * The sheets are JSON, split into chunks so each QR code stays small enough to scan quickly:
 *
 *   TAB1|<judgeId>|<eventId>|<part>/<parts>|<chunk>
 *
 * The phone cycles through the parts; the organizer's webcam collects them in any order.
 */
import type { Id, ImportItem, ScoreSheet } from './types'

export const PREFIX = 'TAB1'
export const CHUNK = 280

export interface HandoverPayload {
  judgeId: Id
  eventId: Id
  sheets: { candidateId: Id; capturedAt: number; scores: ScoreSheet }[]
}

/** Compact JSON: [[candidateId, capturedAt, {criterionId: score}], ...] */
export function encodeHandover(p: HandoverPayload, chunk = CHUNK): string[] {
  const body = JSON.stringify(p.sheets.map(s => [s.candidateId, s.capturedAt, s.scores]))
  const parts = Math.max(1, Math.ceil(body.length / chunk))
  return Array.from({ length: parts }, (_, i) =>
    `${PREFIX}|${p.judgeId}|${p.eventId}|${i + 1}/${parts}|${body.slice(i * chunk, (i + 1) * chunk)}`)
}

export interface HandoverPart { judgeId: Id; eventId: Id; part: number; parts: number; chunk: string }

/** Parses one scanned QR text, or returns null if it is not a hand-over code. */
export function parsePart(text: string): HandoverPart | null {
  const m = /^TAB1\|(\d+)\|(\d+)\|(\d+)\/(\d+)\|([\s\S]*)$/.exec(text.trim())
  if (!m) return null
  const [judgeId, eventId, part, parts] = m.slice(1, 5).map(Number)
  if (!parts || part < 1 || part > parts) return null
  return { judgeId, eventId, part, parts, chunk: m[5] }
}

/** Collects scanned parts; complete() returns the payload once every part has been seen. */
export class HandoverCollector {
  private parts = new Map<number, string>()
  judgeId: Id | null = null
  eventId: Id | null = null
  total = 0

  /** Returns 'new', 'seen', 'other' (a different judge/event: collection restarts) or 'invalid'. */
  add(text: string): 'new' | 'seen' | 'other' | 'invalid' {
    const p = parsePart(text)
    if (!p) return 'invalid'
    let result: 'new' | 'other' = 'new'
    if (this.judgeId !== null && (p.judgeId !== this.judgeId || p.eventId !== this.eventId || p.parts !== this.total)) {
      this.reset()
      result = 'other'
    }
    this.judgeId = p.judgeId
    this.eventId = p.eventId
    this.total = p.parts
    if (this.parts.has(p.part)) return 'seen'
    this.parts.set(p.part, p.chunk)
    return result
  }

  get received() { return [...this.parts.keys()].sort((a, b) => a - b) }
  get done() { return this.total > 0 && this.parts.size === this.total }

  complete(): HandoverPayload | null {
    if (!this.done || this.judgeId === null || this.eventId === null) return null
    const body = this.received.map(i => this.parts.get(i)).join('')
    try {
      const rows = JSON.parse(body) as [Id, number, ScoreSheet][]
      return {
        judgeId: this.judgeId,
        eventId: this.eventId,
        sheets: rows.map(([candidateId, capturedAt, scores]) => ({ candidateId, capturedAt, scores }))
      }
    } catch {
      return null
    }
  }

  reset() {
    this.parts.clear()
    this.judgeId = null
    this.eventId = null
    this.total = 0
  }
}

export const toImportItems = (p: HandoverPayload): ImportItem[] =>
  p.sheets.map(s => ({ eventId: p.eventId, candidateId: s.candidateId, scores: s.scores, capturedAt: s.capturedAt }))
