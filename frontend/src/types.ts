export type Id = number
export type Role = 'admin' | 'judge'
export type Theme = 'light' | 'dark'

export interface Criterion {
  id: Id
  name: string
  /** Percentage weight; an event's weights add up to at most 100. */
  weight: number
  /** Highest raw score a judge may give (set by the admin, e.g. 10, 20 or 100). */
  max_score: number
}

export interface Candidate {
  id: Id
  number: number
  name: string
}

export interface TabEvent {
  id: Id
  name: string
  locked: boolean
  criteria: Criterion[]
  candidates: Candidate[]
}

export interface Judge {
  id: Id
  name: string
  /** Only present for the admin. */
  code?: string
}

/** criterionId → raw score from 0 to that criterion's max_score */
export type ScoreSheet = Record<string, number>
/** scores[eventId][candidateId][judgeId] = sheet */
export type ScoreMap = Record<string, Record<string, Record<string, ScoreSheet>>>

export interface AppState {
  events: TabEvent[]
  judges: Judge[]
  scores: ScoreMap
}

export interface Session {
  role: Role
  id: Id
  name: string
  token: string
}

export interface PendingScore {
  eventId: Id
  candidateId: Id
  judgeId: Id
  scores: ScoreSheet
}

export interface ScoreRow {
  candidateId: Id
  scores: ScoreSheet
}

export interface RankingRow extends Candidate {
  /** judgeId → weighted total from that judge */
  totals: Record<string, number>
  avg: number
  judged: number
  rank: number
}

export interface ServerInfo {
  port: number
  ips: string[]
}

export interface ScoreSubmitResult {
  saved: { eventId: Id; candidateId: Id }[]
  rejected: { eventId: Id; candidateId: Id; reason: string }[]
}
