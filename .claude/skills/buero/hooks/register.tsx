// The office mod. Every session writes what it is doing to a small file of its
// own under `<config dir>/buero/sessions/`; a session that opens the pane
// (`/buero`) reads all of them and draws the office.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { EventKind, OfficeEvent, OfficeView, Post, SessionRecord, Status, WorkerView } from '../types'
import { describeOffice, drawOffice } from './art'
import type { CloudSession, OwnPr } from './cloud'
import {
  CLOUD_SERVER,
  branchOf,
  cloudRecords,
  deliveryOf,
  pullRequestIn,
  parseSessionList,
  reportFor,
  sameSession,
  trimSession,
} from './cloud'
import type { Doc, WriteOutcome } from './post'
import {
  LEASE_MS,
  RENEW_MS,
  carriedMessage,
  dayOf,
  docsIn,
  eventKey,
  eventsFrom,
  eventsIn,
  leaseOf,
  logDocId,
  mailFor,
  mayLead,
  newsFor,
  postOf,
  questionIn,
  recentText,
  repoOfSession,
  tailOf,
  writeOutcome,
  KEEP_MS,
} from './post'
import {
  GONE_MS,
  HEARTBEAT_MS,
  MOOD_ICON,
  baseName,
  bossMessage,
  buildOffice,
  clip,
  colleagueMessage,
  colleaguesText,
  describeTool,
  isActive,
  limitText,
  moodLabel,
  moodOf,
  pickName,
  resolveRecipient,
  sendBudget,
  teamPrompt,
  withSent,
} from './model'

const PANE = 'buero'
const READ_EVERY_MS = 3000
/** The cloud's session list is asked at most this often. */
const CLOUD_EVERY_MS = 10_000
/** The office page whose database the cloud sessions feed. */
const OFFICE_URL = 'https://claude.ai/artifact/94pH1R4YMfQgxPUeghXbiK'
/** A cloud session looks after the office page this often: its mail, its desk, and as messenger the rest. */
const TICK_MS = 15_000
/** A session that is not the messenger reads the session list this rarely. */
const LIST_EVERY_MS = 60_000
/** The logbook a session reads its news from is refreshed this often. */
const NEWS_EVERY_MS = 60_000
/** The messenger clears out old mail, logbook days and desks this often. */
const PRUNE_EVERY_MS = 10 * 60_000
/** Waiting sessions whose question the messenger fetches per round, at most. */
const QUESTIONS_PER_TICK = 2
/** Mail the messenger carries per round, at most. */
const CARRIES_PER_TICK = 3
/** On its first prompt a session hears what happened in its repository this far back. */
const FIRST_NEWS_MS = 6 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000
/** GitHub is asked about this session's own pull request at most this often. */
const PR_EVERY_MS = 60_000
const GITHUB_SERVER = 'github'
/** An ask that is still open after this long is a permission card for the person. */
const ASK_SETTLE_MS = 1500
const LIVE_AGENT = new Set(['pending', 'running', 'waiting', 'idle'])

const office = atom({ plugin: 'buero', key: 'office' } as const, null)
const selected = atom({ plugin: 'buero', key: 'selected' } as const, null)
const notice = atom({ plugin: 'buero', key: 'notice' } as const, null)

type $ = EngineInterface

let perHour = 5
let stuckMs = 5 * 60_000
let self: SessionRecord | undefined
let dir = ''
let file = ''
let isWriting = false
let isDirty = false
let heartbeat: Timer | undefined
let reader: Timer | undefined
let lastSignature = ''
let pendingAsk: string | undefined
/** What the worker goes back to once the person answered a question or card. */
let resumeStatus: Status = 'arbeitet'
/** The last record that parsed per file, for a read that meets a write. */
const lastGood = new Map<string, SessionRecord>()
/** This session's id in the cloud (`cse_…`); empty on a PC. */
let cloudSelf = ''
let cloudCache: { at: number; sessions: CloudSession[]; records: SessionRecord[] } | undefined
/** Why the cloud's list could not be read last time, for the kollegen tool. */
let cloudError: string | undefined
/** This session's own pull request, as GitHub last reported it. */
let ownPr: OwnPr | undefined
let ownPrAt = 0

/** A document of the office page only this session writes, whole, at the version it last saw. */
type Owned = { collection: string; id: string; version: number | undefined; isKnown: boolean; last: string }

let ticker: Timer | undefined
let isTicking = false
/** Whether this session is the messenger now: it keeps the list, the logbook and the mail. */
let isLeader = false
let listDoc: Owned | undefined
let deskDoc: Owned | undefined
/** This session's logbook documents, one per day, with what it noted there. */
const logs = new Map<string, { doc: Owned; events: OfficeEvent[]; isLoaded: boolean }>()
/** A waiting session's `updated_at` when its question was last fetched. */
const asked = new Map<string, string>()
let prunedAt = 0
/** The logbook of today and yesterday, as last read, for the news. */
let news: OfficeEvent[] = []
let newsAt = 0
/** Logbook lines up to this time were told already; the colleagues as last named. */
let newsSince = 0
let newsTold = ''

async function safe($: $, label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (error) {
    $.ui.log(`buero: ${label}: ${String(error)}`, { to: 'debug' })
  }
}

function change(patch: Partial<SessionRecord>): void {
  if (self !== undefined) {
    self = { ...self, ...patch }
  }
}

/** Writes this session's file; writes asked for meanwhile fold into one more. */
async function save($: $): Promise<void> {
  if (self === undefined) {
    return
  }
  if (isWriting) {
    isDirty = true

    return
  }
  isWriting = true
  try {
    do {
      isDirty = false
      change({ heartbeat: await $.clock.now() })
      await $.fs.write(file, JSON.stringify(self))
    } while (isDirty)
  } catch (error) {
    $.ui.log(`buero: save: ${String(error)}`, { to: 'debug' })
  } finally {
    isWriting = false
  }
}

async function setStatus($: $, status: Status, patch: Partial<SessionRecord> = {}): Promise<void> {
  if (self === undefined) {
    return
  }
  const now = await $.clock.now()
  change({
    status,
    statusSince: self.status === status ? self.statusSince : now,
    lastActivity: now,
    ...patch,
  })
  await save($)
}

