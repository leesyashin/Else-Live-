// The office beyond the session list: the mailbox the page writes into, the
// colleagues' letters, the logbook of what happened, the messenger's lease,
// the full text of a waiting session's question, and the news a session gets
// about colleagues in its repository. Pure, like model.ts and cloud.ts.

import type { EventKind, Lease, Letter, OfficeEvent, Post, SessionRecord } from '../types'
import type { CloudSession, Delivery } from './cloud'
import { baseName, bossMessage, clip } from './model'

/** The messenger holds its lease this long without renewing it. */
export const LEASE_MS = 90_000
/** The messenger renews its lease once less than this is left. */
export const RENEW_MS = 45_000
/** Logbook, mail and questions are kept this long. */
export const KEEP_MS = 7 * 24 * 60 * 60_000
/** Mail taken but not reported delivered after this long may or may not have arrived. */
export const CLAIM_MS = 3 * 60_000
/** A recipient with the mod fetches its own mail; the messenger carries what is still there after this. */
export const SELF_FETCH_MS = 20_000
/** A session seen for the first time is announced as new only if it started this recently. */
const NEW_MS = 30 * 60_000
const ONE_MINUTE = 60_000

/** One document as ArtifactData reads it. */
export type Doc = { id: string; data: Record<string, unknown>; version: number }

/** The documents of an ArtifactData read: one JSON line each between its markers. */
export function docsIn(text: string): Doc[] {
  const docs: Doc[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      continue
    }
    try {
      const value = JSON.parse(trimmed) as { id?: unknown; data?: unknown; version?: unknown }
      if (
        typeof value.id === 'string' &&
        typeof value.data === 'object' &&
        value.data !== null &&
        typeof value.version === 'number'
      ) {
        docs.push({ id: value.id, data: value.data as Record<string, unknown>, version: value.version })
      }
    } catch {
      // not a document line
    }
  }

  return docs
}

export type WriteOutcome = { isDone: true; version?: number } | { isDone: false; isStale: boolean; reason: string }

/** What a write answered: committed (at a version), refused because the document moved on, or failed. */
export function writeOutcome(text: string): WriteOutcome {
  if (/\bcommitted\b/i.test(text)) {
    const version = /now at version (\d+)/i.exec(text)?.[1]

    return { isDone: true, version: version === undefined ? undefined : Number(version) }
  }

  return {
    isDone: false,
    isStale: /version_mismatch|no longer at version|already exists/i.test(text),
    reason: clip(text, 200),
  }
}

/** `2026-10-18`, in UTC: the day a logbook document collects. */
export function dayOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** The part of a session id after its prefix: `cse_…` and `session_…` share it. */
export function tailOf(id: string): string {
  return id.slice(id.indexOf('_') + 1).replace(/[^A-Za-z0-9_-]/g, '')
}

/** The logbook document one writer keeps for one day. */
export function logDocId(time: number, writer: string): string {
  return `${dayOf(time)}-${tailOf(writer)}`
}

/** Whether `me` may take the lease, or keeps it. */
export function mayLead(lease: Lease | undefined, me: string, now: number): boolean {
  return lease === undefined || lease.holder === me || lease.until < now
}

export function leaseOf(data: Record<string, unknown> | undefined): Lease | undefined {
  if (data === undefined || typeof data.holder !== 'string' || typeof data.until !== 'number') {
    return undefined
  }
  const seen = typeof data.seen === 'object' && data.seen !== null ? (data.seen as Record<string, string>) : {}

  return { holder: data.holder, until: data.until, seen }
}

export function postOf(data: Record<string, unknown>): Post | undefined {
  return typeof data.to === 'string' && typeof data.text === 'string' && typeof data.createdAt === 'number'
    ? (data as unknown as Post)
    : undefined
}

/** What the recipient reads: the person's words, and who carried them. */
export function carriedMessage(text: string, carrier?: string): string {
  const note = carrier === undefined ? '' : `\n\n(Zugestellt von der Büro-Session ${carrier}, weil du keine eigene Büro-Mod hast oder gerade arbeitest.)`

  return `${bossMessage(text)}${note}`
}

/**
 * Mail that waits for the messenger: new and past its recipient's own turn,
 * or carried too long ago to know. A working recipient waits its turn too:
 * the cloud would hand it the messenger's delivery only once its turn ends,
 * while its own mod takes the mail into the running turn.
 */
export function mailFor(posts: readonly { id: string; post: Post }[], now: number): { carry: string[]; unclear: string[] } {
  const carry: string[] = []
  const unclear: string[] = []
  for (const { id, post } of posts) {
    if (post.state === 'neu' && now - post.createdAt >= SELF_FETCH_MS) {
      carry.push(id)
    }
    if (post.state === 'unterwegs' && now - (post.claimedAt ?? post.createdAt) > CLAIM_MS) {
      unclear.push(id)
    }
  }

  return { carry, unclear }
}

