// Cloud sessions as the claude-code-remote server lists them, turned into the
// same records the office draws from the files of a PC.

import type { SessionRecord, Status } from '../types'
import { baseName, clip, pickName } from './model'

export const CLOUD_SERVER = 'claude-code-remote'
/** Unread and failed sessions stay in the office this long after their last update. */
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
  /** The person has not opened the session since its last turn. */
  unread?: boolean
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

/**
 * What a finished session's summary says about its work: merged into main
 * (the session is done for good), an open pull request (it waits for the
 * merge), or neither. The cloud keeps no merge state of its own, so this
 * reads the summary the cloud writes after each turn.
 */
export type Delivery = { state: 'gemergt' } | { state: 'pr'; pr: string } | { state: 'ohne' }

/** A session's own pull request as GitHub reports it: what a session with the mod writes about itself. */
export type OwnPr = { number: number; state: 'open' | 'merged' | 'closed'; url?: string }

/** The newest pull request in a `list_pull_requests` answer; a merged one is closed with a merge time. */
export function pullRequestIn(text: string): OwnPr | undefined {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) {
    return undefined
  }
  try {
    const list = JSON.parse(text.slice(start, end + 1)) as { number?: unknown; state?: unknown; merged_at?: unknown; merged?: unknown; html_url?: unknown }[]
    const newest = list
      .filter(one => typeof one.number === 'number')
      .sort((a, b) => (b.number as number) - (a.number as number))[0]
    if (newest === undefined) {
      return undefined
    }
    const isMerged = newest.merged === true || (typeof newest.merged_at === 'string' && newest.merged_at !== '')
    const url = typeof newest.html_url === 'string' ? newest.html_url : undefined

    return { number: newest.number as number, state: isMerged ? 'merged' : newest.state === 'open' ? 'open' : 'closed', url }
  } catch {
    return undefined
  }
}

/** Where a session's work goes: its repository and branch, the head of its pull request. */
export function branchOf(session: CloudSession | undefined): { owner: string; repo: string; branch: string } | undefined {
  const info = session?.session_context?.outcomes?.[0]?.git_repository?.git_info
  const [owner, repo] = (info?.repo ?? '').split('/')
  const branch = info?.branches?.[0]

  return owner && repo && branch ? { owner, repo, branch } : undefined
}

/** The reports sessions wrote about their own pull request, found by session id. */
export type PrReports = ReadonlyMap<string, OwnPr>

export function reportFor(reports: PrReports, id: string): OwnPr | undefined {
  for (const [reporter, pr] of reports) {
    if (sameSession(reporter, id)) {
      return pr
    }
  }

  return undefined
}

