// The office mod. Every session writes what it is doing to a small file of its
// own under `<config dir>/buero/sessions/`; a session that opens the pane
// (`/buero`) reads all of them and draws the office.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { OfficeView, SessionRecord, Status, WorkerView } from '../types'
import { describeOffice, drawOffice } from './art'
import type { CloudSession, OwnPr } from './cloud'
import {
  CLOUD_SERVER,
  branchOf,
  cloudRecords,
  pullRequestIn,
  parseSessionList,
  sameSession,
  snapshotDocId,
  trimSession,
  versionIn,
} from './cloud'
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
/** A session writes the session list there at most this often. */
const FEED_EVERY_MS = 60_000
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
let feeder: Timer | undefined
let feedVersion: number | undefined
let lastFeed = ''
let isFeeding = false
/** Why the cloud's list could not be read last time, for the kollegen tool. */
let cloudError: string | undefined
/** This session's own pull request, as GitHub last reported it. */
let ownPr: OwnPr | undefined
let ownPrAt = 0

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

/** The cloud's sessions, asked at most every CLOUD_EVERY_MS; undefined on a PC. */
async function cloudList($: $, now: number): Promise<SessionRecord[] | undefined> {
  if (cloudSelf === '') {
    return undefined
  }
  if (cloudCache !== undefined && now - cloudCache.at < CLOUD_EVERY_MS) {
    return cloudCache.records
  }
  try {
    const answer = await $.mcp.call(CLOUD_SERVER, 'list_sessions', { mine: true, limit: 20 })
    let text = textOf(answer)
    if (answer.isError) {
      throw new Error(clip(text, 200))
    }
    // a long answer is saved to a file and the text names it
    const saved = /saved to (\S+\.(?:txt|json))/.exec(text)?.[1]
    if (saved !== undefined) {
      text = await $.fs.read(saved)
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
      const answer = await $.mcp.call(CLOUD_SERVER, 'send_message', { session_id: sessionId, message: text })

      return answer.isError ? clip(textOf(answer), 200) || 'unbekannter Fehler' : undefined
    } catch (error) {
      return clip(String(error), 200)
    }
  }
  const sent = await $.session.send({ to: { sessionId }, text })

  return sent.isDelivered ? undefined : sent.reason
}

function artifactWrite(docId: string, data: Record<string, unknown>, ifVersion: number | undefined) {
  return {
    tool: 'ArtifactData',
    action: 'set',
    url: OFFICE_URL,
    collection: 'buero',
    doc_id: docId,
    data,
    ...(ifVersion === undefined ? {} : { if_version: ifVersion }),
  }
}

/**
 * Writes the cloud's session list into the office page's database, so the
 * page shows it without a connector of its own; only when it changed.
 */
async function feed($: $): Promise<void> {
  if (cloudSelf === '' || isFeeding) {
    return
  }
  isFeeding = true
  try {
    const now = await $.clock.now()
    await cloudList($, now)
    const sessions = cloudCache?.sessions
    if (sessions === undefined) {
      return
    }
    const trimmed = sessions.map(trimSession)
    const signature = JSON.stringify([trimmed, ownPr])
    if (signature === lastFeed) {
      return
    }
    const docId = snapshotDocId(cloudSelf)
    const data = { writtenAt: now, writer: cloudSelf, sessions: trimmed, ...(ownPr === undefined ? {} : { pr: ownPr }) }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ran = await $.tool.call(artifactWrite(docId, data, feedVersion) as never)
      const text = String((ran as { text?: unknown; deny?: unknown }).text ?? (ran as { deny?: unknown }).deny ?? '')
      if (/committed/i.test(text)) {
        feedVersion = versionIn(text)
        lastFeed = signature

        return
      }
      // the document exists from an earlier run, or moved on: take its version
      feedVersion = versionIn(text)
      if (feedVersion === undefined) {
        throw new Error(clip(text, 200))
      }
    }
  } catch (error) {
    $.ui.log(`buero: feed: ${String(error)}`, { to: 'debug' })
  } finally {
    isFeeding = false
  }
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
      feeder?.cancel()
      if (cloudSelf !== '') {
        feeder = $.clock.every(FEED_EVERY_MS, () => void feed($))
        $.clock.after(5000, () => void feed($))
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
    await safe($, 'prompt', async () => {
      if (self === undefined) {
        await join($)
      }
      if (e.command === undefined && e.isMeta !== true && e.text.trim() !== '') {
        change({ task: clip(e.text, 300) })
      }
    })

    return next(e)
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
    if (self === undefined) {
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
    }

    return ran
  })

  on('tool.call', { tool: 'mcp__buero__kollegen' }, async $ => {
    const now = await $.clock.now()
    const records = await officeRecords($, now)

    const listed = colleaguesText(records, now, stuckMs, selfIdIn(records) ?? '', where())

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

    return { result: `Gesendet an ${target.name}. Noch ${budget.left - 1} Nachrichten in dieser Stunde.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.some(tool => tool.startsWith('mcp__buero__'))) {
      return composed
    }

    return {
      sections: [...composed.sections, { id: 'buero:team', text: teamPrompt(perHour, where()), scope: 'session' as const }],
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