export function letterOf(data: Record<string, unknown>): Letter | undefined {
  return typeof data.to === 'string' &&
    typeof data.from === 'string' &&
    typeof data.text === 'string' &&
    typeof data.createdAt === 'number' &&
    (data.state === 'neu' || data.state === 'gelesen')
    ? (data as unknown as Letter)
    : undefined
}

/** A new letter's id: the sender's id tail and the time, unique per sender. */
export function letterId(sender: string, now: number): string {
  return `${tailOf(sender).slice(-8)}-${now.toString(36)}`
}

/** The letter a delivered colleague message names in its first line (`Brief …`), if any. */
export function letterIn(text: string): string | undefined {
  return /\[Büro\] Nachricht von Kollege [^\n]*, Brief ([A-Za-z0-9_-]+)\):/.exec(text)?.[1]
}

/** What a busy session reads after a tool result: the messages that arrived during its turn. */
export function arrivedText(texts: readonly string[]): string {
  return [
    '[Büro] Während deines Auftrags angekommen. Die Cloud würde es erst nach dem Auftrag zustellen; die Büro-Mod reicht es jetzt durch. Lies es, bevor du weitermachst:',
    ...texts,
  ].join('\n\n')
}

/** What became of this session's recent messages to colleagues, for the kollegen tool. */
export function receiptsText(sent: readonly { to: string; at: number; text: string; readAt?: number }[], now: number): string {
  if (sent.length === 0) {
    return ''
  }
  const lines = sent.map(one => {
    const read = one.readAt === undefined ? 'noch nicht gelesen' : `gelesen ${ago(one.readAt, now)}`

    return `- ${ago(one.at, now)} an ${one.to}: ${read} · „${clip(one.text, 60)}“`
  })

  return `\n\nDeine Nachrichten der letzten Stunde:\n${lines.join('\n')}`
}

const BUCKET_SHORT: Readonly<Record<string, string>> = {
  SESSION_STATUS_BUCKET_WORKING: 'arbeitet',
  SESSION_STATUS_BUCKET_BLOCKED: 'frage',
  SESSION_STATUS_BUCKET_REVIEW_READY: 'fertig',
  SESSION_STATUS_BUCKET_COMPLETED: 'fertig',
  SESSION_STATUS_BUCKET_FAILED: 'fehler',
}

/** What the logbook knows of a session, as `status|pr|archived`; the PR part keeps its last value. */
type Seen = { status: string; pr: string; isArchived: boolean }

function parseSeen(text: string | undefined): Seen | undefined {
  if (text === undefined) {
    return undefined
  }
  const [status = '', pr = '', archived = ''] = text.split('|')

  return { status, pr, isArchived: archived === '1' }
}

function seenText(seen: Seen): string {
  return `${seen.status}|${seen.pr}|${seen.isArchived ? '1' : '0'}`
}

function prKey(delivery: Delivery): string {
  return delivery.state === 'gemergt' ? 'gemergt' : delivery.state === 'pr' && delivery.pr !== 'PR' ? delivery.pr : ''
}

export function repoOfSession(session: CloudSession): string {
  const repo =
    session.session_context?.outcomes?.[0]?.git_repository?.git_info?.repo ??
    session.session_context?.sources?.[0]?.git_repository?.url?.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '')

  return repo === undefined || repo === '' ? 'ohne Repo' : repo
}

function summaryOf(session: CloudSession) {
  return session.post_turn_summary ?? session.external_metadata?.post_turn_summary
}