/** Sends the worker to the boss office, remembering what it was doing. */
async function ask($: $, status: 'frage' | 'freigabe', question: string): Promise<void> {
  if (self === undefined) {
    return
  }
  if (self.status !== 'frage' && self.status !== 'freigabe') {
    resumeStatus = self.status === 'fehler' ? 'arbeitet' : self.status
  }
  await setStatus($, status, { question })
}

async function dataDir($: $): Promise<string> {
  const config = await $.env.get('CLAUDE_CONFIG_DIR')
  if (config !== undefined && config !== '') {
    return `${trimEnd(config)}/buero`
  }
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'

  return `${trimEnd(home)}/.claude/buero`
}

async function readRecords($: $, now: number): Promise<SessionRecord[]> {
  const folder = `${dir}/sessions`
  const entries = await $.fs.list(folder).catch(() => [])
  const fresh = entries.filter(
    entry =>
      entry.kind === 'file' &&
      entry.name.endsWith('.json') &&
      now - entry.mtimeMs <= GONE_MS + HEARTBEAT_MS,
  )
  const records = await Promise.all(
    fresh.map(async entry => {
      const text = await $.fs.read(`${folder}/${entry.name}`).catch(() => '')
      const parsed = parseRecord(text)
      if (parsed !== undefined) {
        lastGood.set(entry.name, parsed)
      }

      return parsed ?? lastGood.get(entry.name)
    }),
  )
  const found = records.filter((record): record is SessionRecord => record !== undefined)
  if (self === undefined) {
    return found
  }
  const mine = self

  return [...found.filter(record => record.id !== mine.id), mine]
}

function where(): string {
  return cloudSelf === '' ? 'auf diesem PC' : 'in deiner Claude-Code-Cloud'
}

function textOf(answer: { content: readonly unknown[] }): string {
  return answer.content
    .map(block => {
      const text = (block as { text?: unknown }).text

      return typeof text === 'string' ? text : ''
    })
    .join('\n')
}

/** A long answer is saved to a file and its text names the file. */
async function unsaved($: $, text: string): Promise<string> {
  const saved = /saved to (\S+\.(?:txt|json))/.exec(text)?.[1]

  return saved === undefined ? text : $.fs.read(saved)
}

/** The cloud's sessions, asked at most every `maxAge`; undefined on a PC. */
async function cloudList($: $, now: number, maxAge = CLOUD_EVERY_MS): Promise<SessionRecord[] | undefined> {
  if (cloudSelf === '') {
    return undefined
  }
  if (cloudCache !== undefined && now - cloudCache.at < maxAge) {
    return cloudCache.records
  }
  try {
    const answer = await $.mcp.call(CLOUD_SERVER, 'list_sessions', { mine: true, limit: 25 })
    const text = await unsaved($, textOf(answer))
    if (answer.isError) {
      throw new Error(clip(text, 200))
    }
    const sessions = parseSessionList(text)
    if (sessions.length === 0) {
      throw new Error(`keine Sessions in der Antwort: ${clip(text, 200)}`)
    }
    await checkOwnPr($, sessions, now)
    const reports = new Map(ownPr === undefined ? [] : [[cloudSelf, ownPr] as const])
    cloudCache = { at: now, sessions, records: cloudRecords(sessions, now, reports) }
    cloudError = undefined
  } catch (error) {
    cloudError = clip(String(error), 300)
    $.ui.log(`buero: list_sessions: ${cloudError}`, { to: 'debug' })
  }

  return cloudCache?.records
}

/**
 * Asks GitHub about the pull request of this session's branch, so the office
 * knows it is waiting for the merge or merged, whatever the summary says.
 */
async function checkOwnPr($: $, sessions: readonly CloudSession[], now: number): Promise<void> {
  const place = branchOf(sessions.find(session => sameSession(session.id ?? '', cloudSelf)))
  if (place === undefined || now - ownPrAt < PR_EVERY_MS) {
    return
  }
  ownPrAt = now
  try {
    const answer = await $.mcp.call(GITHUB_SERVER, 'list_pull_requests', {
      owner: place.owner,
      repo: place.repo,
      head: `${place.owner}:${place.branch}`,
      state: 'all',
      perPage: 5,
      fields: ['number', 'state', 'merged', 'merged_at', 'html_url'],
    })
    if (!answer.isError) {
      ownPr = pullRequestIn(textOf(answer)) ?? ownPr
    }
  } catch (error) {
    $.ui.log(`buero: list_pull_requests: ${String(error)}`, { to: 'debug' })
  }
}

/** Everyone in the office: the cloud's sessions, or the files of this PC. */
async function officeRecords($: $, now: number): Promise<SessionRecord[]> {
  const cloud = await cloudList($, now)
  if (cloud === undefined) {
    return readRecords($, now)
  }
  const mine = self

  return cloud.map(record =>
    mine !== undefined && sameSession(record.id, cloudSelf)
      ? { ...record, agents: mine.agents, sent: mine.sent, receivedAt: mine.receivedAt, receivedText: mine.receivedText }
      : record,
  )
}

function selfIdIn(records: readonly SessionRecord[]): string | undefined {
  return records.find(record => sameSession(record.id, cloudSelf))?.id ?? self?.id
}

/** Delivers a message to another session; resolves the reason when it was not. */
async function deliver($: $, sessionId: string, text: string): Promise<string | undefined> {
  if (cloudSelf !== '' && sessionId.startsWith('session_')) {
    try {
      // `next` joins a running turn without stopping it; an idle session starts one
      const answer = await $.mcp.call(CLOUD_SERVER, 'send_message', { session_id: sessionId, message: text, priority: 'next' })

      return answer.isError ? clip(textOf(answer), 200) || 'unbekannter Fehler' : undefined
    } catch (error) {
      return clip(String(error), 200)
    }
  }
  const sent = await $.session.send({ to: { sessionId }, text })

  return sent.isDelivered ? undefined : sent.reason
}

// The office page's database, through ArtifactData: the session list, the
// logbook, the mail the person writes on the page and the messenger's lease.

