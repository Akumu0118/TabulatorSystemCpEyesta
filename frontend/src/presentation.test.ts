import { describe, expect, it } from 'vitest'
import { buildSteps, cue, type Step } from './presentation'
import type { Judge, ScoreMap, TabEvent } from './types'

const event: TabEvent = {
  id: 1, name: 'Pageant', locked: true, finalized_at: '2026-01-01T00:00:00Z',
  criteria: [
    { id: 11, name: 'Poise', weight: 60, max_score: 10 },
    { id: 12, name: 'Q&A', weight: 40, max_score: 20 }
  ],
  categories: [],
  candidates: [1, 2, 3, 4, 5].map(n => ({ id: n * 100, number: n, name: `C${n}`, category: null }))
}
const judges: Judge[] = [{ id: 7, name: 'A' }, { id: 8, name: 'B' }]
/** sheets[n] = [poise, qa] for both judges */
function scoresFor(sheets: Record<number, [number, number]>): ScoreMap {
  const map: ScoreMap = { 1: {} }
  for (const [n, [p, q]] of Object.entries(sheets)) {
    map[1][Number(n) * 100] = { 7: { 11: p, 12: q }, 8: { 11: p, 12: q } }
  }
  return map
}
const kinds = (s: Step[]) => s.map(x => x.kind)

describe('presentation steps', () => {
  it('reveals each criterion, then the rest bottom-up, 3rd, 2nd, drumroll, champion', () => {
    const steps = buildSteps(event, judges, scoresFor({ 1: [9, 10], 2: [8, 20], 3: [7, 5], 4: [6, 4], 5: [5, 3] }))
    expect(kinds(steps)).toEqual([
      'title',
      'criterion-intro', 'criterion-race', 'criterion-winner',
      'criterion-intro', 'criterion-race', 'criterion-winner',
      'final-intro', 'final-rest', 'place', 'place', 'drumroll', 'champion', 'table', 'closing'
    ])
    const rest = steps.find(s => s.kind === 'final-rest')!
    expect(rest.kind === 'final-rest' && rest.rows.map(r => r.number)).toEqual([5, 4])
    const places = steps.filter(s => s.kind === 'place')
    expect(places.map(s => s.kind === 'place' && s.place)).toEqual([3, 2])
    const champ = steps.find(s => s.kind === 'champion')!
    // #2: 0.8*60 + 1*40 = 88 beats #1: 54 + 20 = 74
    expect(champ.kind === 'champion' && champ.rows.map(r => r.number)).toEqual([2])
    expect(champ.kind === 'champion' && champ.podium.map(r => r.number)).toEqual([2, 1, 3])
  })

  it('names criterion winners from the average raw score, with ties as co-winners', () => {
    const steps = buildSteps(event, judges, scoresFor({ 1: [9, 10], 2: [9, 20], 3: [7, 5] }))
    const poise = steps.find(s => s.kind === 'criterion-winner' && s.criterion.id === 11)!
    expect(poise.kind === 'criterion-winner' && poise.winners.map(w => w.number)).toEqual([1, 2])
    const race = steps.find(s => s.kind === 'criterion-race' && s.criterion.id === 12)!
    expect(race.kind === 'criterion-race' && race.bars.map(b => [b.number, b.share])).toEqual([[1, 0.5], [2, 1], [3, 0.25]])
  })

  it('skips second place when two entries tie for first', () => {
    const steps = buildSteps(event, judges, scoresFor({ 1: [9, 10], 2: [9, 10], 3: [5, 5] }))
    const champ = steps.find(s => s.kind === 'champion')!
    expect(champ.kind === 'champion' && champ.rows.map(r => r.number)).toEqual([1, 2])
    expect(steps.filter(s => s.kind === 'place').map(s => s.kind === 'place' && s.place)).toEqual([3])
    expect(steps.some(s => s.kind === 'final-rest')).toBe(false)
    expect(cue(champ)).toContain('tie')
  })

  it('leaves out entries no judge scored and still gives a title and closing with no scores', () => {
    const steps = buildSteps(event, judges, scoresFor({ 1: [9, 10] }))
    const table = steps.find(s => s.kind === 'table')!
    expect(table.kind === 'table' && table.rows.map(r => r.number)).toEqual([1])
    expect(kinds(buildSteps(event, judges, { 1: {} }))).toEqual(['title', 'closing'])
  })

  it('splits each total into weighted parts that add up to the average', () => {
    const steps = buildSteps(event, judges, scoresFor({ 1: [9, 10], 2: [8, 20] }))
    const table = steps.find(s => s.kind === 'table')!
    if (table.kind !== 'table') throw new Error()
    for (const r of table.rows) {
      expect(Object.values(r.parts).reduce((a, b) => a + b, 0)).toBeCloseTo(r.avg, 9)
    }
  })
})

describe('presentation with categories', () => {
  const split: TabEvent = {
    ...event,
    categories: [{ id: 2, name: 'Male', order: 1 }, { id: 1, name: 'Female', order: 0 }],
    candidates: event.candidates.map(c => ({ ...c, category: c.number <= 3 ? 1 : 2 }))
  }

  it('runs the awards and the reveal once per category, in category order, ranking each on its own', () => {
    const steps = buildSteps(split, judges, scoresFor({ 1: [9, 10], 2: [8, 20], 3: [7, 5], 4: [6, 4], 5: [5, 3] }))
    const champs = steps.filter(s => s.kind === 'champion')
    expect(champs.map(s => s.group)).toEqual(['Female', 'Male'])
    expect(champs.map(s => s.kind === 'champion' && s.rows.map(r => r.number))).toEqual([[2], [4]])
    const tables = steps.filter(s => s.kind === 'table')
    expect(tables.map(s => s.kind === 'table' && s.rows.map(r => r.rank))).toEqual([[1, 2, 3], [1, 2]])
    expect(steps.filter(s => s.kind === 'criterion-intro')).toHaveLength(4)
    expect(kinds(steps).at(-1)).toBe('closing')
    expect(cue(champs[1])).toMatch(/^Male: Champion/)
  })
})

