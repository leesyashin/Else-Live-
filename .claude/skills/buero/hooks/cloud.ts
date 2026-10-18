// Cloud sessions as the claude-code-remote server lists them, turned into the
// same records the office draws from the files of a PC.

import type { SessionRecord, Status } from '../types'
import { baseName, clip, pickName } from './model'

export const CLOUD_SERVER = 'claude-code-remote'
/** Finished sessions stay in the office this long after their last update. */
const DAY_MS = 24 * 60 * 60_000

type CloudSummary = {
  status_category?: string
  status_detail?: string
  needs_action?: string
  recent_action?: string
}

export type CloudSession = {
  id?: string
  title?: string
  session_status?: string
  status_bucket?: string
  created_at?: string
  updated_at?: string
  session_context?: {
    sources?: { git_repository?: { url?: string } }[]
    outcomes?: { git_repository?: { git_info?: { repo?: string; branches?: string[] } } }[]
  }
  post_turn_summary?: CloudSummary
  external_metadata?: {
    context_usage?: { max_tokens?: number; used_tokens?: number }
    usage?: { cost_usd?: number }
    post_turn_summary?: CloudSummary
  }
}

const STATUS_BY_BUCKET: Readonly<Record<string, Status>> = {
  SESSION_STATUS_BUCKET_WORKING: 'arbeitet',
  SESSION_STATUS_BUCKET_BLOCKED: 'frage',
  SESSION_STATUS_BUCKET_REVIEW_READY: 'fertig',
  SESSION_STATUS_BUCKET_COMPLETED: 'fertig',
  SESSION_STATUS_BUCKET_FAILED: 'fehler',
}

/** The session list out of a tool result's text, which may wrap it in a notice. */
export function parseSessionList(text: string): CloudSession[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return []
  }
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as { ccr?: { data?: unknown }; data?: unknown }
    const data = value.ccr?.data ?? value.data

    return Array.isArray(data) ? (data as CloudSession[]) : []
  } catch {
    return []
  }
}

/** `cse_…` and `session_…` name the same session. */
export function sameSession(a: string, b: string): boolean {
  const tail = (id: string) => id.slice(id.indexOf('_') + 1)

  return a !== '' && b !== '' && tail(a) === tail(b)
}

function time(iso: string | undefined, fallback: number): number {
  const parsed = iso === undefined ? Number.NaN : Date.parse(iso)

  return Number.isFinite(parsed) ? parsed : fallback
}

function repoOf(session: CloudSession): string {
  const repo =
    session.session_context?.outcomes?.[0]?.git_repository?.git_info?.repo ??
    session.session_context?.sources?.[0]?.git_repository?.url

  return repo === undefined ? 'ohne Repo' : baseName(repo)
}

function usageOf(session: CloudSession): string | undefined {
  const context = session.external_metadata?.context_usage
  const cost = session.external_metadata?.usage?.cost_usd
  const parts: string[] = []
  if (context?.used_tokens !== undefined && context.max_tokens !== undefined && context.max_tokens > 0) {
    parts.push(`Kontext ${Math.round((context.used_tokens / context.max_tokens) * 100)} %`)
  }
  if (cost !== undefined) {
    parts.push(`${cost.toFixed(2)} $`)
  }

  return parts.length === 0 ? undefined : parts.join(' · ')
}

function isShown(session: CloudSession, now: number): boolean {
  if (typeof session.id !== 'string' || session.session_status === 'SESSION_STATUS_ARCHIVED') {
    return false
  }
  const isBusy =
    session.status_bucket === 'SESSION_STATUS_BUCKET_WORKING' ||
    session.status_bucket === 'SESSION_STATUS_BUCKET_BLOCKED'

  return isBusy || now - time(session.updated_at, 0) <= DAY_MS
}

/** The sessions worth a desk: busy ones, and the rest touched in the last day. */
export function cloudRecords(sessions: readonly CloudSession[], now: number): SessionRecord[] {
  const shown = sessions
    .filter(session => isShown(session, now))
    .sort((a, b) => time(a.created_at, 0) - time(b.created_at, 0))
  const taken: string[] = []

  return shown.map(session => {
    const id = session.id ?? ''
    const name = pickName(id, taken)
    taken.push(name)
    const summary = session.post_turn_summary ?? session.external_metadata?.post_turn_summary
    const status = STATUS_BY_BUCKET[session.status_bucket ?? ''] ?? 'neu'
    const updated = time(session.updated_at, now)
    const repo = repoOf(session)
    const branch = session.session_context?.outcomes?.[0]?.git_repository?.git_info?.branches?.[0]
    const detail = summary?.status_detail || summary?.recent_action || ''
    const question =
      status === 'frage' ? clip(summary?.needs_action || detail || 'wartet auf dich', 200) : undefined

    return {
      v: 1,
      id,
      name,
      project: repo,
      cwd: branch === undefined ? repo : `${repo} · ${branch}`,
      task: clip(session.title ?? '', 300),
      status,
      // a working session's summary is its previous turn's, so it says nothing now
      activity: status === 'arbeitet' ? '' : clip(detail, 120),
      question,
      startedAt: time(session.created_at, now),
      statusSince: updated,
      lastActivity: updated,
      heartbeat: now,
      agents: [],
      sent: [],
      link: `https://claude.ai/code/${id}`,
      usage: usageOf(session),
    }
  })
}