async function db($: $, action: string, fields: Record<string, unknown>): Promise<string> {
  const ran = (await $.tool.call({ tool: 'ArtifactData', action, url: OFFICE_URL, ...fields } as never)) as {
    text?: unknown
    result?: unknown
    deny?: unknown
  }

  return unsaved($, String(ran.text ?? (typeof ran.result === 'string' ? ran.result : undefined) ?? ran.deny ?? ''))
}

async function dbGet($: $, collection: string, docId: string): Promise<Doc | undefined> {
  return docsIn(await db($, 'get', { collection, doc_id: docId })).find(doc => doc.id === docId)
}

async function dbQuery($: $, collection: string, query: Record<string, unknown>): Promise<Doc[]> {
  return docsIn(await db($, 'query', { collection, query }))
}

async function dbWrite(
  $: $,
  action: 'set' | 'update' | 'delete',
  collection: string,
  docId: string,
  data: Record<string, unknown> | undefined,
  version: number | undefined,
): Promise<WriteOutcome> {
  const text = await db($, action, {
    collection,
    doc_id: docId,
    ...(data === undefined ? {} : { data }),
    ...(version === undefined ? {} : { if_version: version }),
  })

  return writeOutcome(text)
}

function owned(collection: string, id: string): Owned {
  return { collection, id, version: undefined, isKnown: false, last: '' }
}

/**
 * Writes a document only this session writes, whole, when `signature`
 * changed. A reload forgets its version, so it reads it again when unsure.
 */
async function keep($: $, doc: Owned, data: Record<string, unknown>, signature = JSON.stringify(data)): Promise<void> {
  if (signature === doc.last) {
    return
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!doc.isKnown) {
      doc.version = (await dbGet($, doc.collection, doc.id))?.version
      doc.isKnown = true
    }
    const outcome = await dbWrite($, 'set', doc.collection, doc.id, data, doc.version)
    if (outcome.isDone) {
      doc.version = outcome.version ?? (doc.version ?? 0) + 1
      doc.last = signature

      return
    }
    if (!outcome.isStale) {
      throw new Error(outcome.reason)
    }
    doc.isKnown = false
  }
}

function idOfSelf(): string {
  return `session_${tailOf(cloudSelf)}`
}

function ownSession(): CloudSession | undefined {
  return cloudCache?.sessions.find(session => sameSession(session.id ?? '', cloudSelf))
}

/** Adds lines to this session's logbook; the next round writes them. */
function addEvents(events: readonly OfficeEvent[]): void {
  for (const event of events) {
    const day = dayOf(event.at)
    let log = logs.get(day)
    if (log === undefined) {
      log = { doc: owned('logbuch', logDocId(event.at, cloudSelf)), events: [], isLoaded: false }
      logs.set(day, log)
    }
    if (!log.events.some(one => eventKey(one) === eventKey(event))) {
      log.events.push(event)
    }
  }
}

/** Notes something this session did, which only it knows: a push, a PR, a message. */
async function note($: $, kind: EventKind, text: string): Promise<void> {
  if (cloudSelf === '') {
    return
  }
  const mine = ownSession()
  addEvents([
    {
      at: await $.clock.now(),
      sid: idOfSelf(),
      title: clip(mine?.title ?? self?.task ?? '', 120),
      repo: mine === undefined ? (self?.project ?? 'ohne Repo') : repoOfSession(mine),
      kind,
      text: clip(text, 220),
    },
  ])
}

/** Writes the logbook days with new lines; a day that is over and written is let go. */
async function flushLogs($: $, now: number): Promise<void> {
  for (const [day, log] of logs) {
    if (!log.isLoaded) {
      // a reload starts with nothing in hand: keep what this session wrote before
      const found = await dbGet($, 'logbuch', log.doc.id)
      const before = Array.isArray(found?.data.events) ? (found.data.events as OfficeEvent[]) : []
      const known = new Set(before.map(eventKey))
      log.events = [...before, ...log.events.filter(event => !known.has(eventKey(event)))]
      log.doc.version = found?.version
      log.doc.isKnown = true
      log.isLoaded = true
    }
    log.events = log.events.sort((a, b) => a.at - b.at).slice(-500)
    await keep($, log.doc, { day, writer: cloudSelf, events: log.events })
    if (day !== dayOf(now)) {
      logs.delete(day)
    }
  }
}

/** This session's desk on the page: its own pull request and the messages it sent. */
async function writeDesk($: $, now: number): Promise<void> {
  if (self === undefined) {
    return
  }
  deskDoc ??= owned('sessions', tailOf(cloudSelf))
  const sent = self.sent.filter(one => now - one.at < DAY_MS).slice(-10)
  const data = { sid: idOfSelf(), writer: cloudSelf, ...(ownPr === undefined ? {} : { pr: ownPr }), sent }
  await keep($, deskDoc, { ...data, writtenAt: now }, JSON.stringify(data))
}

/**
 * Delivers one letter: the recipient itself takes it in as a prompt; the
 * messenger sends it on through the cloud. Taken first, so no one carries it twice.
 */
async function carry($: $, doc: Doc, post: Post, via: 'selbst' | 'bote'): Promise<void> {
  const claimedAt = await $.clock.now()
  const claimed = await dbWrite($, 'update', 'post', doc.id, { state: 'unterwegs', by: cloudSelf, via, claimedAt }, doc.version)
  if (!claimed.isDone) {
    return
  }
  let error: string | undefined
  if (via === 'selbst') {
    try {
      const entered = await $.prompt.submit({ text: bossMessage(post.text) })
      error = 'drop' in entered && entered.drop !== undefined ? clip(String(entered.drop), 200) : undefined
    } catch (failure) {
      error = clip(String(failure), 200)
    }
  } else {
    const me = cloudCache?.records.find(record => sameSession(record.id, cloudSelf))
    error = await deliver($, post.to, carriedMessage(post.text, me === undefined ? cloudSelf : `${me.name} (${me.id})`))
  }
  const deliveredAt = await $.clock.now()
  await dbWrite(
    $,
    'update',
    'post',
    doc.id,
    error === undefined ? { state: 'zugestellt', deliveredAt } : { state: 'fehler', error },
    claimed.version ?? doc.version + 1,
  )
}

