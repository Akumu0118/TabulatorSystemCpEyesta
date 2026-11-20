import type {
  AppState, Candidate, Criterion, Id, ImportItem, Judge, Role, ScoreSubmitResult, ServerInfo, Session, TabEvent
} from './types'

/** status 0 means the host could not be reached (offline or timed out). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public body: unknown = null) {
    super(message)
  }
}

/** Flattens DRF error bodies ({detail} or {field: [msgs]}) into one sentence. */
function describe(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const record = body as Record<string, unknown>
  if (typeof record.detail === 'string') return record.detail
  const messages = Object.values(record).flat().filter((m): m is string => typeof m === 'string')
  return messages.length ? messages.join(' ') : fallback
}

let tokenProvider: () => string | undefined = () => undefined
export const setTokenProvider = (fn: () => string | undefined) => { tokenProvider = fn }

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  timeout?: number
}

async function request<T>(path: string, { method = 'GET', body, timeout = 4000 }: RequestOptions = {}): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  const token = tokenProvider()
  let res: Response
  try {
    res = await fetch('/api' + path, {
      method,
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the tabulator host. Make sure you are on the event Wi-Fi.')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 204) return undefined as T
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, describe(data, `Request failed (${res.status}).`), data)
  return data as T
}

export const api = {
  login: (role: Role, secret: string) =>
    request<Session>('/auth/login', { method: 'POST', body: { role, secret } }),
  state: () => request<AppState>('/state'),
  info: () => request<ServerInfo>('/info'),

  createEvent: (name: string) => request<TabEvent>('/events', { method: 'POST', body: { name } }),
  updateEvent: (id: Id, patch: Partial<Pick<TabEvent, 'name' | 'locked'>>) =>
    request<TabEvent>(`/events/${id}`, { method: 'PATCH', body: patch }),
  deleteEvent: (id: Id) => request<void>(`/events/${id}`, { method: 'DELETE' }),

  createCriterion: (event: Id, name: string, weight: number, max_score: number) =>
    request<Criterion>('/criteria', { method: 'POST', body: { event, name, weight, max_score } }),
  updateCriterion: (id: Id, patch: Partial<Pick<Criterion, 'name' | 'weight' | 'max_score'>>) =>
    request<Criterion>(`/criteria/${id}`, { method: 'PATCH', body: patch }),
  deleteCriterion: (id: Id) => request<void>(`/criteria/${id}`, { method: 'DELETE' }),

  createCandidate: (event: Id, number: number, name: string) =>
    request<Candidate>('/candidates', { method: 'POST', body: { event, number, name } }),
  updateCandidate: (id: Id, patch: Partial<Omit<Candidate, 'id'>>) =>
    request<Candidate>(`/candidates/${id}`, { method: 'PATCH', body: patch }),
  deleteCandidate: (id: Id) => request<void>(`/candidates/${id}`, { method: 'DELETE' }),

  createJudge: (name: string) => request<Judge>('/judges', { method: 'POST', body: { name } }),
  updateJudge: (id: Id, patch: { name: string }) =>
    request<Judge>(`/judges/${id}`, { method: 'PATCH', body: patch }),
  deleteJudge: (id: Id) => request<void>(`/judges/${id}`, { method: 'DELETE' }),
  regenerateJudgeCode: (id: Id) => request<Judge>(`/judges/${id}/regenerate-code`, { method: 'POST' }),

  submitScores: (items: ImportItem[]) =>
    request<ScoreSubmitResult>('/scores', { method: 'POST', body: { items } }),
  importScores: (judgeId: Id, source: 'qr' | 'manual', items: ImportItem[]) =>
    request<ScoreSubmitResult>('/scores/import', { method: 'POST', body: { judgeId, source, items }, timeout: 10000 }),
  finalize: (id: Id, force: boolean) =>
    request<TabEvent & { missing: { judgeId: Id; candidateId: Id }[] }>(`/events/${id}/finalize`, {
      method: 'POST', body: { force }
    }),
  unfinalize: (id: Id) => request<TabEvent>(`/events/${id}/unfinalize`, { method: 'POST' })
}