const MERGED: readonly RegExp[] = [
  // "PR #2 merged to main", "squash-merged into main"
  /\bmerged\b.{0,30}?\b(?:to|into|in|on|onto)\s+(?:the\s+)?(?:main|master)\b/,
  // "PR #3 in main gemergt", "PR auf main per Merge-Commit 53c14c2 gemergt"
  /\b(?:in|into|auf|nach|to|on)\s+(?:den\s+)?(?:main|master)\b.{0,40}?(?:gemergt|gemerged|eingemergt|merged|übernommen|eingeflossen|gelandet|landed|eingerichtet)/,
  // "PR #2 merged", "PR wurde gemergt"
  /\b(?:pr|pull request)\b(?:\s*#\d+)?\s+(?:wurde\s+|was\s+|is\s+|ist\s+)?(?:squash-|rebase-)?(?:merged|gemergt|gemerged)\b/,
  // "latest main deployed", "main-Deploy durchgelaufen", "Pages-Deploy von PR #23 durchgelaufen"
  /\b(?:main|master)\b.{0,12}?\b(?:deployed\b|deploy\w*\s+(?:durchgelaufen|erfolgreich|succeeded|grün|green)\b)/,
  /\bdeploy\w*\s+(?:von|of|from|für|for|aus)\s+(?:pr|pull request)\b/,
]
/** A clause that plans, offers or doubts a merge does not report one. */
const HEDGED =
  /\b(?:nicht|not|noch|kein\w*|never|unmerged|ready|bereit|await\w*|wait\w*|wartet|warten|pending|needs?|braucht|kann|können|can|could|should|soll\w*|would|will|wird|werden|bevor|before|once|sobald|wenn|if|failed|fehlgeschlagen|blocked|blockiert|conflicts?|konflikt\w*)\b/
const PR_NAMED = /\b(?:pr|pull[- ]?request)\s*#\s*(\d+)/
// "Draft-PR", "PR erstellt", not "PR-Branch-Workflow"
const PR_SAID = /\b(?:draft-?pr|pull[- ]?requests?)\b|\bprs?\b(?![-/])/

/** What GitHub says about the session's own pull request wins; otherwise the summary decides. */
export function deliveryOf(session: CloudSession, own?: OwnPr): Delivery {
  const summary = session.post_turn_summary ?? session.external_metadata?.post_turn_summary
  const said = [summary?.status_detail, summary?.recent_action].filter(Boolean).join('. ').toLowerCase()
  const clauses = said.split(/[;,!?\n]|\.(?:\s|$)|\s[–—-]\s/)
  if (own?.state === 'merged' || clauses.some(clause => !HEDGED.test(clause) && MERGED.some(pattern => pattern.test(clause)))) {
    return { state: 'gemergt' }
  }
  if (own?.state === 'open') {
    return { state: 'pr', pr: `PR #${own.number}` }
  }
  if (own?.state === 'closed') {
    return { state: 'ohne' }
  }
  const named = PR_NAMED.exec(said)?.[1]
  if (named !== undefined) {
    return { state: 'pr', pr: `PR #${named}` }
  }

  return PR_SAID.test(said) || session.status_bucket === 'SESSION_STATUS_BUCKET_REVIEW_READY'
    ? { state: 'pr', pr: 'PR' }
    : { state: 'ohne' }
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

/**
 * Working and waiting sessions always have a desk; a finished one only while
 * its pull request waits for the merge, or for a day while unread. Merged into
 * main, a session is done for good and leaves the office.
 */
function isShown(session: CloudSession, delivery: Delivery, now: number): boolean {
  if (typeof session.id !== 'string' || session.session_status === 'SESSION_STATUS_ARCHIVED') {
    return false
  }
  const bucket = session.status_bucket
  if (bucket === 'SESSION_STATUS_BUCKET_WORKING' || bucket === 'SESSION_STATUS_BUCKET_BLOCKED') {
    return true
  }
  if (delivery.state === 'gemergt') {
    return false
  }
  if (delivery.state === 'pr') {
    return true
  }
  const isRecent = now - time(session.updated_at, 0) <= DAY_MS
  const isFinished = bucket === 'SESSION_STATUS_BUCKET_COMPLETED' || bucket === 'SESSION_STATUS_BUCKET_REVIEW_READY'

  return isRecent && (!isFinished || session.unread === true)
}

/** The sessions worth a desk, oldest first: see isShown. */
export function cloudRecords(sessions: readonly CloudSession[], now: number, reports: PrReports = new Map()): SessionRecord[] {
  const shown = sessions
    .map(session => ({ session, delivery: deliveryOf(session, reportFor(reports, session.id ?? '')) }))
    .filter(({ session, delivery }) => isShown(session, delivery, now))
    .sort((a, b) => time(a.session.created_at, 0) - time(b.session.created_at, 0))
  const taken: string[] = []

  return shown.map(({ session, delivery }) => {
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
      pr: status === 'fertig' && delivery.state === 'pr' ? delivery.pr : undefined,
    }
  })
}

/** The fields of a session the office draws: what a snapshot keeps of it. */
export function trimSession(session: CloudSession): CloudSession {
  const outcome = session.session_context?.outcomes?.[0]?.git_repository?.git_info
  const source = session.session_context?.sources?.[0]?.git_repository?.url
  const summary = session.post_turn_summary ?? session.external_metadata?.post_turn_summary

  return {
    id: session.id,
    title: session.title,
    session_status: session.session_status,
    status_bucket: session.status_bucket,
    unread: session.unread,
    created_at: session.created_at,
    updated_at: session.updated_at,
    session_context: {
      outcomes: outcome === undefined ? [] : [{ git_repository: { git_info: { repo: outcome.repo, branches: outcome.branches?.slice(0, 1) } } }],
      sources: source === undefined ? [] : [{ git_repository: { url: source } }],
    },
    post_turn_summary: summary,
    external_metadata: {
      context_usage: session.external_metadata?.context_usage,
      usage: { cost_usd: session.external_metadata?.usage?.cost_usd },
    },
  }
}