/** Mail for this session: taken in while it is not busy; a busy one gets it from the messenger. */
async function fetchOwnMail($: $): Promise<void> {
  if (self?.status === 'arbeitet') {
    return
  }
  const mine = await dbQuery($, 'post', {
    where: [
      ['to', 'in', [idOfSelf(), cloudSelf]],
      ['state', '==', 'neu'],
    ],
    limit: 5,
  })
  for (const doc of mine.sort((a, b) => Number(a.data.createdAt) - Number(b.data.createdAt))) {
    const post = postOf(doc.data)
    if (post !== undefined) {
      await carry($, doc, post, 'selbst')
    }
  }
}

/** The messenger's mail round: what recipients did not fetch themselves, and what got stuck. */
async function carryMail($: $, sessions: readonly CloudSession[], now: number): Promise<void> {
  const open = await dbQuery($, 'post', { where: [['state', 'in', ['neu', 'unterwegs']]], limit: 50 })
  const letters = open.flatMap(doc => {
    const post = postOf(doc.data)

    return post === undefined ? [] : [{ id: doc.id, doc, post }]
  })
  const working = new Set(
    sessions.filter(session => session.status_bucket === 'SESSION_STATUS_BUCKET_WORKING').map(session => session.id ?? ''),
  )
  const { carry: due, unclear } = mailFor(letters, working, now)
  for (const id of unclear) {
    const letter = letters.find(one => one.id === id)
    if (letter !== undefined) {
      await dbWrite($, 'update', 'post', id, { state: 'unklar' }, letter.doc.version)
    }
  }
  const others = due
    .map(id => letters.find(one => one.id === id))
    .filter(letter => letter !== undefined && !sameSession(letter.post.to, cloudSelf))
    .slice(0, CARRIES_PER_TICK)
  for (const letter of others) {
    if (letter !== undefined) {
      await carry($, letter.doc, letter.post, 'bote')
    }
  }
}

/** The full text of each waiting session's question, fetched once per question. */
async function fetchQuestions($: $, sessions: readonly CloudSession[], now: number): Promise<void> {
  const waiting = sessions.filter(
    session =>
      typeof session.id === 'string' &&
      session.status_bucket === 'SESSION_STATUS_BUCKET_BLOCKED' &&
      session.session_status !== 'SESSION_STATUS_ARCHIVED',
  )
  const stored = await dbQuery($, 'fragen', { limit: 100 })
  for (const doc of stored) {
    if (!waiting.some(session => tailOf(session.id ?? '') === doc.id)) {
      await dbWrite($, 'delete', 'fragen', doc.id, undefined, doc.version)
    }
  }
  let fetched = 0
  for (const session of waiting) {
    const id = session.id ?? ''
    const stamp = session.updated_at ?? ''
    const doc = stored.find(one => one.id === tailOf(id))
    if (fetched >= QUESTIONS_PER_TICK || asked.get(id) === stamp || doc?.data.updatedAt === stamp) {
      continue
    }
    fetched += 1
    asked.set(id, stamp)
    const answer = await $.mcp.call(CLOUD_SERVER, 'list_events', { session_id: id, kinds: ['assistant'], limit: 100 })
    const question = answer.isError ? undefined : questionIn(await unsaved($, textOf(answer)))
    if (question !== undefined) {
      await dbWrite($, 'set', 'fragen', tailOf(id), { sid: id, text: question, updatedAt: stamp, at: now }, doc?.version)
    }
  }
}

/** Mail, logbook days, desks and lists older than a week go. */
async function prune($: $, now: number): Promise<void> {
  const old = now - KEEP_MS
  const rounds: [string, Record<string, unknown>][] = [
    ['post', { where: [['createdAt', '<', old]], limit: 50 }],
    ['logbuch', { where: [['day', '<', dayOf(old)]], limit: 50 }],
    ['sessions', { where: [['writtenAt', '<', old]], limit: 50 }],
  ]
  for (const [collection, query] of rounds) {
    for (const doc of await dbQuery($, collection, query)) {
      await dbWrite($, 'delete', collection, doc.id, undefined, doc.version)
    }
  }
}

/**
 * The messenger's round: the session list for the page, the logbook lines
 * for what changed, waiting sessions' questions, the mail. Resolves what the
 * logbook knows now.
 */
async function runOffice($: $, now: number, seen: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  await cloudList($, now)
  const sessions = cloudCache?.sessions
  if (sessions === undefined) {
    return { ...seen }
  }
  listDoc ??= owned('buero', 'liste')
  const trimmed = sessions.map(trimSession)
  await keep($, listDoc, { writtenAt: now, writer: cloudSelf, sessions: trimmed }, JSON.stringify(trimmed))
  const desks = await dbQuery($, 'sessions', { limit: 200 })
  const reports = new Map<string, OwnPr>()
  for (const desk of desks) {
    const pr = desk.data.pr as OwnPr | undefined
    if (typeof desk.data.writer === 'string' && typeof pr?.number === 'number') {
      reports.set(desk.data.writer, pr)
    }
  }
  if (ownPr !== undefined) {
    reports.set(cloudSelf, ownPr)
  }
  const deliveries = new Map(sessions.map(session => [session.id ?? '', deliveryOf(session, reportFor(reports, session.id ?? ''))]))
  const told = eventsFrom(sessions, deliveries, seen, now)
  addEvents(told.events)
  await safe($, 'fragen', () => fetchQuestions($, sessions, now))
  await safe($, 'post', () => carryMail($, sessions, now))
  if (now - prunedAt > PRUNE_EVERY_MS) {
    prunedAt = now
    await safe($, 'aufräumen', () => prune($, now))
  }

  return told.seen
}

/**
 * One session at a time is the messenger: it holds a lease in the page's
 * database and renews it while it runs; when it stops, the next one takes over.
 */
