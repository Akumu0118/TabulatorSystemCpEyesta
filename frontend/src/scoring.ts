import type { Criterion, Judge, RankingRow, ScoreMap, ScoreSheet, TabEvent } from './types'

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

/** Entries sorted by average of judge totals; ties share a rank. */
export function rankings(event: TabEvent | undefined, judges: Judge[], scores: ScoreMap): RankingRow[] {
  if (!event) return []
  const eventScores = scores[event.id] ?? {}
  const list: RankingRow[] = event.candidates.map(c => {
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
