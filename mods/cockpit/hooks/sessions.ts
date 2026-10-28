import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SessionList, SessionRow, SessionState } from '../types'
import { sessionOf } from './pr'
import { isStopped, writeDoc } from './sync'

type $ = EngineInterface

// The account's cloud sessions, as the Claude Code Remote connector lists them.
const SERVER = 'claude-code-remote'
const DOC = 'sessions'
// "Current": not archived and active within the last day, or working right now.
const CURRENT_MS = 24 * 60 * 60 * 1000
const MIN_GAP_MS = 60_000
export const NO_REPO = 'Ohne Repo'

// The state lives here alone (the engine reads atoms only in the file that
// declares them); everything else goes through the functions below.
const list = atom({ plugin: 'cockpit', key: 'sessions' } as const, null, { shape: 'sessions-1' })

// A session's repo never changes: read once per session, kept for the module's life.
const repos = new Map<string, string | null>()
let lastAt = 0
let lastSent = ''

type Raw = {
  id?: string
  title?: string
  session_status?: string
  status_bucket?: string
  updated_at?: string
  created_at?: string
  post_turn_summary?: { needs_action?: string; recent_action?: string }
  session_context?: {
    sources?: { git_repository?: { url?: string } }[]
    outcomes?: { git_repository?: { git_info?: { repo?: string } } }[]
  }
}

// The connector's answer is JSON, sometimes inside a wrapper of text.
export function parseAnswer(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    return (value.ccr as Record<string, unknown> | undefined) ?? value
  } catch {
    return null
  }
}

async function ask($: $, tool: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const result = await $.mcp.call(SERVER, tool, args)
  const text = result.content.map(block => ('text' in block && typeof block.text === 'string' ? block.text : '')).join('')
  if (result.isError) throw new Error(text.slice(0, 200) || 'Fehler')

  return parseAnswer(text)
}

export function repoOf(raw: Raw): string | null {
  const named = raw.session_context?.outcomes?.find(one => one.git_repository?.git_info?.repo)?.git_repository?.git_info?.repo
  if (named) return named
  const url = raw.session_context?.sources?.find(one => one.git_repository?.url)?.git_repository?.url
  const match = url?.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/)

  return match?.[1] ?? null
}

export function stateOf(raw: Raw): SessionState {
  const bucket = raw.status_bucket ?? ''
  if (bucket.endsWith('WORKING')) return 'working'
  if (bucket.endsWith('BLOCKED')) return 'blocked'
  if (bucket.endsWith('REVIEW_READY')) return 'review'
  if (bucket.endsWith('FAILED')) return 'failed'
  if (bucket.endsWith('COMPLETED')) return 'done'

  return 'idle'
}

export function isCurrent(raw: Raw, now: number): boolean {
  if (raw.session_status?.endsWith('ARCHIVED')) return false
  if (stateOf(raw) === 'working') return true
  const at = Date.parse(raw.updated_at ?? raw.created_at ?? '')

  return Number.isFinite(at) && now - at < CURRENT_MS
}

// Repos A–Z, sessions without one last; inside a repo the newest first.
export function sortRows(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => {
    const left = a.repo ?? '￿'
    const right = b.repo ?? '￿'
    if (left !== right) return left.localeCompare(right, 'de', { sensitivity: 'base' })
    return b.updatedAt - a.updatedAt
  })
}

export function groupRows(rows: SessionRow[]): { repo: string; rows: SessionRow[] }[] {
  const groups: { repo: string; rows: SessionRow[] }[] = []
  for (const row of sortRows(rows)) {
    const repo = row.repo ?? NO_REPO
    const last = groups.at(-1)
    if (last?.repo === repo) last.rows.push(row)
    else groups.push({ repo, rows: [row] })
  }

  return groups
}

export function sessionUrl(id: string): string {
  return `https://claude.ai/code/${id}`
}

export function sessionsView($: $): Promise<SessionList | null> {
  return read($, list)
}

