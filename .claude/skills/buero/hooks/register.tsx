// The office mod. Every session writes what it is doing to a small file of its
// own under `<config dir>/buero/sessions/`; a session that opens the pane
// (`/buero`) reads all of them and draws the office.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CiStand, EventKind, Letter, OfficeEvent, OfficeView, OpenMeeting, Post, Rolle, SessionRecord, Stand, Status, WorkerView } from '../types'
import { describeOffice, drawOffice } from './art'
import type { CloudSession, DeskInfo, OwnPr } from './cloud'
import {
  CLOUD_SERVER,
  branchOf,
  checkRunsIn,
  cloudRecords,
  deliveryOf,
  elternOf,
  parseSession,
  parseSessionPage,
  pullRequestIn,
  reportFor,
  rolleOf,
  sameSession,
  tagValue,
  trimSession,
} from './cloud'
import { cvdPrompt, kommandoIn } from './auftraege'
import { besprechungOf } from './besprechung'
import type { Owned } from './db'
import { OFFICE_URL, byCreated, dbGet, dbQuery, dbWrite, keep, owned, settle, textOf, unsaved } from './db'
import type { DienstCtx } from './dienst'
import {
  DIENST_TOOLS,
  abgebenTool,
  ablegenTool,
  antwortTool,
  auftragTool,
  besprechungTool,
  claimKommando,
  closeOpenKommandos,
  cvdTool,
  dienstTick,
  holenTool,
  kommandoTool,
  mergeVerdict,
  pruneDienst,
  regelTool,
  standTool,
} from './dienst'
import type { Doc } from './post'
import {
  LEASE_MS,
  RENEW_MS,
  arrivedText,
  carriedMessage,
  dayOf,
  eventKey,
  eventsFrom,
  eventsIn,
  leaseOf,
  letterId,
  letterIn,
  letterOf,
  logDocId,
  mailFor,
  mayLead,
  newsFor,
  postOf,
  questionIn,
  receiptsText,
  recentText,
  repoOfSession,
  tailOf,
  KEEP_MS,
} from './post'
import {
  GONE_MS,
  HEARTBEAT_MS,
  MOOD_ICON,
  ROLLE_LABEL,
  baseName,
  bossMessage,
  buildOffice,
  clip,
  colleagueMessage,
  colleaguesText,
  compareVersions,
  describeTool,
  isActive,
  isVeraltet,
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
/** Sessions per page of the cloud's list, and how many pages the office reads at most. */
const LIST_LIMIT = 50
const LIST_PAGES = 3
/** Sessions untouched for longer than this are not read page by page. */
const LIST_BACK_MS = 2 * 24 * 60 * 60_000
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
const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * 60 * 60_000
/** The office page's collection of colleagues' letters (Letter). */
const LETTERS = 'kollegenpost'
/** GitHub is asked about this session's own pull request at most this often. */
const PR_EVERY_MS = 60_000
const GITHUB_SERVER = 'github'
/** A desk this old was written by a session that sleeps: the messenger asks GitHub about its pull request instead. */
const DESK_FRESH_MS = 90_000
/** The messenger refreshes a sleeping session's CI state this often, and for this many per round. */
const CI_STALE_MS = 2 * 60_000
const CI_PER_TICK = 3
/** Open meetings are read this often, to seat their participants in the meeting room. */
const MEETINGS_EVERY_MS = 60_000
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
/** CI states the messenger fetched for sleeping sessions' pull requests, by writer (`cse_…`). */
const refreshedCi = new Map<string, { number: number; ci: CiStand }>()
/** Open meetings of the office page, for the meeting room. */
let openMeetings: OpenMeeting[] = []
let meetingsAt = 0
/** This session's role in the office, from its cloud tags; read once the cloud answers. */
let rolle: Rolle | undefined
let isRoleKnown = false
let roleAt = 0
/** The role is read again this often: a tag set later (the Chef vom Dienst setting its own) is seen within this. */
const ROLE_EVERY_MS = 2 * 60_000
let elternId: string | undefined
let auftragTag: string | undefined
/** The Chef vom Dienst this session replaces, from its tag; cleared once archived. */
let vorgaengerId: string | undefined
/** This Chef vom Dienst started its successor: it keeps the office no longer. */
let isRetiring = false
let isVorgaengerDone = false
/** The version of this mod, from its manifest. */
let modVersion = ''
/** The newest mod version the office has seen: the messenger's, or this one's. */
let latestVersion = ''
/** What sessions wrote on their desks, as the messenger last read them. */
let deskInfos = new Map<string, DeskInfo>()
let isVeraltetTold = false
let isKontextTold = false
/** The Chef vom Dienst as the lease names it (`cse_…`). */
let leasePinned: string | undefined
/** The last post from the person this session received, for the `antwort` tool. */
let lastPostId: string | undefined
/** The clock as last read, for notes made without `$` in hand. */
let lastNow = 0

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

/**
 * A message that reached this session during its turn: the person's mail, a
 * colleague's letter, or a delivery the mod took from the cloud's queue
 * (`isHeld`), which nothing else brings now.
 */
type Arrived = { text: string; post?: string; letter?: string; isHeld?: boolean }
/** What the next tool result of the main conversation hands over. */
let arrived: Arrived[] = []
/** Letters taken in already, from the page or through the cloud, and those the model has read. */
const takenLetters = new Set<string>()
const readLetters = new Set<string>()

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

/** The cloud's sessions, asked at most every `maxAge`; undefined on a PC. */
async function cloudList($: $, now: number, maxAge = CLOUD_EVERY_MS): Promise<SessionRecord[] | undefined> {
  if (cloudSelf === '') {
    return undefined
  }
  if (cloudCache !== undefined && now - cloudCache.at < maxAge) {
    return cloudCache.records
  }
  try {
    const sessions = await listSessions($, now)
    await checkOwnPr($, sessions, now)
    const reports = new Map(ownPr === undefined ? [] : [[cloudSelf, ownPr] as const])
    cloudCache = { at: now, sessions, records: cloudRecords(sessions, now, reports, deskInfos) }
    cloudError = undefined
    const me = cloudCache.records.find(record => sameSession(record.id, cloudSelf))
    if (me?.kontext !== undefined && me.kontext !== self?.kontext) {
      change({ kontext: me.kontext, kosten: me.kosten })
    }
  } catch (error) {
    cloudError = clip(String(error), 300)
    $.ui.log(`buero: list_sessions: ${cloudError}`, { to: 'debug' })
  }

  return cloudCache?.records
}

/** The cloud's sessions, page by page, as far back as the office looks. */
async function listSessions($: $, now: number): Promise<CloudSession[]> {
  const all: CloudSession[] = []
  let after: string | undefined
  for (let page = 0; page < LIST_PAGES; page += 1) {
    const answer = await $.mcp.call(CLOUD_SERVER, 'list_sessions', {
      mine: true,
      limit: LIST_LIMIT,
      ...(after === undefined ? {} : { after_id: after }),
    })
    const text = await unsaved($, textOf(answer))
    if (answer.isError) {
      throw new Error(clip(text, 200))
    }
    const found = parseSessionPage(text)
    all.push(...found.sessions)
    const oldest = Date.parse(found.sessions.at(-1)?.updated_at ?? '')
    if (!found.hasMore || found.lastId === undefined || (Number.isFinite(oldest) && now - oldest > LIST_BACK_MS)) {
      break
    }
    after = found.lastId
  }
  if (all.length === 0) {
    throw new Error('keine Sessions in der Antwort')
  }

  return all
}

/** This session's role and team from its cloud tags, and the mod's version from its manifest. */
async function readRole($: $): Promise<void> {
  if (modVersion === '') {
    const manifest = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).catch(() => '')
    const version = /"version"\s*:\s*"([^"]+)"/.exec(manifest)?.[1]
    modVersion = version ?? ''
    noteLatest(undefined)
  }
  const answer = await $.mcp.call(CLOUD_SERVER, 'get_session', {})
  const own = answer.isError ? undefined : parseSession(await unsaved($, textOf(answer)))
  if (own === undefined) {
    return
  }
  rolle = rolleOf(own.tags) ?? rolle
  elternId = elternOf(own) ?? elternId
  auftragTag = tagValue(own.tags, 'auftrag') ?? auftragTag
  vorgaengerId = isVorgaengerDone ? undefined : (tagValue(own.tags, 'vorgaenger') ?? vorgaengerId)
  isRoleKnown = true
  change({ rolle, eltern: elternId, auftrag: auftragTag, modVersion: modVersion === '' ? undefined : modVersion })
}