async function lead($: $, now: number): Promise<void> {
  const found = await dbGet($, 'leitung', 'bote')
  const lease = leaseOf(found?.data)
  if (!mayLead(lease, cloudSelf, now)) {
    isLeader = false

    return
  }
  let version = found?.version
  const seen = lease?.seen ?? {}
  if (lease?.holder !== cloudSelf || lease.until - now < RENEW_MS) {
    const claimed = await dbWrite($, 'set', 'leitung', 'bote', { holder: cloudSelf, until: now + LEASE_MS, seen }, version)
    if (!claimed.isDone || claimed.version === undefined) {
      isLeader = false

      return
    }
    version = claimed.version
  }
  isLeader = true
  const next = await runOffice($, now, seen)
  if (JSON.stringify(next) !== JSON.stringify(seen)) {
    const kept = await dbWrite($, 'set', 'leitung', 'bote', { holder: cloudSelf, until: now + LEASE_MS, seen: next }, version)
    isLeader = kept.isDone
  }
}

/** Reads the logbook of today and yesterday, for the news a session gets with its next prompt. */
async function readNews($: $, now: number): Promise<void> {
  if (now - newsAt < NEWS_EVERY_MS) {
    return
  }
  newsAt = now
  const docs = await dbQuery($, 'logbuch', { where: [['day', '>=', dayOf(now - DAY_MS)]], limit: 100 })
  news = eventsIn(docs.map(doc => doc.data))
}

/** A cloud session's round: messenger if it can be, its own mail, its desk, its logbook, its news. */
async function tick($: $): Promise<void> {
  if (cloudSelf === '' || isTicking) {
    return
  }
  isTicking = true
  try {
    const now = await $.clock.now()
    await safe($, 'bote', () => lead($, now))
    if (!isLeader) {
      await cloudList($, now, LIST_EVERY_MS)
    }
    await safe($, 'eigene post', () => fetchOwnMail($))
    await safe($, 'schreibtisch', () => writeDesk($, now))
    await safe($, 'logbuch', () => flushLogs($, now))
    await safe($, 'neuigkeiten', () => readNews($, now))
  } finally {
    isTicking = false
  }
}

/** What colleagues in this session's repository did since its last prompt; undefined when nothing. */
async function newsContext($: $): Promise<string | undefined> {
  const mine = ownSession()
  if (mine === undefined) {
    return undefined
  }
  const now = await $.clock.now()
  const told = newsFor({
    self: cloudSelf,
    repo: repoOfSession(mine),
    records: cloudCache?.records ?? [],
    events: news,
    since: newsSince === 0 ? now - FIRST_NEWS_MS : newsSince,
    told: newsTold,
    now,
  })
  newsSince = Math.max(newsSince, ...news.map(event => event.at))
  if (told === undefined) {
    return undefined
  }
  newsTold = told.told

  return told.text
}

/** Takes this session's desk: a new record, or the one a reload left behind. */
async function join($: $): Promise<void> {
  dir = await dataDir($)
  cloudSelf = (await $.env.get('CLAUDE_CODE_REMOTE_SESSION_ID')) ?? ''
  const id = await $.session.id()
  file = `${dir}/sessions/${id}.json`
  const now = await $.clock.now()
  const root = await $.session.root()
  const previous = parseRecord(await $.fs.read(file).catch(() => ''))
  self = undefined
  const others = (await readRecords($, now)).filter(record => record.id !== id && isActive(record, now))
  self =
    previous !== undefined && previous.ended !== true
      ? { ...previous, cwd: root, project: baseName(root), heartbeat: now }
      : {
          v: 1,
          id,
          name: previous?.name ?? pickName(id, others.map(record => record.name)),
          project: baseName(root),
          cwd: root,
          task: '',
          status: 'neu',
          activity: '',
          startedAt: now,
          statusSince: now,
          lastActivity: now,
          heartbeat: now,
          agents: [],
          sent: [],
        }
  await save($)
}

async function beat($: $): Promise<void> {
  if (self === undefined) {
    return
  }
  await safe($, 'agents', async () => {
    const agents = await $.agent.list()
    change({
      agents: agents
        .filter(agent => LIVE_AGENT.has(agent.status))
        .slice(0, 12)
        .map(agent => ({
          id: agent.id,
          type: agent.type,
          description: clip(agent.description, 60),
          status: agent.status,
        })),
    })
  })
  await save($)
}

async function refresh($: $): Promise<void> {
  await safe($, 'refresh', async () => {
    const now = await $.clock.now()
    const records = await officeRecords($, now)
    const clock = new Date(now)
    const view = buildOffice(records, now, stuckMs, selfIdIn(records), clock.getHours() * 60 + clock.getMinutes())
    const signature = JSON.stringify(view)
    if (signature === lastSignature) {
      return
    }
    lastSignature = signature
    await $.state.set({ plugin: 'buero', key: 'office' }, view)
  })
}

function startReader($: $): void {
  if (reader !== undefined) {
    return
  }
  void refresh($)
  reader = $.clock.every(READ_EVERY_MS, () => void refresh($))
}

async function sendFromBoss($: $, worker: WorkerView, body: string): Promise<void> {
  const trimmed = body.trim()
  if (trimmed === '') {
    return
  }
  const refused = await deliver($, worker.id, bossMessage(trimmed))
  if (refused === undefined && self !== undefined) {
    const now = await $.clock.now()
    change({
      sent: withSent(self.sent, {
        at: now,
        to: worker.id,
        toId: worker.id,
        text: clip(trimmed, 200),
        counts: false,
        fromBoss: true,
      }),
    })
    void save($)
  }
  await $.state.set(
    { plugin: 'buero', key: 'notice' },
    refused === undefined ? `Nachricht an ${worker.name} gesendet.` : `Nicht zugestellt: ${refused}`,
  )
  void refresh($)
}

