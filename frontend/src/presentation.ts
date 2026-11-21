/**
 * The results reveal, as a list of steps the presenter clicks through.
 *
 *   title
 *   for each category (or once, when the event has none):
 *     for each criterion: intro → race (every entry's average, bars jostle, then sort) → winner spotlight
 *     final intro → the rest (bottom up) → 3rd → 2nd → drumroll → champion → full table
 *   closing
 *
 * Pure: built from the same scoring functions as the dashboard, so the reveal always matches the tally.
 */
import { criterionAverages, groups, rankings, weighted } from './scoring'
import type { Criterion, Judge, RankingRow, ScoreMap, TabEvent } from './types'

export interface Entry { id: number; number: number; name: string }
export interface RaceBar extends Entry { value: number; share: number }
export interface Placed extends Entry {
  rank: number
  avg: number
  /** Weighted points per criterion (averaged over judges), for the stacked table bars. */
  parts: Record<string, number>
}
export interface CriterionInfo { id: number; name: string; weight: number; max: number; color: number }

/** The category a step belongs to ("Female"); absent when the event has no categories. */
interface InGroup { group?: string }

export type Step =
  | { kind: 'title'; event: string; entries: number; criteria: number; judges: number }
  | ({ kind: 'criterion-intro'; criterion: CriterionInfo; index: number; total: number } & InGroup)
  | ({ kind: 'criterion-race'; criterion: CriterionInfo; bars: RaceBar[] } & InGroup)
  | ({ kind: 'criterion-winner'; criterion: CriterionInfo; winners: RaceBar[] } & InGroup)
  | ({ kind: 'final-intro'; event: string } & InGroup)
  | ({ kind: 'final-rest'; rows: Placed[] } & InGroup)
  | ({ kind: 'place'; place: 2 | 3; rows: Placed[] } & InGroup)
  | ({ kind: 'drumroll' } & InGroup)
  | ({ kind: 'champion'; rows: Placed[]; podium: Placed[] } & InGroup)
  | ({ kind: 'table'; rows: Placed[]; criteria: CriterionInfo[] } & InGroup)
  | { kind: 'closing'; event: string }

const EPS = 1e-9
const entry = (c: { id: number; number: number; name: string }): Entry => ({ id: c.id, number: c.number, name: c.name })

function placed(event: TabEvent, judges: Judge[], scores: ScoreMap, r: RankingRow): Placed {
  const avgs = criterionAverages(event, judges, scores, r.id)
  const parts = Object.fromEntries(event.criteria.map(c => [c.id, weighted(c, avgs[c.id] ?? 0)]))
  return { ...entry(r), rank: r.rank, avg: r.avg, parts }
}

export function buildSteps(event: TabEvent, judges: Judge[], scores: ScoreMap): Step[] {
  const crit: CriterionInfo[] = event.criteria.map((c: Criterion, i) =>
    ({ id: c.id, name: c.name, weight: c.weight, max: c.max_score, color: i }))
  const ranked = rankings(event, judges, scores).filter(r => r.judged > 0)
  const judged = new Set(ranked.map(r => r.id))

  const steps: Step[] = [{
    kind: 'title', event: event.name, entries: ranked.length, criteria: crit.length,
    judges: judges.filter(j => event.candidates.some(c => scores[event.id]?.[c.id]?.[j.id])).length
  }]

  for (const g of groups(event)) {
    const members = new Set(g.candidates.map(c => c.id))
    const rows = ranked.filter(r => members.has(r.id)).map(r => placed(event, judges, scores, r))
    if (!rows.length) continue
    const group = g.name || undefined

    const awards = crit.map(c => {
      const bars: RaceBar[] = g.candidates
        .filter(x => judged.has(x.id))
        .map(x => {
          const v = criterionAverages(event, judges, scores, x.id)[c.id]
          return v === null ? null : { ...entry(x), value: v, share: c.max ? v / c.max : 0 }
        })
        .filter((b): b is RaceBar => b !== null)
        .sort((a, b) => a.number - b.number)
      return { c, bars }
    }).filter(a => a.bars.length)

    awards.forEach(({ c, bars }, i) => {
      const best = Math.max(...bars.map(b => b.value))
      steps.push(
        { kind: 'criterion-intro', criterion: c, index: i + 1, total: awards.length, group },
        { kind: 'criterion-race', criterion: c, bars, group },
        { kind: 'criterion-winner', criterion: c, winners: bars.filter(b => best - b.value < EPS), group }
      )
    })

    steps.push({ kind: 'final-intro', event: event.name, group })
    const rest = rows.filter(r => r.rank > 3).reverse()
    if (rest.length) steps.push({ kind: 'final-rest', rows: rest, group })
    for (const place of [3, 2] as const) {
      const at = rows.filter(r => r.rank === place)
      if (at.length) steps.push({ kind: 'place', place, rows: at, group })
    }
    steps.push(
      { kind: 'drumroll', group },
      { kind: 'champion', rows: rows.filter(r => r.rank === 1), podium: rows.filter(r => r.rank <= 3), group },
      { kind: 'table', rows, criteria: crit, group }
    )
  }
  steps.push({ kind: 'closing', event: event.name })
  return steps
}

/** One line telling the presenter what the audience sees, and what to say. */
export function cue(step: Step): string {
  const text = baseCue(step)
  return 'group' in step && step.group ? `${step.group}: ${text}` : text
}

function baseCue(step: Step): string {
  switch (step.kind) {
    case 'title': return `Welcome. ${step.entries} entries, ${step.criteria} criteria, ${step.judges} judges.`
    case 'criterion-intro': return `Award ${step.index} of ${step.total}: best in ${step.criterion.name} (${step.criterion.weight}%).`
    case 'criterion-race': return `Bars race, then sort. Wait for the leader to light up (about 4 s).`
    case 'criterion-winner': return `Winner${step.winners.length > 1 ? 's (tie)' : ''}: ${step.winners.map(w => `#${w.number} ${w.name}`).join(', ')}.`
    case 'final-intro': return step.group ? `Now the ${step.group} results.` : 'Now the overall results.'
    case 'final-rest': return `Ranks ${step.rows[0].rank} up to ${step.rows[step.rows.length - 1].rank}, revealed from the bottom.`
    case 'place': return `${step.place === 3 ? 'Third' : 'Second'} place: ${step.rows.map(r => `#${r.number} ${r.name}`).join(', ')}.`
    case 'drumroll': return 'Drumroll. Build the moment, then click.'
    case 'champion': return `Champion${step.rows.length > 1 ? 's (tie)' : ''}: ${step.rows.map(r => `#${r.number} ${r.name}`).join(', ')}.`
    case 'table': return 'Full results table.'
    case 'closing': return 'Thank you slide.'
  }
}

export const stepLabel = (s: Step): string => {
  const text = baseLabel(s)
  return 'group' in s && s.group ? `${s.group} · ${text}` : text
}

function baseLabel(s: Step): string {
  switch (s.kind) {
    case 'title': return 'Title'
    case 'criterion-intro': return `${s.criterion.name} · intro`
    case 'criterion-race': return `${s.criterion.name} · race`
    case 'criterion-winner': return `${s.criterion.name} · winner`
    case 'final-intro': return 'Final results'
    case 'final-rest': return 'The rest'
    case 'place': return s.place === 3 ? 'Third place' : 'Second place'
    case 'drumroll': return 'Drumroll'
    case 'champion': return 'Champion'
    case 'table': return 'Full table'
    case 'closing': return 'Closing'
  }
}