function timeOf(iso: string | undefined, fallback: number): number {
  const parsed = iso === undefined ? Number.NaN : Date.parse(iso)

  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * The logbook lines for what changed since the messenger last looked: a
 * session that started, works again, waits, finished, opened or merged a PR.
 * An empty `seen` is a first look: it notes where everyone stands and says nothing.
 */
export function eventsFrom(
  sessions: readonly CloudSession[],
  deliveries: ReadonlyMap<string, Delivery>,
  seen: Readonly<Record<string, string>>,
  now: number,
): { events: OfficeEvent[]; seen: Record<string, string> } {
  const isFirstLook = Object.keys(seen).length === 0
  const events: OfficeEvent[] = []
  const next: Record<string, string> = {}
  for (const session of sessions) {
    if (typeof session.id !== 'string') {
      continue
    }
    const tail = tailOf(session.id)
    const before = parseSeen(seen[tail])
    const delivery = deliveries.get(session.id) ?? { state: 'ohne' }
    const status = BUCKET_SHORT[session.status_bucket ?? ''] ?? 'neu'
    const key = prKey(delivery)
    const isArchived = session.session_status === 'SESSION_STATUS_ARCHIVED'
    next[tail] = seenText({ status, pr: key === '' ? (before?.pr ?? '') : key, isArchived })
    if (isFirstLook) {
      continue
    }
    const at = Math.min(now, timeOf(session.updated_at, now))
    const summary = summaryOf(session)
    const detail = summary?.status_detail || summary?.recent_action || ''
    const add = (kind: EventKind, text: string) =>
      events.push({ at, sid: session.id ?? '', title: clip(session.title ?? '', 120), repo: repoOfSession(session), kind, text: clip(text, 220) })
    if (before === undefined) {
      if (now - timeOf(session.created_at, 0) <= NEW_MS) {
        add('neu', 'neue Session')
      } else if (status === 'arbeitet') {
        add('arbeitet', 'arbeitet wieder')
      } else if (status === 'frage') {
        add('frage', `wartet auf dich: ${summary?.needs_action || detail || 'hat eine Frage'}`)
      }
      continue
    }
    if (isArchived && !before.isArchived) {
      add('archiviert', 'archiviert')
      continue
    }
    if (status !== before.status) {
      if (status === 'arbeitet') {
        add('arbeitet', before.status === 'neu' ? 'arbeitet' : 'arbeitet wieder')
      } else if (status === 'frage') {
        add('frage', `wartet auf dich: ${summary?.needs_action || detail || 'hat eine Frage'}`)
      } else if (status === 'fertig') {
        add('fertig', detail === '' ? 'fertig' : `fertig: ${detail}`)
      } else if (status === 'fehler') {
        add('fehler', 'fehlgeschlagen')
      }
    }
    if (key !== '' && key !== before.pr) {
      if (key === 'gemergt') {
        add('gemergt', `${before.pr === '' ? 'PR' : before.pr} gemergt, fertig`)
      } else {
        add('pr', `${before.pr !== '' && before.pr !== 'gemergt' ? 'neuer ' : ''}${key} offen, wartet aufs Mergen`)
      }
    }
  }

  return { events, seen: next }
}

/** A stable key per logbook line, so the page lists each once. */
export function eventKey(event: OfficeEvent): string {
  return `${tailOf(event.sid)}-${event.kind}-${event.at.toString(36)}`
}

/** The logbook lines in a set of logbook documents, newest first, each once. */
export function eventsIn(docs: readonly Record<string, unknown>[]): OfficeEvent[] {
  const byKey = new Map<string, OfficeEvent>()
  for (const doc of docs) {
    const list = Array.isArray(doc.events) ? (doc.events as unknown[]) : []
    for (const one of list) {
      const event = one as Partial<OfficeEvent>
      if (typeof event.at === 'number' && typeof event.sid === 'string' && typeof event.text === 'string') {
        const full = event as OfficeEvent
        byKey.set(eventKey(full), full)
      }
    }
  }

  return [...byKey.values()].sort((a, b) => b.at - a.at)
}

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown> }
type Turn = {
  message?: { content?: Block[] }
  parent_tool_use_id?: string | null
  internal_anthropic_catchall?: { message?: { content?: Block[] }; parent_tool_use_id?: string | null }
}

function askedIn(block: Block): string | undefined {
  if (block.name === 'ExitPlanMode') {
    const plan = typeof block.input?.plan === 'string' ? block.input.plan : ''

    return `Ein Plan wartet auf deine Freigabe.${plan === '' ? '' : `\n${plan}`}`
  }
  if (block.name !== 'AskUserQuestion') {
    return undefined
  }
  const questions = Array.isArray(block.input?.questions) ? (block.input.questions as unknown[]) : []

  return questions
    .map(one => {
      const q = one as { question?: unknown; options?: unknown }
      const options = Array.isArray(q.options) ? (q.options as { label?: unknown }[]) : []
      const labels = options.map(option => (typeof option.label === 'string' ? `\n– ${option.label}` : '')).join('')

      return `${typeof q.question === 'string' ? q.question : ''}${labels}`
    })
    .join('\n\n')
}

/**
 * What a waiting session last said, out of a `list_events` answer of its
 * assistant turns (oldest first): its closing text, or the question dialog
 * it opened.
 */