/** Remembers the newest mod version seen, for the office's "veraltet" marks. */
function noteLatest(version: string | undefined): void {
  for (const one of [version, modVersion]) {
    if (one !== undefined && one !== '' && (latestVersion === '' || compareVersions(one, latestVersion) > 0)) {
      latestVersion = one
    }
  }
}

function deskInfoOf(data: Record<string, unknown>): DeskInfo {
  const stand = data.stand as Partial<Stand> | null | undefined
  const hasStand = stand !== undefined && stand !== null && typeof stand.text === 'string' && typeof stand.at === 'number'

  return {
    stand: hasStand ? { text: stand.text as string, at: stand.at as number, fortschritt: typeof stand.fortschritt === 'string' ? stand.fortschritt : undefined } : undefined,
    modVersion: typeof data.modVersion === 'string' ? data.modVersion : undefined,
    rolle: rolleOf(typeof data.rolle === 'string' ? [`buero:rolle=${data.rolle}`] : undefined),
    auftrag: typeof data.auftrag === 'string' ? data.auftrag : undefined,
  }
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
      const found = pullRequestIn(textOf(answer))
      ownPr = found === undefined ? ownPr : { ...found, ...(found.number === ownPr?.number && found.ci === undefined ? { ci: ownPr?.ci } : {}) }
    }
    if (ownPr?.state === 'open') {
      const ci = await fetchCi($, place.owner, place.repo, ownPr.number, now)
      ownPr = { ...ownPr, ...(ci === undefined ? {} : { ci }) }
    }
  } catch (error) {
    $.ui.log(`buero: list_pull_requests: ${String(error)}`, { to: 'debug' })
  }
}