// Reads the account's sessions, keeps the current ones with their repo, and
// sends the list to the phone's Cockpit page when it changed.
export async function syncSessions($: $, url: string, force = false): Promise<SessionList | null> {
  const now = await $.clock.now()
  if (!force && now - lastAt < MIN_GAP_MS) return sessionsView($)
  lastAt = now
  const self = await sessionOf($).catch(() => ({ session: '', sessionUrl: undefined }))
  try {
    const answer = await ask($, 'list_sessions', { limit: 50 })
    const raws = ((answer?.data as Raw[] | undefined) ?? []).filter(raw => raw.id && isCurrent(raw, now))
    await Promise.all(
      raws
        .filter(raw => !repos.has(raw.id!))
        .map(async raw => {
          const full = (await ask($, 'get_session', { session_id: raw.id }).catch(() => null)) as Raw | null
          repos.set(raw.id!, full ? repoOf(full) : null)
        }),
    )
    const rows: SessionRow[] = raws.map(raw => ({
      id: raw.id!,
      title: raw.title?.trim() || 'Ohne Titel',
      repo: repos.get(raw.id!) ?? null,
      state: stateOf(raw),
      note: raw.post_turn_summary?.needs_action ?? raw.post_turn_summary?.recent_action ?? null,
      updatedAt: Date.parse(raw.updated_at ?? raw.created_at ?? '') || now,
      url: sessionUrl(raw.id!),
      isSelf: raw.id === self.session || sessionUrl(raw.id!) === self.sessionUrl,
    }))
    const next: SessionList = { rows: sortRows(rows), at: now, error: null }
    await update($, list, () => next)
    const sent = JSON.stringify(next.rows)
    if (url && !isStopped() && sent !== lastSent) {
      if ((await writeDoc($, url, DOC, next).catch(() => 'failed')) === 'written') lastSent = sent
    }

    return next
  } catch (error) {
    const message = /not connected|unknown server|no server|not found/i.test(String(error))
      ? 'Der Connector „Claude Code Remote“ ist in dieser Session nicht verbunden.'
      : `Sessions ließen sich nicht lesen: ${String(error instanceof Error ? error.message : error).slice(0, 120)}`
    return update($, list, old => ({ rows: old?.rows ?? [], at: now, error: message }))
  }
}

const LABEL: Record<SessionState, string> = {
  working: 'arbeitet',
  blocked: 'wartet auf dich',
  review: 'zum Ansehen',
  failed: 'Fehler',
  done: 'fertig',
  idle: 'ruht',
}

export const DOT: Record<SessionState, { dot: string; color: string }> = {
  working: { dot: '◉', color: 'success' },
  blocked: { dot: '●', color: 'warning' },
  review: { dot: '●', color: 'suggestion' },
  failed: { dot: '●', color: 'error' },
  done: { dot: '●', color: 'inactive' },
  idle: { dot: '○', color: 'inactive' },
}

export function stateLabel(state: SessionState): string {
  return LABEL[state]
}

// /sessions as text: works on every surface, the phone included.
export function sessionsText(view: SessionList | null, now: number, ago: (now: number, at: number) => string): string {
  if (!view) return 'Lese die Sessions …'
  const lines = ['**Aktuelle Sessions** (letzte 24 h, ohne archivierte), nach Repo']
  if (view.error) lines.push('', `⚠ ${view.error}`)
  if (view.rows.length === 0 && !view.error) lines.push('', 'Keine aktuelle Session.')
  for (const group of groupRows(view.rows)) {
    lines.push('', `**${group.repo}** · ${group.rows.length}`)
    for (const row of group.rows) {
      const self = row.isSelf ? ' · diese Session' : ''
      lines.push(`- ${DOT[row.state].dot} [${row.title}](${row.url}) · ${stateLabel(row.state)} · ${ago(now, row.updatedAt)}${self}`)
    }
  }

  return lines.join('\n')
}