export const register: Register = (on, options) => {
  perHour = positive(options.nachrichtenProStunde, 5)
  stuckMs = positive(options.haengtNachMinuten, 5) * 60_000

  on('session.start', async ($, e, next) => {
    await safe($, 'start', async () => {
      await $.command.register({
        name: 'buero',
        description: 'Öffnet das Büro: alle Claude-Code-Sessions dieses PCs als Mitarbeiter',
      })
      await $.tool.register({
        name: 'kollegen',
        description:
          'Zeigt die anderen Claude-Code-Sessions (Büro-Kollegen): Name, Session-ID, Projekt, Auftrag, Status.',
        inputSchema: { type: 'object', properties: {} },
        isDeferred: false,
      })
      await $.tool.register({
        name: 'nachricht',
        description: `Schickt einem Büro-Kollegen (einer anderen Claude-Code-Session) eine kurze Nachricht. Höchstens ${perHour} pro Stunde; nur wenn es echte Arbeit spart.`,
        inputSchema: {
          type: 'object',
          properties: {
            an: { type: 'string', description: 'Session-ID oder Name des Kollegen, wie mcp__buero__kollegen sie zeigt.' },
            text: { type: 'string', description: 'Die Nachricht: kurz und konkret.' },
          },
          required: ['an', 'text'],
        },
        isDeferred: false,
      })
      await join($)
      heartbeat?.cancel()
      heartbeat = $.clock.every(HEARTBEAT_MS, () => void beat($))
      ticker?.cancel()
      if (cloudSelf !== '') {
        ticker = $.clock.every(TICK_MS, () => void tick($))
        $.clock.after(5000, () => void tick($))
      }
      if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
        startReader($)
      }
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await safe($, 'end', async () => {
      change({ ended: true })
      await save($)
      if (e.reason === 'clear') {
        // the process goes on under a new session id, with no session.start
        self = undefined
        $.clock.after(1000, () => void safe($, 'rejoin', () => join($)))
      }
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    let context: string | undefined
    await safe($, 'prompt', async () => {
      if (self === undefined) {
        await join($)
      }
      if (e.command === undefined && e.isMeta !== true && e.text.trim() !== '') {
        change({ task: clip(e.text, 300) })
      }
      if (cloudSelf !== '' && e.command === undefined && e.isMeta !== true) {
        context = await newsContext($)
      }
    })

    return next(context === undefined ? e : { ...e, context: [...(e.context ?? []), context] })
  })

  on('turn.start', async ($, e, next) => {
    await safe($, 'turn start', async () => {
      if (e.agentId !== undefined) {
        change({ lastActivity: await $.clock.now() })
        void beat($)

        return
      }
      if (e.text.trim() !== '') {
        change({ task: clip(e.text, 300) })
      }
      await setStatus($, 'arbeitet', { activity: 'denkt nach', question: undefined })
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await safe($, 'turn complete', async () => {
      if (e.agentId !== undefined) {
        void beat($)

        return
      }
      const activity =
        e.reason === 'aborted' ? 'abgebrochen' : e.reason === 'error' ? 'Fehler beim Modell-Aufruf' : ''
      await setStatus($, e.reason === 'error' ? 'fehler' : 'fertig', { activity, question: undefined })
    })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // the mod's own reads and writes of the office page are no work of the session
    if (self === undefined || next.origin.plugin === 'buero') {
      return next(e)
    }
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const isQuestion = e.agentId === undefined && (tool === 'AskUserQuestion' || tool === 'ExitPlanMode')
    await safe($, 'tool start', async () => {
      const doing = describeTool(tool, input)
      change({
        lastActivity: await $.clock.now(),
        activity: e.agentId === undefined ? doing : `Agent – ${doing}`,
      })
      if (isQuestion) {
        await ask($, 'frage', questionOf(tool, input))
      } else {
        void save($)
      }
    })
    const ran = await next(e)
    await safe($, 'tool end', async () => {
      if (pendingAsk === e.tool_use_id) {
        pendingAsk = undefined
      }
      change({ lastActivity: await $.clock.now() })
      if (isQuestion || self?.status === 'freigabe') {
        await setStatus($, resumeStatus, { question: undefined })
      }
      if (tool === 'Agent' || tool === 'Task') {
        void beat($)
      }
    })

    return ran
  })

  // A permission card for the person: the verdict asks, and it stays open.
  on('tool.check', async ($, e, next) => {
    // the mod's own rounds write only into its office page; no card for those
    const url = typeof e.input === 'object' && e.input !== null ? (e.input as { url?: unknown }).url : undefined
    if (next.origin.plugin === 'buero' && String(e.tool) === 'ArtifactData' && url === OFFICE_URL) {
      return { decision: 'allow' as const, reason: 'Die Büro-Mod pflegt ihre eigene Büro-Seite.' }
    }
    const verdict = await next(e)
    await safe($, 'check', async () => {
      const tool = String(e.tool)
      const isOwnDialog = tool === 'AskUserQuestion' || tool === 'ExitPlanMode'
      if (verdict.decision !== 'ask' || isOwnDialog || self === undefined || self.status === 'frage') {
        return
      }
      const id = e.tool_use_id
      if (id === undefined) {
        return
      }
      const input = typeof e.input === 'object' && e.input !== null ? (e.input as Record<string, unknown>) : {}
      const question = `Freigabe für ${describeTool(tool, input)}`
      pendingAsk = id
      $.clock.after(ASK_SETTLE_MS, () => {
        if (pendingAsk === id) {
          void ask($, 'freigabe', question)
        }
      })
    })

    return verdict
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await safe($, 'permission', async () => {
      const input = (e.tool_input ?? {}) as Record<string, unknown>
      await ask($, 'freigabe', `Freigabe für ${describeTool(e.tool_name, input)}`)
    })

    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    await safe($, 'receive', async () => {
      const isPeer = e.origin.kind === 'peer' || e.origin.kind === 'peer-send-message'
      if (isPeer && e.agentId === undefined) {
        change({ receivedAt: await $.clock.now(), receivedText: clip(e.text, 200) })
        void save($)
      }
    })

    return next(e)
  })

  // The model's own SendMessage to another session on this PC counts toward
  // the hourly limit; messages within the session's own team do not.
  on('session.send', async ($, e, next) => {
    if (self === undefined || e.origin.kind === 'plugin') {
      return next(e)
    }
    const now = await $.clock.now()
    const others = (await readRecords($, now)).filter(record => record.id !== self?.id)
    const target = resolveRecipient(others, e.to)
    if (target === undefined) {
      return next(e)
    }
    const budget = sendBudget(self.sent, now, perHour)
    if (!budget.isAllowed) {
      return { isDelivered: false, reason: limitText(perHour, budget.waitMinutes) }
    }
    const sent = await next(e)
    if (sent.isDelivered && self !== undefined) {
      change({
        sent: withSent(self.sent, { at: now, to: e.to, toId: target.id, text: clip(e.text, 200), counts: true }),
      })
      void save($)
    }

    return sent
  })

  // The cloud's own send_message counts toward the same hourly limit.
  on('tool.call', { tool: 'mcp__claude-code-remote__send_message' }, async ($, e, next) => {
    if (self === undefined) {
      return next(e)
    }
    const now = await $.clock.now()
    const budget = sendBudget(self.sent, now, perHour)
    if (!budget.isAllowed) {
      return { deny: limitText(perHour, budget.waitMinutes) }
    }
    const ran = await next(e)
    const input = e as unknown as { session_id?: unknown; message?: unknown }
    if (ran.deny === undefined && ran.isError !== true && self !== undefined && typeof input.session_id === 'string') {
      const text = typeof input.message === 'string' ? input.message : ''
      change({
        sent: withSent(self.sent, { at: now, to: input.session_id, toId: input.session_id, text: clip(text, 200), counts: true }),
      })
      void save($)
      const to = cloudCache?.records.find(record => sameSession(record.id, String(input.session_id)))
      await safe($, 'notiz', () => note($, 'nachricht', `→ ${to?.name ?? input.session_id}: ${clip(text, 120)}`))
    }

    return ran
  })

  // What only the session itself knows goes into the logbook: it pushed, opened or merged a PR.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (cloudSelf !== '' && ran.deny === undefined && ran.isError !== true && /\bgit\s+push\b/.test(String(e.command))) {
      await safe($, 'push', async () => {
        const branch = branchOf(ownSession())?.branch
        const pr = ownPr?.state === 'open' ? `, PR #${ownPr.number} aktualisiert` : ''
        await note($, 'push', `hat gepusht${branch === undefined ? '' : ` (${branch})`}${pr}`)
        ownPrAt = 0
      })
    }

    return ran
  })

  on('tool.call', { tool: 'mcp__github__create_pull_request' }, async ($, e, next) => {
    const ran = await next(e)
    if (cloudSelf !== '' && ran.deny === undefined && ran.isError !== true) {
      const number = /"number"\s*:\s*(\d+)|\/pull\/(\d+)/.exec(String(ran.text ?? ''))
      await safe($, 'pr', () => note($, 'pr', `hat ${number === null ? 'einen PR' : `PR #${number[1] ?? number[2]}`} erstellt`))
      ownPrAt = 0
    }

    return ran
  })

  on('tool.call', { tool: 'mcp__github__merge_pull_request' }, async ($, e, next) => {
    const ran = await next(e)
    const number = (e as unknown as { pullNumber?: unknown }).pullNumber
    if (cloudSelf !== '' && ran.deny === undefined && ran.isError !== true) {
      await safe($, 'merge', () => note($, 'gemergt', `hat PR #${String(number)} gemergt`))
      ownPrAt = 0
    }

    return ran
  })

  on('tool.call', { tool: 'mcp__buero__kollegen' }, async $ => {
    const now = await $.clock.now()
    const records = await officeRecords($, now)

    const mine = ownSession()
    const listed =
      colleaguesText(records, now, stuckMs, selfIdIn(records) ?? '', where()) +
      (mine === undefined ? '' : recentText(news, records, repoOfSession(mine), now))

    return { result: cloudError === undefined ? listed : `${listed}\n\n(Cloud-Liste nicht lesbar: ${cloudError})` }
  })

  on('tool.call', { tool: 'mcp__buero__nachricht' }, async ($, e) => {
    const input = e as unknown as { an?: unknown; text?: unknown }
    const to = typeof input.an === 'string' ? input.an : ''
    const body = typeof input.text === 'string' ? input.text.trim() : ''
    const sender = self
    if (sender === undefined) {
      return { deny: 'Das Büro ist noch nicht bereit.' }
    }
    if (body === '') {
      return { deny: 'Leere Nachricht: nichts gesendet.' }
    }
    const now = await $.clock.now()
    const records = await officeRecords($, now)
    const me = selfIdIn(records)
    const others = records.filter(record => record.id !== me && isActive(record, now))
    const target = resolveRecipient(others, to)
    if (target === undefined) {
      return { deny: `Kein Kollege "${to}" gefunden.\n${colleaguesText(others, now, stuckMs, me ?? '', where())}` }
    }
    if (moodOf(target, now, stuckMs) === 'weg') {
      return { deny: `${target.name} ist gerade nicht erreichbar.` }
    }
    const budget = sendBudget(sender.sent, now, perHour)
    if (!budget.isAllowed) {
      return { deny: limitText(perHour, budget.waitMinutes) }
    }
    const asSeen = records.find(record => record.id === me) ?? sender
    const refused = await deliver($, target.id, colleagueMessage(asSeen, clip(body, 2000)))
    if (refused !== undefined) {
      return { deny: `Nicht zugestellt: ${refused}` }
    }
    change({
      sent: withSent(sender.sent, { at: now, to: target.id, toId: target.id, text: clip(body, 200), counts: true }),
    })
    void save($)
    await safe($, 'notiz', () => note($, 'nachricht', `→ ${target.name}: ${clip(body, 120)}`))

    return { result: `Gesendet an ${target.name}. Noch ${budget.left - 1} Nachrichten in dieser Stunde.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.some(tool => tool.startsWith('mcp__buero__'))) {
      return composed
    }

    return {
      sections: [...composed.sections, { id: 'buero:team', text: teamPrompt(perHour, where(), cloudSelf !== ''), scope: 'session' as const }],
    }
  })

  on('command.run', { command: 'buero' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'Büro' })
    startReader($)

    return {
      text: opened.isPlaced
        ? 'Das Büro ist offen.'
        : `Das Büro ist offen, wird hier aber gerade nicht angezeigt (${opened.reason}).`,
    }
  })

  on('ui.close', { id: PANE }, ($, e, next) => {
    reader?.cancel()
    reader = undefined
    lastSignature = ''

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Link, Text } = table
    const view: OfficeView | null = await read($, office)
    const chosenId = await read($, selected)
    const said = await read($, notice)
    if (view === null) {
      return <Text dimColor>Das Büro wird eingerichtet …</Text>
    }
    const Svg = 'Svg' in table ? table.Svg : undefined
    const Input = 'Input' in table ? table.Input : undefined
    const chosen = view.workers.find(worker => worker.id === chosenId)
    const visitors = view.workers.filter(worker => worker.mood === 'frage' || worker.mood === 'freigabe')
    const choose = (id: string | null) => () => {
      void update($, selected, () => id)
      void update($, notice, () => null)
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{summaryOf(view)}</Text>
        {visitors.length > 0 && (
          <Box flexDirection="column">
            <Text bold color="#f08c00">
              Im Chefbüro warten:
            </Text>
            {visitors.map(worker => (
              <Button key={`chef:${worker.id}`} plain onPress={choose(worker.id)}>
                {`${MOOD_ICON[worker.mood]} ${worker.name} (${worker.project}): `}
                <Text dimColor>{clip(worker.question ?? moodLabel(worker), 90)}</Text>
              </Button>
            ))}
          </Box>
        )}
        {Svg !== undefined && <Svg source={drawOffice(view)} alt={describeOffice(view)} isInteractive />}
        {chosen === undefined ? (
          <Box flexDirection="column">
            {view.workers.length === 0 && <Text dimColor>Noch niemand im Büro.</Text>}
            {view.workers.map(worker => (
              <Button key={`w:${worker.id}`} plain onPress={choose(worker.id)}>
                {`${MOOD_ICON[worker.mood]} ${worker.name}${worker.isSelf ? ' (hier)' : ''} · ${worker.project} `}
                <Text dimColor>{statusLine(worker)}</Text>
              </Button>
            ))}
          </Box>
        ) : (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>{`${MOOD_ICON[chosen.mood]} ${chosen.name} · ${chosen.project}`}</Text>
            <Text>{`${moodLabel(chosen)}, seit ${chosen.minutesInMood} Min.`}</Text>
            {chosen.task !== '' && <Text>{`Auftrag: ${clip(chosen.task, 300)}`}</Text>}
            {chosen.activity !== '' && <Text dimColor>{`Gerade: ${chosen.activity}`}</Text>}
            {chosen.question !== undefined && <Text color="#f08c00">{`Frage: ${chosen.question}`}</Text>}
            {chosen.agents.length > 0 && (
              <Text>{`Agents: ${chosen.agents.map(agent => `${agent.description || agent.type} (${agent.status})`).join(', ')}`}</Text>
            )}
            {chosen.mailText !== undefined && <Text dimColor>{`Post bekommen: ${clip(chosen.mailText, 160)}`}</Text>}
            <Text dimColor>{`${chosen.link === undefined ? 'Ordner' : 'Repo'}: ${chosen.cwd}`}</Text>
            {chosen.usage !== undefined && <Text dimColor>{chosen.usage}</Text>}
            {chosen.link !== undefined && <Link href={chosen.link} label="Session öffnen" />}
            {(chosen.mood === 'frage' || chosen.mood === 'freigabe') && (
              <Text dimColor>
                {chosen.link === undefined
                  ? 'Antworten und Freigaben gibst du im Fenster dieser Session.'
                  : 'Antworte hier per Nachricht oder öffne die Session.'}
              </Text>
            )}
            {Input !== undefined && !chosen.isSelf && chosen.mood !== 'weg' && (
              <Input
                key="nachricht"
                label="Nachricht:"
                placeholder={`an ${chosen.name} schreiben …`}
                submitLabel="senden"
                onSubmit={value => void sendFromBoss($, chosen, value)}
              />
            )}
            {said !== null && <Text dimColor>{said}</Text>}
            <Button key="zurueck" label="Zurück zur Übersicht" onPress={choose(null)} />
          </Box>
        )}
      </Box>
    )
  })
}

function summaryOf(view: OfficeView): string {
  const count = (moods: readonly string[]) => view.workers.filter(worker => moods.includes(worker.mood)).length
  const parts = [
    `${view.workers.length} Mitarbeiter`,
    `${count(['arbeitet'])} arbeiten`,
    `${count(['frage', 'freigabe'])} im Chefbüro`,
    `${count(['haengt', 'fehler'])} hängen`,
  ]

  return `🏢 Büro: ${parts.join(' · ')}`
}

function statusLine(worker: WorkerView): string {
  const since = worker.mood === 'haengt' ? `, seit ${worker.minutesIdle} Min.` : ''
  const agents = worker.agents.length === 0 ? '' : ` · ${worker.agents.length} Agents`
  const doing = worker.mood === 'arbeitet' || worker.mood === 'haengt' ? ` · ${worker.activity}` : ''

  return clip(`${moodLabel(worker)}${since}${agents}${doing}`, 110)
}

function questionOf(tool: string, input: Record<string, unknown>): string {
  if (tool === 'ExitPlanMode') {
    return 'Ein Plan wartet auf deine Freigabe.'
  }
  const questions = Array.isArray(input.questions) ? (input.questions as unknown[]) : []
  const first = questions[0] as { question?: unknown } | undefined

  return typeof first?.question === 'string' ? clip(first.question, 200) : 'Hat eine Frage an dich.'
}

function parseRecord(text: string): SessionRecord | undefined {
  try {
    const value = JSON.parse(text) as Partial<SessionRecord>
    const isRecord =
      value.v === 1 &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.heartbeat === 'number' &&
      Array.isArray(value.agents) &&
      Array.isArray(value.sent)

    return isRecord ? (value as SessionRecord) : undefined
  } catch {
    return undefined
  }
}

function positive(value: unknown, fallback: number): number {
  const n = Number(value)

  return Number.isFinite(n) && n > 0 ? n : fallback
}

function trimEnd(path: string): string {
  return path.replace(/[\\/]+$/, '')
}