/** What CI says about a pull request's head, from GitHub; undefined when it could not be asked. */
async function fetchCi($: $, owner: string, repo: string, number: number, now: number): Promise<CiStand | undefined> {
  try {
    const answer = await $.mcp.call(GITHUB_SERVER, 'pull_request_read', { method: 'get_check_runs', owner, repo, pullNumber: number, perPage: 100 })

    return answer.isError ? undefined : checkRunsIn(await unsaved($, textOf(answer)), now)
  } catch (error) {
    $.ui.log(`buero: get_check_runs: ${String(error)}`, { to: 'debug' })

    return undefined
  }
}

/**
 * The messenger's look at sleeping sessions' pull requests: a desk older
 * than a minute and a half is no longer refreshed by its own session, so the
 * messenger asks GitHub about its CI, a few per round.
 */
async function refreshCi($: $, sessions: readonly CloudSession[], desks: readonly Doc[], now: number): Promise<void> {
  let asked = 0
  for (const desk of desks) {
    const writer = desk.data.writer
    const pr = desk.data.pr as OwnPr | undefined
    const writtenAt = Number(desk.data.writtenAt)
    if (typeof writer !== 'string' || typeof pr?.number !== 'number' || pr.state !== 'open' || sameSession(writer, cloudSelf)) {
      continue
    }
    const known = refreshedCi.get(writer)
    const freshest = Math.max(pr.ci?.at ?? 0, known?.number === pr.number ? known.ci.at : 0, Number.isFinite(writtenAt) ? writtenAt : 0)
    if (now - freshest < Math.max(DESK_FRESH_MS, CI_STALE_MS) || asked >= CI_PER_TICK) {
      continue
    }
    const place = branchOf(sessions.find(session => sameSession(session.id ?? '', writer)))
    if (place === undefined) {
      continue
    }
    asked += 1
    const ci = await fetchCi($, place.owner, place.repo, pr.number, now)
    if (ci !== undefined) {
      refreshedCi.set(writer, { number: pr.number, ci })
    }
  }
}

/** A session's pull request with the freshest CI state the office knows. */
function withFreshCi(writer: string, pr: OwnPr): OwnPr {
  const known = refreshedCi.get(writer)
  if (known === undefined || known.number !== pr.number || (pr.ci !== undefined && pr.ci.at >= known.ci.at)) {
    return pr
  }

  return { ...pr, ci: known.ci }
}

/** The open meetings of the office page, read once a minute. */
async function readMeetings($: $, now: number): Promise<void> {
  if (now - meetingsAt < MEETINGS_EVERY_MS) {
    return
  }
  meetingsAt = now
  const docs = await dbQuery($, 'besprechungen', { where: [['state', '==', 'offen']], limit: 20 })
  openMeetings = docs.flatMap(doc => {
    const b = besprechungOf(doc.data)

    return b === undefined || b.bis <= now ? [] : [{ thema: b.thema, teilnehmer: b.teilnehmer, bis: b.bis }]
  })
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

// The office page's database (db.ts): the session list, the logbook, the
// mail the person writes on the page and the messenger's lease.

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
  noteAt(kind, text, await $.clock.now())
}

