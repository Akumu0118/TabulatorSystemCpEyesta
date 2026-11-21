import type { Candidate, Criterion, Id, Judge, RankingRow, ScoreMap, ScoreSheet, TabEvent } from './types'

/** A raw score's contribution to the 0-100 total: (score / max) × weight. */
export const weighted = (c: Criterion, raw: number): number => (raw / (c.max_score || 100)) * c.weight

/** Weighted total (0-100) of one judge's sheet for one entry. */
export const judgeTotal = (event: TabEvent, sheet?: ScoreSheet): number =>
  event.criteria.reduce((sum, c) => sum + weighted(c, Number(sheet?.[c.id]) || 0), 0)

/** Average raw score per criterion across the judges who submitted a sheet for this entry. */
export function criterionAverages(event: TabEvent, judges: Judge[], scores: ScoreMap, candidateId: number) {
  const sheets = judges.map(j => scores[event.id]?.[candidateId]?.[j.id]).filter((s): s is ScoreSheet => !!s)
  return Object.fromEntries(event.criteria.map(c => [
    c.id,
    sheets.length ? sheets.reduce((sum, s) => sum + (Number(s[c.id]) || 0), 0) / sheets.length : null
  ])) as Record<string, number | null>
}

export interface Group {
  /** Category id, or null for entries without one (or events without categories). */
  id: Id | null
  /** Category name; '' when the event has no categories. */
  name: string
  /** Short label prefix for entry numbers, e.g. 'F' for Female. '' without categories. */
  prefix: string
  candidates: Candidate[]
}

/** Shortest distinct uppercase prefixes for category names: Female/Male → F/M, Junior/Jazz → JU/JA. */
function prefixes(names: string[]): string[] {
  const clean = names.map(n => n.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() || '?')
  return clean.map((n, i) => {
    for (let len = 1; len <= n.length; len++) {
      const p = n.slice(0, len)
      if (clean.every((m, j) => j === i || !m.startsWith(p))) return p
    }
    return n
  })
}

/**
 * The event's entries split by category, in category order, each sorted by number.
 * Without categories there is one unnamed group holding every entry. Entries with no
 * category in an event that has some go last, in a group called "No category".
 */
export function groups(event: TabEvent | undefined): Group[] {
  if (!event) return []
  const sorted = [...event.candidates].sort((a, b) => a.number - b.number || a.id - b.id)
  const cats = [...(event.categories ?? [])].sort((a, b) => a.order - b.order || a.id - b.id)
  if (!cats.length) return [{ id: null, name: '', prefix: '', candidates: sorted }]
  const pre = prefixes(cats.map(c => c.name))
  const out: Group[] = cats.map((c, i) => ({
    id: c.id, name: c.name, prefix: pre[i], candidates: sorted.filter(x => x.category === c.id)
  }))
  const known = new Set(cats.map(c => c.id))
  const loose = sorted.filter(x => x.category === null || !known.has(x.category))
  if (loose.length) out.push({ id: null, name: 'No category', prefix: '', candidates: loose })
  return out
}

/** "F3" for entry 3 in Female, "#3" when the event has no categories. */
export function entryLabel(event: TabEvent | undefined, c: Pick<Candidate, 'number' | 'category'>): string {
  const g = groups(event).find(x => x.id === c.category && x.prefix)
  return g ? `${g.prefix}${c.number}` : `#${c.number}`
}

/**
 * Entries sorted by average of judge totals; ties share a rank. With categories, each
 * category is ranked on its own (rank 1 in Female and rank 1 in Male) and the list is
 * ordered by category first.
 */
export function rankings(event: TabEvent | undefined, judges: Judge[], scores: ScoreMap): RankingRow[] {
  if (!event) return []
  return groups(event).flatMap(g => rankGroup(event, g.candidates, judges, scores))
}

function rankGroup(event: TabEvent, candidates: Candidate[], judges: Judge[], scores: ScoreMap): RankingRow[] {
  const eventScores = scores[event.id] ?? {}
  const list: RankingRow[] = candidates.map(c => {
    const totals: Record<string, number> = {}
    let sum = 0
    let n = 0
    for (const j of judges) {
      const sheet = eventScores[c.id]?.[j.id]
      if (!sheet) continue
      totals[j.id] = judgeTotal(event, sheet)
      sum += totals[j.id]
      n++
    }
    return { ...c, totals, avg: n ? sum / n : 0, judged: n, rank: 0 }
  })
  list.sort((a, b) => b.avg - a.avg || a.number - b.number)
  list.forEach((r, i) => { r.rank = i && list[i - 1].avg === r.avg ? list[i - 1].rank : i + 1 })
  return list
}

/** What a judge typed in a score box: '' while empty, otherwise the number as typed (not clamped). */
export function parseScore(raw: string | number): number | '' {
  if (raw === '' || raw == null) return ''
  const n = Number(raw)
  return Number.isNaN(n) ? '' : n
}

/** Error text for a typed score, or '' when it is empty or valid. Out-of-range values are flagged, never silently changed. */
export function scoreError(c: Criterion, value: number | ''): string {
  if (value === '') return ''
  if (value < 0 || value > c.max_score) return `Enter 0 to ${c.max_score}`
  if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return 'Use at most 2 decimals'
  return ''
}

export const fmt = (n: number, digits = 2) => n.toFixed(digits)