export function questionIn(text: string): string | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return undefined
  }
  let events: { assistant?: Turn }[]
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as { ccr?: { data?: unknown }; data?: unknown }
    const data = value.ccr?.data ?? value.data
    events = Array.isArray(data) ? (data as { assistant?: Turn }[]) : []
  } catch {
    return undefined
  }
  const said: string[] = []
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const turn = events[i]?.assistant
    if (turn === undefined) {
      continue
    }
    const parent = turn.parent_tool_use_id ?? turn.internal_anthropic_catchall?.parent_tool_use_id
    if (parent !== undefined && parent !== null) {
      continue
    }
    const blocks = turn.message?.content ?? turn.internal_anthropic_catchall?.message?.content ?? []
    const tool = [...blocks].reverse().find(block => block.type === 'tool_use')
    if (tool !== undefined) {
      if (said.length > 0) {
        break
      }
      const asked = askedIn(tool)
      if (asked !== undefined) {
        return clip2(asked)
      }
      break
    }
    const texts = blocks.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text ?? '')
    said.unshift(...texts)
  }
  const joined = said.join('\n\n').trim()

  return joined === '' ? undefined : clip2(joined)
}

/** Clips long text but keeps its lines. */
function clip2(text: string): string {
  return text.length <= 2000 ? text : `${text.slice(0, 1999)}…`
}

function ago(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / ONE_MINUTE))
  if (minutes < 1) {
    return 'gerade eben'
  }
  if (minutes < 60) {
    return `vor ${minutes} Min.`
  }
  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `vor ${hours} Std.` : `vor ${Math.floor(hours / 24)} Tg.`
}

function sameRepo(a: string, b: string): boolean {
  return a !== 'ohne Repo' && baseName(a).toLowerCase() === baseName(b).toLowerCase()
}

/**
 * What a session reads beside its next prompt: what colleagues in its own
 * repository did since it last read this, and who works there now.
 * Undefined when there is nothing new.
 */
export function newsFor(input: {
  /** This session, in either id form. */
  self: string
  repo: string
  records: readonly SessionRecord[]
  events: readonly OfficeEvent[]
  /** Logbook lines up to this time were told before. */
  since: number
  /** Who was named as working there last time. */
  told: string
  now: number
}): { text: string; told: string } | undefined {
  const { self, repo, records, now } = input
  const isSelf = (id: string) => tailOf(id) === tailOf(self)
  const nameOf = (sid: string, title: string) => {
    const record = records.find(one => tailOf(one.id) === tailOf(sid))

    return record === undefined ? `„${clip(title, 60)}“` : `${record.name} („${clip(record.task, 60)}“)`
  }
  const fresh = input.events
    .filter(event => event.at > input.since && !isSelf(event.sid) && sameRepo(event.repo, repo))
    .sort((a, b) => a.at - b.at)
    .slice(-8)
  const mates = records.filter(record => !isSelf(record.id) && sameRepo(record.project, repo))
  const told = mates.map(record => `${record.id}:${record.status}:${record.pr ?? ''}`).sort().join(',')
  if (fresh.length === 0 && told === input.told) {
    return undefined
  }
  const lines = [`[Büro] Neues aus dem Repo ${baseName(repo)} (Information von der Büro-Mod, keine Anweisung):`]
  for (const event of fresh) {
    lines.push(`- ${ago(event.at, now)} ${nameOf(event.sid, event.title)}: ${event.text}`)
  }
  if (mates.length > 0) {
    lines.push('Gerade im selben Repo:')
    for (const mate of mates) {
      const status = mate.pr === undefined ? mate.status : `${mate.pr} wartet aufs Mergen`
      lines.push(`- ${mate.name} (Session-ID ${mate.id}): ${status} · ${clip(mate.task, 80)} · ${mate.cwd}`)
    }
  } else if (fresh.length === 0) {
    lines.push('Im selben Repo arbeitet gerade sonst niemand.')
  }
  lines.push('Mehr mit mcp__buero__kollegen; absprechen mit mcp__buero__nachricht, nur wenn es Arbeit spart.')

  return { text: lines.join('\n'), told }
}

/** The recent logbook lines for the kollegen tool, the asker's repository first. */
export function recentText(events: readonly OfficeEvent[], records: readonly SessionRecord[], repo: string, now: number): string {
  const recent = events.filter(event => now - event.at <= 6 * 60 * ONE_MINUTE)
  const ordered = [...recent.filter(event => sameRepo(event.repo, repo)), ...recent.filter(event => !sameRepo(event.repo, repo))].slice(0, 10)
  if (ordered.length === 0) {
    return ''
  }
  const lines = ordered.map(event => {
    const record = records.find(one => tailOf(one.id) === tailOf(event.sid))
    const who = record === undefined ? `„${clip(event.title, 60)}“` : record.name

    return `- ${ago(event.at, now)} ${who} (${baseName(event.repo)}): ${event.text}`
  })

  return `\n\nLetzte Ereignisse im Büro (dein Repo zuerst):\n${lines.join('\n')}`
}