function noteAt(kind: EventKind, text: string, at: number): void {
  if (cloudSelf === '') {
    return
  }
  const mine = ownSession()
  addEvents([
    {
      at,
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
  const data = {
    sid: idOfSelf(),
    writer: cloudSelf,
    ...(ownPr === undefined ? {} : { pr: ownPr }),
    sent,
    ...(rolle === undefined ? {} : { rolle }),
    ...(elternId === undefined ? {} : { eltern: elternId }),
    ...(modVersion === '' ? {} : { modVersion }),
    ...(self.stand === undefined ? {} : { stand: self.stand }),
    ...(auftragTag === undefined ? {} : { auftrag: auftragTag }),
    ...(self.kontext === undefined ? {} : { kontext: self.kontext }),
  }
  const signature = JSON.stringify({ ...data, pr: data.pr === undefined ? undefined : { ...data.pr, ci: data.pr.ci === undefined ? undefined : { ...data.pr.ci, at: 0 } } })
  await keep($, deskDoc, { ...data, writtenAt: now }, signature)
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
    lastPostId = doc.id
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

/**
 * Mail for this session. Not busy, it takes it in as a prompt. Busy, it holds
 * the mail and its colleagues' letters for the next tool result of the
 * running turn: the cloud would hand them over only once the turn ends.
 */
async function fetchOwnMail($: $): Promise<void> {
  const isBusy = self?.status === 'arbeitet'
  const mine = await dbQuery($, 'post', {
    where: [
      ['to', 'in', [idOfSelf(), cloudSelf]],
      ['state', '==', 'neu'],
    ],
    limit: 5,
  })
  for (const doc of mine.sort(byCreated)) {
    const post = postOf(doc.data)
    if (post !== undefined && isBusy) {
      await hold($, doc, post)
    } else if (post !== undefined) {
      await carry($, doc, post, 'selbst')
    }
  }
  if (isBusy) {
    await fetchLetters($)
  }
  if (isBusy && self?.status !== 'arbeitet') {
    // the turn ended while the mail was fetched
    afterTurn($)
  }
}

/** Takes the person's letter for the running turn, so no messenger carries it meanwhile. */
async function hold($: $, doc: Doc, post: Post): Promise<void> {
  const claimedAt = await $.clock.now()
  const claimed = await dbWrite($, 'update', 'post', doc.id, { state: 'unterwegs', by: cloudSelf, via: 'selbst', claimedAt }, doc.version)
  if (claimed.isDone) {
    lastPostId = doc.id
    arrived.push({ text: bossMessage(post.text), post: doc.id })
  }
}

/** Colleagues' letters to this session that the cloud holds back until its turn ends. */
async function fetchLetters($: $): Promise<void> {
  const open = await dbQuery($, LETTERS, {
    where: [
      ['to', 'in', [idOfSelf(), cloudSelf]],
      ['state', '==', 'neu'],
    ],
    limit: 10,
  })
  for (const doc of open.sort(byCreated)) {
    const letter = letterOf(doc.data)
    if (letter !== undefined && !takenLetters.has(doc.id)) {
      takenLetters.add(doc.id)
      arrived.push({ text: letter.text, letter: doc.id })
    }
  }
}

/** Puts a colleague's letter on the office page; resolves its version, or undefined when it could not. */
async function fileLetter($: $, id: string, letter: Letter): Promise<number | undefined> {
  try {
    const outcome = await dbWrite($, 'set', LETTERS, id, letter, undefined)

    return outcome.isDone ? (outcome.version ?? 1) : undefined
  } catch (error) {
    $.ui.log(`buero: brief: ${String(error)}`, { to: 'debug' })

    return undefined
  }
}

async function markRead($: $, letter: string): Promise<void> {
  await settle($, LETTERS, letter, { state: 'gelesen', readAt: await $.clock.now() })
}

/** Notes on the page that the model has read what arrived: the mail delivered, the letters read. */
async function markHandedOver($: $, items: readonly Arrived[]): Promise<void> {
  const at = await $.clock.now()
  for (const one of items) {
    if (one.post !== undefined) {
      await settle($, 'post', one.post, { state: 'zugestellt', deliveredAt: at })
    }
    if (one.letter !== undefined) {
      await markRead($, one.letter)
    }
  }
}

/** What arrived during the turn, as the model reads it after a tool result; undefined when nothing did. */
function handOver($: $): string | undefined {
  if (arrived.length === 0) {
    return undefined
  }
  const items = arrived
  arrived = []
  for (const one of items) {
    if (one.letter !== undefined) {
      readLetters.add(one.letter)
    }
  }
  void safe($, 'übergeben', () => markHandedOver($, items))

  return arrivedText(items.map(one => one.text))
}

/**
 * What a turn ended without reading: the person's mail and the deliveries the
 * mod held come as a prompt, letters from the page with the cloud's own delivery.
 */
function afterTurn($: $): void {
  const left = arrived.filter(one => one.post !== undefined || one.isHeld === true)
  arrived = []
  if (left.length === 0) {
    return
  }
  void safe($, 'post nach dem auftrag', async () => {
    await $.prompt.submit({ text: left.map(one => one.text).join('\n\n') })
    await markHandedOver($, left)
  })
}

/** This session's messages of the last hour and whether they were read, as their letters on the page say. */
async function receiptsOf($: $, records: readonly SessionRecord[], now: number): Promise<string> {
  const recent = (self?.sent ?? []).filter(one => one.letter !== undefined && now - one.at < HOUR_MS)
  const told = await Promise.all(
    recent.map(async one => {
      const letter = letterOf((await dbGet($, LETTERS, one.letter ?? ''))?.data ?? {})
      const to = records.find(record => sameSession(record.id, one.toId ?? one.to))?.name ?? one.to

      return { to, at: one.at, text: one.text, readAt: letter?.state === 'gelesen' ? (letter.readAt ?? now) : undefined }
    }),
  )

  return receiptsText(told, now)
}

/** The messenger's mail round: what recipients did not fetch themselves, and what got stuck. */
async function carryMail($: $, now: number): Promise<void> {
  const open = await dbQuery($, 'post', { where: [['state', 'in', ['neu', 'unterwegs']]], limit: 50 })
  const letters = open.flatMap(doc => {
    const post = postOf(doc.data)

    return post === undefined ? [] : [{ id: doc.id, doc, post }]
  })
  const { carry: due, unclear } = mailFor(letters, now)
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

/** Mail, letters, logbook days, desks and lists older than a week go. */
async function prune($: $, now: number): Promise<void> {
  const old = now - KEEP_MS
  const rounds: [string, Record<string, unknown>][] = [
    ['post', { where: [['createdAt', '<', old]], limit: 50 }],
    [LETTERS, { where: [['createdAt', '<', old]], limit: 50 }],
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
  const desks = await dbQuery($, 'sessions', { limit: 200 })
  await safe($, 'ci', () => refreshCi($, sessions, desks, now))
  const reports = new Map<string, OwnPr>()
  const infos = new Map<string, DeskInfo>()
  for (const desk of desks) {
    const pr = desk.data.pr as OwnPr | undefined
    if (typeof desk.data.writer === 'string' && typeof pr?.number === 'number') {
      reports.set(desk.data.writer, withFreshCi(desk.data.writer, pr))
    }
    if (typeof desk.data.writer === 'string') {
      infos.set(desk.data.writer, deskInfoOf(desk.data))
    }
  }
  deskInfos = infos
  if (ownPr !== undefined) {
    reports.set(cloudSelf, ownPr)
  }
  // the page draws from the list: with the CI states the messenger fetched for sleeping sessions
  const prs = Object.fromEntries([...refreshedCi].map(([writer, known]) => [writer, { number: known.number, state: 'open', ci: known.ci }]))
  await keep(
    $,
    listDoc,
    { writtenAt: now, writer: cloudSelf, sessions: trimmed, prs, ...(modVersion === '' ? {} : { modVersion }) },
    JSON.stringify([trimmed, [...refreshedCi].map(([writer, known]) => `${writer}:${known.number}:${known.ci.state}:${known.ci.fertig}`)]),
  )
  const deliveries = new Map(sessions.map(session => [session.id ?? '', deliveryOf(session, reportFor(reports, session.id ?? ''))]))
  const told = eventsFrom(sessions, deliveries, seen, now)
  addEvents(told.events)
  await safe($, 'fragen', () => fetchQuestions($, sessions, now))
  await safe($, 'post', () => carryMail($, now))
  if (now - prunedAt > PRUNE_EVERY_MS) {
    prunedAt = now
    await safe($, 'aufräumen', () => prune($, now))
    await safe($, 'aufräumen dienst', () => pruneDienst($, now))
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
  noteLatest(lease?.modVersion)
  leasePinned = lease?.pinned
  const isCvd = rolle === 'cvd' && !isRetiring
  if (isRetiring) {
    // a retiring Chef vom Dienst lets its lease run out at once, so the successor takes the office without waiting
    if (lease?.holder === cloudSelf && lease.until > now) {
      await dbWrite($, 'set', 'leitung', 'bote', { holder: cloudSelf, until: now - 1, seen: lease.seen, ...(modVersion === '' ? {} : { modVersion }) }, found?.version)
    }
    isLeader = false

    return
  }
  if (!mayLead(lease, cloudSelf, now, isCvd)) {
    isLeader = false

    return
  }
  let version = found?.version
  const seen = lease?.seen ?? {}
  // the Chef vom Dienst marks the lease as its own, so no one else keeps the office while it is around
  const marks = {
    ...(isCvd ? { pinned: cloudSelf, cvdHeartbeat: now } : lease?.pinned === undefined ? {} : { pinned: lease.pinned, cvdHeartbeat: lease.cvdHeartbeat }),
    ...(modVersion === '' ? {} : { modVersion }),
  }
  if (lease?.holder !== cloudSelf || lease.until - now < RENEW_MS) {
    const claimed = await dbWrite($, 'set', 'leitung', 'bote', { holder: cloudSelf, until: now + LEASE_MS, seen, ...marks }, version)
    if (!claimed.isDone || claimed.version === undefined) {
      isLeader = false

      return
    }
    version = claimed.version
  }
  isLeader = true
  const next = await runOffice($, now, seen)
  if (JSON.stringify(next) !== JSON.stringify(seen)) {
    const kept = await dbWrite($, 'set', 'leitung', 'bote', { holder: cloudSelf, until: now + LEASE_MS, seen: next, ...marks }, version)
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
    lastNow = now
    if (!isRoleKnown || (rolle === undefined && now - roleAt > ROLE_EVERY_MS)) {
      roleAt = now
      await safe($, 'rolle', () => readRole($))
    }
    await safe($, 'bote', () => lead($, now))
    if (!isLeader) {
      await cloudList($, now, LIST_EVERY_MS)
    }
    await safe($, 'eigene post', () => fetchOwnMail($))
    await safe($, 'dienst', () => dienstTick($, ctx, now))
    await safe($, 'schreibtisch', () => writeDesk($, now))
    await safe($, 'logbuch', () => flushLogs($, now))
    await safe($, 'neuigkeiten', () => readNews($, now))
    await safe($, 'besprechungen', () => readMeetings($, now))
  } finally {
    isTicking = false
  }
}

/**
 * What colleagues in this session's repository did since its last prompt,
 * and once that this session's mod is older than the office's; undefined
 * when nothing.
 */
async function newsContext($: $): Promise<string | undefined> {
  const warn =
    !isVeraltetTold && isVeraltet(modVersion, latestVersion)
      ? `[Büro] Diese Session läuft mit Büro-Mod ${modVersion}, das Büro schon mit ${latestVersion}. Neue Werkzeuge gibt es erst in einer neuen Session.`
      : undefined
  if (warn !== undefined) {
    isVeraltetTold = true
  }
  const kontext = self?.kontext
  // the Chef vom Dienst is replaced by the mod itself; nobody asks him to hand over
  const full =
    !isKontextTold && rolle !== 'cvd' && kontext !== undefined && kontext >= 80
      ? `[Büro] Dein Kontext ist zu ${kontext} % voll. Bring deinen Stand in Ordnung und gib bald ab: mcp__buero__abgeben mit Stand, Branch, offenen Punkten und nächstem Schritt, damit eine neue Session weitermachen kann.`
      : undefined
  if (full !== undefined) {
    isKontextTold = true
  }
  const warned = [warn, full].filter((one): one is string => one !== undefined)
  const warnText = warned.length === 0 ? undefined : warned.join('\n')
  const mine = ownSession()
  if (mine === undefined) {
    return warnText
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
    return warnText
  }
  newsTold = told.told

  return warnText === undefined ? told.text : `${warnText}\n${told.text}`
}

/** What the service borrows from this module. */
const ctx: DienstCtx = {
  cloudSelf: () => cloudSelf,
  self: () => self,
  change,
  records: () => {
    const mine = self
    const listed = cloudCache?.records ?? []

    return listed.map(record =>
      mine !== undefined && sameSession(record.id, cloudSelf)
        ? { ...record, agents: mine.agents, sent: mine.sent, receivedAt: mine.receivedAt, receivedText: mine.receivedText }
        : record,
    )
  },
  idOfSelf,
  rolle: () => rolle,
  auftragTag: () => auftragTag,
  setAuftragTag: id => {
    auftragTag = id
    change({ auftrag: id })
  },
  cvdId: () => (rolle === 'cvd' ? idOfSelf() : leasePinned === undefined ? undefined : `session_${tailOf(leasePinned)}`),
  repo: () => {
    const mine = ownSession()
    const repo = mine === undefined ? undefined : repoOfSession(mine)

    return repo === undefined || repo === 'ohne Repo' ? undefined : repo
  },
  note: (kind, text) => noteAt(kind, text, lastNow || Date.now()),
  arrive: text => {
    arrived.push({ text })
  },
  isBusy: () => self?.status === 'arbeitet',
  stuckMs: () => stuckMs,
  lastPost: () => lastPostId,
  vorgaenger: () => vorgaengerId,
  clearVorgaenger: () => {
    vorgaengerId = undefined
    isVorgaengerDone = true
  },
  isRetiring: () => isRetiring,
  retire: () => {
    isRetiring = true
    isLeader = false
  },
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
    const view = buildOffice(records, now, stuckMs, selfIdIn(records), clock.getHours() * 60 + clock.getMinutes(), latestVersion || undefined, openMeetings)
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
        description: `Schickt einem Büro-Kollegen (einer anderen Claude-Code-Session) eine kurze Nachricht. Höchstens ${perHour} pro Stunde (der Chef vom Dienst ohne Limit); nur wenn es echte Arbeit spart. Den Chef vom Dienst erreichst du mit mcp__buero__cvd ohne Limit.`,
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
      for (const tool of DIENST_TOOLS) {
        await $.tool.register({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema as never, isDeferred: tool.isDeferred })
      }
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
  }).catch(($, e, next) => next(e))

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
  }).catch(($, e, next) => next(e))

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
      const named = rolle === 'cvd' ? kommandoIn(e.text) : undefined
      if (named !== undefined) {
        await claimKommando($, ctx, named, await $.clock.now())
      }
    })

    return next(context === undefined ? e : { ...e, context: [...(e.context ?? []), context] })
  }).catch(($, e, next) => next(e))

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
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await safe($, 'turn complete', async () => {
      if (e.agentId !== undefined) {
        void beat($)

        return
      }
      const activity =
        e.reason === 'aborted' ? 'abgebrochen' : e.reason === 'error' ? 'Fehler beim Modell-Aufruf' : ''
      await setStatus($, e.reason === 'error' ? 'fehler' : 'fertig', { activity, question: undefined })
      afterTurn($)
      if (rolle === 'cvd') {
        void safe($, 'kommandos schließen', () => closeOpenKommandos($, ctx, e.answer))
      }
    })

    return next(e)
  }).catch(($, e, next) => next(e))

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
    if (e.agentId !== undefined || ran.deny !== undefined) {
      return ran
    }
    // what reached the session during its turn rides along with this result
    const said = handOver($)

    return said === undefined ? ran : { ...ran, context: [...(ran.context ?? []), said] }
  }).catch(($, e, next) => next(e))

  // A permission card for the person: the verdict asks, and it stays open.
  on('tool.check', async ($, e, next) => {
    // the mod's own rounds write only into its office page; no card for those.
    // Core still sees the call first: the tool's own check notes a pinned write
    // under its tool_use_id, and without that note the cloud refuses the write
    // later ("no approval record in this session"), as it did inside the tools.
    const url = typeof e.input === 'object' && e.input !== null ? (e.input as { url?: unknown }).url : undefined
    if (next.origin.plugin === 'buero' && (String(e.tool) === 'ArtifactData' || String(e.tool) === 'ArtifactComments') && url === OFFICE_URL) {
      await next(e).catch(() => undefined)

      return { decision: 'allow' as const, reason: 'Die Büro-Mod pflegt ihre eigene Büro-Seite.' }
    }
    if (next.origin.plugin === 'buero' && String(e.tool) === 'PushNotification') {
      return { decision: 'allow' as const, reason: 'Die Büro-Mod meldet, wer auf dich wartet.' }
    }
    if (String(e.tool) === 'mcp__github__merge_pull_request' && next.origin.plugin !== 'buero') {
      const input = typeof e.input === 'object' && e.input !== null ? (e.input as Record<string, unknown>) : {}
      const refused = await mergeVerdict($, ctx, input, await $.clock.now()).catch(() => undefined)
      if (refused !== undefined) {
        return { decision: 'deny' as const, reason: refused }
      }
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
  }).catch(($, e, next) => next(e))

  on('classic.PermissionRequest', async ($, e, next) => {
    await safe($, 'permission', async () => {
      const input = (e.tool_input ?? {}) as Record<string, unknown>
      await ask($, 'freigabe', `Freigabe für ${describeTool(e.tool_name, input)}`)
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.receive', async ($, e, next) => {
    const letter = e.agentId === undefined ? letterIn(e.text) : undefined
    if (letter !== undefined && readLetters.has(letter)) {
      return { consumed: 'Büro: schon während des Auftrags gelesen' }
    }
    const isPeer = (e.origin.kind === 'peer' || e.origin.kind === 'peer-send-message') && e.agentId === undefined
    // queued, it would wait for the end of the turn: the next tool result carries it
    const isHeld = isPeer && cloudSelf !== '' && self?.status === 'arbeitet'
    if (letter !== undefined) {
      // this copy is the one the model reads: none from the page
      takenLetters.add(letter)
      arrived = arrived.filter(one => one.letter !== letter)
    }
    if (isHeld) {
      arrived.push({ text: e.text, letter, isHeld })
    }
    await safe($, 'receive', async () => {
      if (isPeer) {
        change({ receivedAt: await $.clock.now(), receivedText: clip(e.text, 200) })
        void save($)
      }
      if (letter !== undefined && !isHeld) {
        void safe($, 'gelesen', () => markRead($, letter))
      }
    })

    return isHeld ? { consumed: 'Büro: kommt mit dem nächsten Arbeitsschritt' } : next(e)
  }).catch(($, e, next) => next(e))

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
    if (!budget.isAllowed && rolle !== 'cvd') {
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
  }).catch(($, e, next) => next(e))

  // The cloud's own send_message counts toward the same hourly limit.
  on('tool.call', { tool: 'mcp__claude-code-remote__send_message' }, async ($, e, next) => {
    if (self === undefined) {
      return next(e)
    }
    const now = await $.clock.now()
    // the Chef vom Dienst wakes colleagues for a living: no limit for him
    const budget = sendBudget(self.sent, now, perHour)
    if (!budget.isAllowed && rolle !== 'cvd') {
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
  }).catch(($, e, next) => next(e))

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
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__github__create_pull_request' }, async ($, e, next) => {
    const ran = await next(e)
    if (cloudSelf !== '' && ran.deny === undefined && ran.isError !== true) {
      const number = /"number"\s*:\s*(\d+)|\/pull\/(\d+)/.exec(String(ran.text ?? ''))
      await safe($, 'pr', () => note($, 'pr', `hat ${number === null ? 'einen PR' : `PR #${number[1] ?? number[2]}`} erstellt`))
      ownPrAt = 0
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__github__merge_pull_request' }, async ($, e, next) => {
    const ran = await next(e)
    const number = (e as unknown as { pullNumber?: unknown }).pullNumber
    if (cloudSelf !== '' && ran.deny === undefined && ran.isError !== true) {
      await safe($, 'merge', () => note($, 'gemergt', `hat PR #${String(number)} gemergt`))
      ownPrAt = 0
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__buero__kollegen' }, async $ => {
    const now = await $.clock.now()
    const records = await officeRecords($, now)

    const mine = ownSession()
    const receipts = cloudSelf === '' ? '' : await receiptsOf($, records, now).catch(() => '')
    const own = isVeraltet(modVersion, latestVersion)
      ? `\n\nDeine Büro-Mod ist ${modVersion}, im Büro läuft schon ${latestVersion}. Neue Sessions bekommen die neue Version über das Setup-Skript der Umgebung.`
      : ''
    const listed =
      colleaguesText(records, now, stuckMs, selfIdIn(records) ?? '', where(), latestVersion || undefined) +
      receipts +
      (mine === undefined ? '' : recentText(news, records, repoOfSession(mine), now)) +
      own

    return { result: cloudError === undefined ? listed : `${listed}\n\n(Cloud-Liste nicht lesbar: ${cloudError})` }
  }).catch(() => ({ deny: 'Büro: das Werkzeug kollegen ist gerade gestört.' }))

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
    if (!budget.isAllowed && rolle !== 'cvd') {
      return { deny: limitText(perHour, budget.waitMinutes) }
    }
    const asSeen = records.find(record => record.id === me) ?? sender
    // in the cloud a copy waits on the office page, for a busy recipient's mod and for the read receipt
    const letter = cloudSelf === '' ? undefined : letterId(cloudSelf, now)
    const text = colleagueMessage(asSeen, clip(body, 2000), letter)
    const filed =
      letter === undefined
        ? undefined
        : await fileLetter($, letter, { to: target.id, from: idOfSelf(), text, createdAt: now, state: 'neu' })
    const refused = await deliver($, target.id, text)
    if (refused !== undefined) {
      if (letter !== undefined && filed !== undefined) {
        await safe($, 'brief zurück', async () => {
          await dbWrite($, 'delete', LETTERS, letter, undefined, filed)
        })
      }

      return { deny: `Nicht zugestellt: ${refused}` }
    }
    change({
      sent: withSent(sender.sent, {
        at: now,
        to: target.id,
        toId: target.id,
        text: clip(body, 200),
        counts: true,
        ...(filed === undefined ? {} : { letter }),
      }),
    })
    void save($)
    await safe($, 'notiz', () => note($, 'nachricht', `→ ${target.name}: ${clip(body, 120)}`))
    const busy =
      cloudSelf !== '' && target.status === 'arbeitet'
        ? ` ${target.name} arbeitet gerade, und die Cloud stellt Nachrichten erst nach dem laufenden Auftrag zu. Läuft bei ${target.name} die Büro-Mod, reicht sie die Nachricht schon beim nächsten Arbeitsschritt durch. Ob sie gelesen ist, zeigt mcp__buero__kollegen.`
        : ''

    return { result: `Gesendet an ${target.name}.${busy}${rolle === 'cvd' ? '' : ` Noch ${budget.isAllowed ? budget.left - 1 : 0} Nachrichten in dieser Stunde.`}` }
  }).catch(() => ({ deny: 'Büro: die Nachricht konnte nicht gesendet werden (Fehler in der Mod).' }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.some(tool => tool.startsWith('mcp__buero__'))) {
      return composed
    }

    return {
      sections: [...composed.sections, { id: 'buero:team', text: teamPrompt(perHour, where(), cloudSelf !== '', rolle, rolle === 'cvd' ? cvdPrompt() : undefined), scope: 'session' as const }],
    }
  })

  // The service's tools (dienst.ts).
  on('tool.call', { tool: 'mcp__buero__stand' }, ($, e) => standTool($, ctx, e)).catch(() => ({ deny: 'Büro: der Stand ließ sich nicht setzen.' }))
  on('tool.call', { tool: 'mcp__buero__cvd' }, ($, e) => cvdTool($, ctx, e)).catch(() => ({ deny: 'Büro: die Meldung an den Chef vom Dienst ist gescheitert.' }))
  on('tool.call', { tool: 'mcp__buero__antwort' }, ($, e) => antwortTool($, ctx, e)).catch(() => ({ deny: 'Büro: die Antwort ließ sich nicht speichern.' }))
  on('tool.call', { tool: 'mcp__buero__auftrag' }, ($, e) => auftragTool($, ctx, e)).catch(() => ({ deny: 'Büro: das Werkzeug auftrag ist gerade gestört.' }))
  on('tool.call', { tool: 'mcp__buero__kollegen_holen' }, ($, e) => holenTool($, ctx, e)).catch(() => ({ deny: 'Büro: die Session ließ sich nicht holen (Fehler in der Mod).' }))
  on('tool.call', { tool: 'mcp__buero__abgeben' }, ($, e) => abgebenTool($, ctx, e)).catch(() => ({ deny: 'Büro: das Abgeben ist gescheitert (Fehler in der Mod).' }))
  on('tool.call', { tool: 'mcp__buero__kommando' }, ($, e) => kommandoTool($, ctx, e)).catch(() => ({ deny: 'Büro: das Kommando ließ sich nicht abschließen.' }))
  on('tool.call', { tool: 'mcp__buero__besprechung' }, ($, e) => besprechungTool($, ctx, e)).catch(() => ({ deny: 'Büro: die Besprechung ist gestört (Fehler in der Mod).' }))
  on('tool.call', { tool: 'mcp__buero__ablegen' }, ($, e) => ablegenTool($, ctx, e)).catch(() => ({ deny: 'Büro: die Ablage ist gestört (Fehler in der Mod).' }))
  on('tool.call', { tool: 'mcp__buero__regel' }, ($, e) => regelTool($, ctx, e)).catch(() => ({ deny: 'Büro: die Regeln ließen sich nicht lesen oder setzen.' }))

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
  }).catch(($, e, next) => next(e))

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
            {chosen.rolle !== undefined && <Text>{`Rolle: ${ROLLE_LABEL[chosen.rolle]}`}</Text>}
            {chosen.auftrag !== undefined && <Text>{`Auftrag-Nr: ${chosen.auftrag}`}</Text>}
            {chosen.task !== '' && <Text>{`Auftrag: ${clip(chosen.task, 300)}`}</Text>}
            {chosen.stand !== undefined && <Text>{`Stand: ${chosen.stand}`}</Text>}
            {chosen.activity !== '' && <Text dimColor>{`Gerade: ${chosen.activity}`}</Text>}
            {chosen.question !== undefined && <Text color="#f08c00">{`Frage: ${chosen.question}`}</Text>}
            {chosen.agents.length > 0 && (
              <Text>{`Agents: ${chosen.agents.map(agent => `${agent.description || agent.type} (${agent.status})`).join(', ')}`}</Text>
            )}
            {chosen.mailText !== undefined && <Text dimColor>{`Post bekommen: ${clip(chosen.mailText, 160)}`}</Text>}
            <Text dimColor>{`${chosen.link === undefined ? 'Ordner' : 'Repo'}: ${chosen.cwd}`}</Text>
            {chosen.usage !== undefined && <Text dimColor>{chosen.usage}</Text>}
            {chosen.modVersion !== undefined && (
              <Text dimColor>{`Büro-Mod ${chosen.modVersion}${chosen.isVeraltet ? ' (veraltet)' : ''}`}</Text>
            )}
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
