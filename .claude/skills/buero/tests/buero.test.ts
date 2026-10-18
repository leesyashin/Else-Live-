import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { drawOffice } from '../hooks/art'
import type { CloudSession } from '../hooks/cloud'
import {
  cloudRecords,
  deliveryOf,
  parseSessionList,
  pullRequestIn,
  sameSession,
  trimSession,
} from '../hooks/cloud'
import {
  dayOf,
  docsIn,
  eventsFrom,
  eventsIn,
  leaseOf,
  mailFor,
  mayLead,
  newsFor,
  questionIn,
  tailOf,
  writeOutcome,
} from '../hooks/post'
import {
  bossMessage,
  buildOffice,
  describeTool,
  moodLabel,
  moodOf,
  pickName,
  resolveRecipient,
  sendBudget,
} from '../hooks/model'
import type { OfficeEvent, Post, SessionRecord } from '../types'

const HOME = '/home/chef'
const DIR = `${HOME}/.claude/buero/sessions`
const SELF = 'sess-self-0001'
const START = Date.UTC(2026, 9, 18, 12, 0)
const MINUTE = 60_000

function record(id: string, name: string, patch: Partial<SessionRecord> = {}): SessionRecord {
  return {
    v: 1,
    id,
    name,
    project: 'shop',
    cwd: '/home/chef/code/shop',
    task: 'Baue den Warenkorb',
    status: 'arbeitet',
    activity: 'Bash: npm test',
    startedAt: START - 30 * MINUTE,
    statusSince: START - 2 * MINUTE,
    lastActivity: START - 10_000,
    heartbeat: START - 5000,
    agents: [],
    sent: [],
    ...patch,
  }
}

/** The world beneath the mod: a clock, a home folder and files in memory. */
function world(on: On, files: Map<string, string>, env: Readonly<Record<string, string>> = {}) {
  const clock = mock.clock(on, { now: START })
  mock.env(on, { HOME, ...env })
  on('session.id', () => ({ value: SELF }))
  on('session.root', () => ({ value: '/home/chef/code/Else-Live-' }))
  on('fs.read', ($, e) => {
    const text = files.get(e.path)

    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('fs.list', ($, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({
        name: path.slice(e.path.length + 1),
        kind: 'file' as const,
        size: 1,
        mtimeMs: clock.now(),
        isLink: false,
      })),
  }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('agent.list', () => ({ value: [] }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.log', () => ({ value: undefined }))
  // what the engine itself answers for the events the tests raise
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  return clock
}

function mine(files: Map<string, string>): SessionRecord {
  return JSON.parse(files.get(`${DIR}/${SELF}.json`) ?? 'null') as SessionRecord
}

const START_EVENT = { cwd: '/home/chef/code/Else-Live-', surface: 'desktop' as const, isInteractive: true }

test('a session takes a desk and reports what it does', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files)

  await $.session.start(START_EVENT)
  expect(mine(files).status).toBe('neu')
  expect(mine(files).name.length).toBeGreaterThan(0)

  await $.turn.start({ text: 'Baue die Login-Seite', turnId: 't1' })
  expect(mine(files).status).toBe('arbeitet')
  expect(mine(files).task).toBe('Baue die Login-Seite')

  await $.turn.complete({ reason: 'answer', answer: 'Fertig.', durationMs: 900, isAborted: false, turnId: 't1' })
  expect(mine(files).status).toBe('fertig')

  await $.session.end({ reason: 'other', sessionId: SELF, resume: { id: SELF } } as never)
  expect(mine(files).ended).toBe(true)
})

test('colleagues are listed and messages keep to the hourly limit', async ($, on) => {
  const files = new Map([[`${DIR}/sess-ben-0002.json`, JSON.stringify(record('sess-ben-0002', 'Ben'))]])
  world(on, files)
  const delivered: string[] = []
  on('session.send', ($, e) => {
    delivered.push(e.text)

    return { isDelivered: true as const }
  })

  await $.session.start(START_EVENT)
  const listed = await $.tool.call({ tool: 'mcp__buero__kollegen' })
  expect(JSON.stringify(listed)).toContain('Ben (Session-ID sess-ben-0002)')

  for (let i = 0; i < 5; i += 1) {
    const sent = await $.tool.call({ tool: 'mcp__buero__nachricht', an: 'Ben', text: `Frage ${i}` })
    expect(JSON.stringify(sent)).toContain('Gesendet an Ben')
  }
  const refused = await $.tool.call({ tool: 'mcp__buero__nachricht', an: 'ben', text: 'noch eine' })
  expect(JSON.stringify(refused)).toContain('Büro-Limit erreicht')
  expect(delivered.length).toBe(5)
  expect(delivered[0]).toContain('Nachricht von Kollege')
  expect(mine(files).sent.length).toBe(5)

  const viaTool = await $.session.send({ to: 'Ben', text: 'per SendMessage', origin: { kind: 'model' } })
  expect(viaTool).toEqual({ isDelivered: false, reason: expect.stringContaining('Büro-Limit erreicht') })
  const toOwnAgent = await $.session.send({ to: 'researcher', text: 'intern', origin: { kind: 'model' } })
  expect(toOwnAgent).toEqual({ isDelivered: true })
})

test('questions and permission cards send the worker to the boss', async ($, on) => {
  const files = new Map<string, string>()
  const clock = world(on, files)
  const seen: string[] = []
  on('tool.call', () => {
    seen.push(`${mine(files).status}: ${mine(files).question ?? ''}`)

    return { result: 'ok' }
  })
  on('tool.check', () => ({ decision: 'ask' as const }))

  await $.session.start(START_EVENT)
  await $.turn.start({ text: 'Räum auf', turnId: 't1' })
  await $.tool.call({
    tool: 'AskUserQuestion',
    questions: [
      {
        question: 'Darf ich alte Branches löschen?',
        header: 'Branches',
        multiSelect: false,
        options: [
          { label: 'Ja', description: 'löschen' },
          { label: 'Nein', description: 'behalten' },
        ],
      },
    ],
  })
  expect(seen).toEqual(['frage: Darf ich alte Branches löschen?'])
  expect(mine(files).status).toBe('arbeitet')

  await $.tool.check({ tool: 'Bash', tool_use_id: 'b1', input: { command: 'git branch -D alt' } })
  expect(mine(files).status).toBe('arbeitet')
  await clock.advance(1600)
  expect(mine(files).status).toBe('freigabe')
  expect(mine(files).question).toBe('Freigabe für Bash: git branch -D alt')
})

test('a card answered after the turn ended leaves the worker done', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files)
  on('tool.call', () => ({ result: 'ok' }))
  on('classic.PermissionRequest', () => ({}))

  await $.session.start(START_EVENT)
  await $.turn.start({ text: 'Starte einen Agent', turnId: 't1' })
  await $.turn.complete({ reason: 'answer', answer: 'läuft', durationMs: 10, isAborted: false, turnId: 't1' })
  expect(mine(files).status).toBe('fertig')

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm publish' } })
  expect(mine(files).status).toBe('freigabe')
  expect(mine(files).question).toBe('Freigabe für Bash: npm publish')

  await $.tool.call({ tool: 'Bash', command: 'npm publish' })
  expect(mine(files).status).toBe('fertig')
  expect(mine(files).question).toBeUndefined()
})

test('the pane shows the office and sends the boss a message', async ($, on) => {
  const asking = record('sess-ben-0002', 'Ben', { status: 'frage', question: 'Soll ich migrieren?' })
  const files = new Map([[`${DIR}/sess-ben-0002.json`, JSON.stringify(asking)]])
  const clock = world(on, files)
  const delivered: string[] = []
  on('session.send', ($, e) => {
    delivered.push(e.text)

    return { isDelivered: true as const }
  })

  await $.session.start(START_EVENT)
  await $.command.run({
    command: 'buero',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  await clock.settle()
  const props = {
    title: 'Büro',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  }

  const desktop = await $.ui.mount({ plugin: 'buero', surface: 'desktop', component: 'Pane', requestId: 'buero', props })
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  expect((await desktop.find({ type: 'Text', text: /im Chefbüro/ }))?.text).toContain('1 im Chefbüro')
  await desktop.press({ key: 'chef:sess-ben-0002' })
  expect(await desktop.find({ type: 'Text', text: 'Frage: Soll ich migrieren?' })).toBeDefined()
  await desktop.input({ key: 'nachricht', text: 'Ja, mach das.' })
  expect(delivered).toEqual([bossMessage('Ja, mach das.')])
  expect(await desktop.find({ type: 'Text', text: 'Nachricht an Ben gesendet.' })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ plugin: 'buero', surface: 'terminal', component: 'Pane', requestId: 'buero', props })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ key: 'zurueck' })).toBeDefined()
  await terminal.unmount()
})

test('moods, the limit and recipients follow the rules', () => {
  const ben = record('sess-ben-0002', 'Ben')
  expect(moodOf(ben, START, 5 * MINUTE)).toBe('arbeitet')
  expect(moodOf(ben, START + 6 * MINUTE, 5 * MINUTE)).toBe('weg')
  expect(moodOf({ ...ben, heartbeat: START + 6 * MINUTE }, START + 6 * MINUTE, 5 * MINUTE)).toBe('haengt')
  expect(moodOf({ ...ben, status: 'fertig' }, START, 5 * MINUTE)).toBe('fertig')

  const sent = [0, 1, 2, 3, 4].map(i => ({ at: START - (50 - i) * MINUTE, to: 'x', text: 'hi', counts: true }))
  expect(sendBudget(sent, START, 5)).toEqual({ isAllowed: false, waitMinutes: 10 })
  expect(sendBudget(sent.slice(1), START, 5)).toEqual({ isAllowed: true, left: 1 })
  expect(sendBudget([...sent, { at: START, to: 'x', text: 'boss', counts: false }].slice(1), START, 5).isAllowed).toBe(true)

  const records = [ben, record('sess-mia-0003', 'Mia', { project: 'web' })]
  expect(resolveRecipient(records, 'sess-mia-0003')?.name).toBe('Mia')
  expect(resolveRecipient(records, 'sess-mia')?.name).toBe('Mia')
  expect(resolveRecipient(records, 'mia')?.name).toBe('Mia')
  expect(resolveRecipient(records, 'web')?.name).toBe('Mia')
  expect(resolveRecipient(records, 'nobody')).toBeUndefined()

  expect(pickName('abc', [])).not.toBe(pickName('abc', [pickName('abc', [])]))
  expect(describeTool('Bash', { command: 'npm test' })).toBe('Bash: npm test')
  expect(describeTool('Edit', { file_path: 'C:\\code\\app\\index.ts' })).toBe('Edit: index.ts')
})

test('the drawing fits the engine and escapes what sessions wrote', () => {
  const workers = Array.from({ length: 30 }, (_, i) =>
    record(`sess-${i}`, `W${i}`, {
      task: '<script>alert(1)</script>',
      agents: [1, 2, 3].map(n => ({ id: `a${n}`, type: 'Explore', description: 'sucht', status: 'running' })),
    }),
  )
  const office = buildOffice(workers, START, 5 * MINUTE, 'sess-0', 12 * 60)
  const svg = drawOffice(office)
  expect(svg.length).toBeLessThan(131_072)
  expect(svg).toContain('CHEFBÜRO')
  expect(svg).toContain('+6 weitere')
  expect(svg).not.toContain('<script>')
})

test('a visitor who just arrived walks in, and a ready PR shows on the screen', () => {
  const office = buildOffice(
    [
      record('sess-ben-0002', 'Ben', { status: 'frage', question: 'Welche Farbe?' }),
      record('sess-mia-0003', 'Mia', { status: 'fertig', pr: 'PR #8' }),
    ],
    START,
    5 * MINUTE,
    undefined,
    12 * 60,
  )
  expect(drawOffice(office, true, ['sess-ben-0002'])).toContain('<set attributeName="opacity"')
  expect(drawOffice(office)).not.toContain('<set attributeName="opacity"')
  expect(drawOffice(office)).toContain('PR #8')
  expect(drawOffice(office, false)).not.toContain('<animate')
})

const CLOUD_LIST = {
  ccr: {
    data: [
      {
        id: 'session_01SELF',
        title: 'Büro bauen',
        status_bucket: 'SESSION_STATUS_BUCKET_WORKING',
        created_at: '2026-10-18T11:00:00Z',
        updated_at: '2026-10-18T11:59:30Z',
        session_context: { outcomes: [{ git_repository: { git_info: { repo: 'leesyashin/Else-Live-', branches: ['claude/buero'] } } }] },
      },
      {
        id: 'session_01BLOCKED',
        title: 'Repo aufräumen',
        status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED',
        created_at: '2026-10-18T10:00:00Z',
        updated_at: '2026-10-18T11:50:00Z',
        session_context: { sources: [{ git_repository: { url: 'https://github.com/leesyashin/Acai' } }] },
        post_turn_summary: { status_category: 'need_input', status_detail: 'wartet', needs_action: 'Bitte Modus umstellen' },
        external_metadata: { context_usage: { max_tokens: 1000, used_tokens: 250 }, usage: { cost_usd: 1.5 } },
      },
      {
        id: 'session_01OLD',
        title: 'Altes Projekt',
        status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED',
        created_at: '2026-10-10T10:00:00Z',
        updated_at: '2026-10-10T11:00:00Z',
      },
    ],
  },
}
const WRAPPED = `Another Claude session's record (JSON):\n${JSON.stringify(CLOUD_LIST)}\n</other-session>`

test('cloud sessions become workers, the blocked one in the boss office', () => {
  const sessions = parseSessionList(WRAPPED)
  expect(sessions.length).toBe(3)
  expect(sameSession('cse_01SELF', 'session_01SELF')).toBe(true)
  expect(sameSession('', 'session_01SELF')).toBe(false)

  const records = cloudRecords(sessions, START)
  expect(records.map(one => one.id)).toEqual(['session_01BLOCKED', 'session_01SELF'])
  const blocked = records[0]
  expect(blocked?.status).toBe('frage')
  expect(blocked?.question).toBe('Bitte Modus umstellen')
  expect(blocked?.project).toBe('Acai')
  expect(blocked?.usage).toBe('Kontext 25 % · 1.50 $')
  expect(blocked?.link).toBe('https://claude.ai/code/session_01BLOCKED')
  expect(records[1]?.cwd).toBe('Else-Live- · claude/buero')
  expect(new Set(records.map(one => one.name)).size).toBe(2)
})

test('in the cloud the office reads the session list and answers through it', async ($, on) => {
  const files = new Map<string, string>()
  const clock = world(on, files, { CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01SELF' })
  const sentTo: string[] = []
  const askedGithub: string[] = []
  on('mcp.call', ($, e) => {
    if (e.tool === 'list_sessions') {
      return { value: { content: [{ type: 'text', text: WRAPPED }], isError: false } }
    }
    if (e.tool === 'list_pull_requests') {
      askedGithub.push(`${String(e.args.owner)}/${String(e.args.repo)} ${String(e.args.head)}`)

      return { value: { content: [{ type: 'text', text: '[{"number":7,"state":"open","merged":false}]' }], isError: false } }
    }
    sentTo.push(`${String(e.args.session_id)}: ${String(e.args.message)}`)

    return { value: { content: [{ type: 'text', text: 'ok' }], isError: false } }
  })

  await $.session.start(START_EVENT)
  const listed = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__kollegen' }))
  expect(askedGithub).toEqual(['leesyashin/Else-Live- leesyashin:claude/buero'])
  expect(listed).toContain('in deiner Claude-Code-Cloud')
  expect(listed).toContain('session_01BLOCKED')
  expect(listed).not.toContain('session_01SELF')

  const sent = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__nachricht', an: 'session_01BLOCKED', text: 'Hast du kurz Zeit?' }))
  expect(sent).toContain('Gesendet an')
  expect(sentTo[0]).toContain('session_01BLOCKED: [Büro] Nachricht von Kollege')
  expect(sentTo[0]).toContain('Session-ID session_01SELF')

  await $.command.run({
    command: 'buero',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  await clock.settle()
  const props = {
    title: 'Büro',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  }
  const desktop = await $.ui.mount({ plugin: 'buero', surface: 'desktop', component: 'Pane', requestId: 'buero', props })
  expect((await desktop.find({ type: 'Text', text: /im Chefbüro/ }))?.text).toContain('1 im Chefbüro')
  expect(await desktop.find({ key: 'w:session_01SELF' })).toBeDefined()
  await desktop.press({ key: 'chef:session_01BLOCKED' })
  expect(await desktop.find({ type: 'Link' })).toBeDefined()
  await desktop.input({ key: 'nachricht', text: 'Ja, stell um.' })
  expect(sentTo[1]).toBe(`session_01BLOCKED: ${bossMessage('Ja, stell um.')}`)
  await desktop.unmount()
})

function finished(id: string, said: string, patch: Partial<CloudSession> = {}): CloudSession {
  return {
    id,
    title: id,
    status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED',
    created_at: '2026-10-18T09:00:00Z',
    updated_at: '2026-10-18T11:00:00Z',
    post_turn_summary: { status_category: 'completed', status_detail: said },
    ...patch,
  }
}

test('sessions merged into main leave the office, ready PRs stay until they are', () => {
  const said = (text: string) => deliveryOf(finished('session_x', text)).state
  expect(said('PR #2 merged to main; büro mod, page, setup script in')).toBe('gemergt')
  expect(said('PR #25 squash-merged to main; Pages deployed, game live')).toBe('gemergt')
  expect(said('PR auf main per Merge-Commit 53c14c2 gemergt; Live-Seite nicht geprüft')).toBe('gemergt')
  expect(said('PR #3 als Merge-Commit in main übernommen')).toBe('gemergt')
  expect(said('Pages-Deploy von PR #23 durchgelaufen; Domain genannt')).toBe('gemergt')
  expect(said('Draft-PR #8 erstellt, CI grün')).toBe('pr')
  expect(said('PR #4 ready to merge into main')).toBe('pr')
  expect(said('PR #4 noch nicht in main gemergt')).toBe('pr')
  expect(said('merged main into the branch, PR #6 updated')).toBe('pr')
  expect(said('gave the Pages URL; latest main deployed successfully')).toBe('gemergt')
  expect(said('PR #9 offen; main deploy unberührt')).toBe('pr')
  expect(said('Opus prompt rewritten; PR-branch workflow')).toBe('ohne')
  expect(deliveryOf(finished('session_x', 'PR #12 offen'))).toEqual({ state: 'pr', pr: 'PR #12' })

  const sessions = [
    finished('session_01MERGED', 'PR #2 merged to main'),
    finished('session_01OPEN', 'Draft-PR #8 erstellt', { updated_at: '2026-10-10T11:00:00Z' }),
    finished('session_01READ', 'Link geschickt'),
    finished('session_01UNREAD', 'Antwort geschrieben', { unread: true }),
    finished('session_01AGAIN', 'PR #2 merged to main', { status_bucket: 'SESSION_STATUS_BUCKET_WORKING' }),
  ]
  const records = cloudRecords(sessions, START)
  expect(records.map(one => one.id)).toEqual(['session_01OPEN', 'session_01UNREAD', 'session_01AGAIN'])
  expect(records[0]?.status).toBe('fertig')
  expect(records[0]?.pr).toBe('PR #8')
  expect(records[1]?.pr).toBeUndefined()
  expect(records[2]?.status).toBe('arbeitet')
  expect(records[2]?.pr).toBeUndefined()
  expect(moodLabel({ mood: 'fertig', pr: 'PR #8' })).toBe('PR #8 bereit zum Mergen')
})

test("what GitHub reports about a session's own PR beats its summary", () => {
  expect(pullRequestIn('[{"number":3,"state":"open","merged":false,"html_url":"https://x/pull/3"}]')).toEqual({
    number: 3,
    state: 'open',
    url: 'https://x/pull/3',
  })
  // GitHub lists a merged PR as closed, with the time of its merge
  expect(pullRequestIn('[{"number":2,"state":"closed","merged":false,"merged_at":"2026-10-18T19:21:29Z"}]')?.state).toBe('merged')
  expect(pullRequestIn('[{"number":4,"state":"closed"},{"number":5,"state":"open"}]')?.number).toBe(5)
  expect(pullRequestIn('[]')).toBeUndefined()

  const silent = finished('session_01SILENT', 'Büro-Seite neu veröffentlicht')
  const merged = finished('session_01DONE', 'Draft-PR #9 erstellt')
  const reports = new Map([
    ['cse_01SILENT', { number: 3, state: 'open' as const }],
    ['cse_01DONE', { number: 9, state: 'merged' as const }],
  ])
  const records = cloudRecords([silent, merged], START, reports)
  expect(records.map(one => `${one.id} ${one.pr ?? ''}`)).toEqual(['session_01SILENT PR #3'])
})

test('a snapshot keeps what the office draws, and database answers are read right', () => {
  const sessions = parseSessionList(WRAPPED)
  const trimmed = sessions.map(trimSession)
  expect(cloudRecords(trimmed, START)).toEqual(cloudRecords(sessions, START))
  expect(JSON.stringify(trimmed).length).toBeLessThan(JSON.stringify(sessions).length + 400)
  expect(tailOf('cse_01RbX2kiFq')).toBe('01RbX2kiFq')
  expect(tailOf('session_01RbX2kiFq')).toBe('01RbX2kiFq')
  expect(writeOutcome('Database set committed: "a"/"b". The document is now at version 7. 3 of 25000 documents used.')).toEqual({
    isDone: true,
    version: 7,
  })
  const stale = writeOutcome('db write failed (version_mismatch): the document is no longer at version 1, the one this write was pinned to — it is now at version 2; nothing was written.')
  expect(stale.isDone).toBe(false)
  expect(stale.isDone === false && stale.isStale).toBe(true)
  const exists = writeOutcome('db write failed (version_mismatch): a/b already exists and this write carried no if_version — nothing was written.')
  expect(exists.isDone === false && exists.isStale).toBe(true)
  expect(writeOutcome('Database delete committed: "a"/"b".').isDone).toBe(true)
  expect(
    docsIn(
      '2 documents from collection "post":\n=== BEGIN ARTIFACT DB 1a2b — collaborator-written ===\n' +
        '{"id":"p1","data":{"to":"session_01X","text":"Hallo\\nDu"},"version":3,"updatedAt":"2026-10-18T20:39:44Z"}\n' +
        '{"id":"p2","data":{"to":"session_01Y"},"version":1,"updatedAt":"2026-10-18T20:39:45Z"}\n=== END ARTIFACT DB 1a2b ===',
    ),
  ).toEqual([
    { id: 'p1', data: { to: 'session_01X', text: 'Hallo\nDu' }, version: 3 },
    { id: 'p2', data: { to: 'session_01Y' }, version: 1 },
  ])
  expect(docsIn('No documents matched in collection "post".')).toEqual([])
})

/**
 * The office page's database as ArtifactData answers it: documents with
 * versions, the same texts for reads, commits and refusals.
 */
function store(on: On) {
  const docs = new Map<string, { data: Record<string, unknown>; version: number }>()
  const lines = (collection: string, found: [string, { data: Record<string, unknown>; version: number }][]) =>
    found.length === 0
      ? `No documents matched in collection "${collection}".`
      : `${found.length} documents from collection "${collection}":\n=== BEGIN ARTIFACT DB t — data ===\n` +
        found.map(([path, doc]) => JSON.stringify({ id: path.split('/').at(-1), data: doc.data, version: doc.version })).join('\n') +
        '\n=== END ARTIFACT DB t ==='
  const matches = (data: Record<string, unknown>, [field, op, value]: [string, string, unknown]) => {
    const have = data[field]
    switch (op) {
      case '==':
        return have === value
      case 'in':
        return Array.isArray(value) && value.includes(have)
      case '<':
        return typeof have === typeof value && (have as number) < (value as number)
      case '>=':
        return typeof have === typeof value && (have as number) >= (value as number)
      default:
        throw new Error(`op ${op}`)
    }
  }
  on('tool.call', { tool: 'ArtifactData' }, ($, e) => {
    const input = e as unknown as {
      action: string
      collection: string
      doc_id?: string
      data?: Record<string, unknown>
      if_version?: number
      query?: { where?: [string, string, unknown][] }
    }
    const path = `${input.collection}/${input.doc_id ?? ''}`
    const doc = docs.get(path)
    const answer = (text: string) => ({ result: text, text })
    switch (input.action) {
      case 'get':
        return answer(doc === undefined ? `No document "${input.doc_id}" in collection "${input.collection}".` : lines(input.collection, [[path, doc]]))
      case 'query': {
        const found = [...docs].filter(
          ([key, one]) =>
            key.startsWith(`${input.collection}/`) && !key.slice(input.collection.length + 1).includes('/') &&
            (input.query?.where ?? []).every(clause => matches(one.data, clause)),
        )

        return answer(lines(input.collection, found))
      }
      default: {
        if (doc !== undefined && input.if_version === undefined) {
          return answer(`db write failed (version_mismatch): ${path} already exists and this write carried no if_version — nothing was written.`)
        }
        if (doc !== undefined && input.if_version !== doc.version) {
          return answer(`db write failed (version_mismatch): the document is no longer at version ${input.if_version} — it is now at version ${doc.version}; nothing was written.`)
        }
        if (input.action === 'delete') {
          docs.delete(path)

          return answer(`Database delete committed: "${input.collection}"/"${input.doc_id}".`)
        }
        if (input.action === 'update' && doc === undefined) {
          return answer(`db write failed (not_found): no document ${path}.`)
        }
        const version = (doc?.version ?? 0) + 1
        docs.set(path, { data: input.action === 'update' ? { ...doc?.data, ...input.data } : { ...input.data }, version })

        return answer(`Database ${input.action} committed: "${input.collection}"/"${input.doc_id}". The document is now at version ${version}.`)
      }
    }
  })

  return {
    get: (path: string) => docs.get(path)?.data as Record<string, any> | undefined,
    put: (path: string, data: Record<string, unknown>) => docs.set(path, { data, version: (docs.get(path)?.version ?? 0) + 1 }),
  }
}

function listOf(sessions: readonly CloudSession[]) {
  return { value: { content: [{ type: 'text', text: JSON.stringify({ ccr: { data: sessions } }) }], isError: false } }
}

const ASKED_EVENTS = JSON.stringify({
  ccr: {
    data: [
      { assistant: { internal_anthropic_catchall: { message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] } } } },
      { assistant: { internal_anthropic_catchall: { message: { content: [{ type: 'thinking' }] } } } },
      { assistant: { internal_anthropic_catchall: { message: { content: [{ type: 'text', text: 'Alles geprüft.' }] } } } },
      { assistant: { internal_anthropic_catchall: { message: { content: [{ type: 'text', text: 'Welcher Modus: A oder B?' }] }, parent_tool_use_id: null } } },
    ],
  },
})

test('the messenger keeps the page: list, questions, logbook and mail', async ($, on) => {
  const files = new Map<string, string>()
  const clock = world(on, files, { CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01SELF' })
  const db = store(on)
  let sessions: CloudSession[] = CLOUD_LIST.ccr.data
  const sent: string[] = []
  const prompts: string[] = []
  on('mcp.call', ($, e) => {
    if (e.tool === 'list_sessions') {
      return listOf(sessions)
    }
    if (e.tool === 'list_events') {
      return { value: { content: [{ type: 'text', text: ASKED_EVENTS }], isError: false } }
    }
    if (e.tool === 'send_message') {
      sent.push(`${String(e.args.session_id)} ${String(e.args.priority)}: ${String(e.args.message)}`)
    }

    return { value: { content: [{ type: 'text', text: '[]' }], isError: false } }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })

  await $.session.start(START_EVENT)
  await clock.advance(5000)
  expect(db.get('leitung/bote')?.holder).toBe('cse_01SELF')
  expect(db.get('buero/liste')?.sessions.length).toBe(3)
  expect(db.get('fragen/01BLOCKED')?.text).toBe('Alles geprüft.\n\nWelcher Modus: A oder B?')
  expect(db.get('sessions/01SELF')?.sid).toBe('session_01SELF')

  // the person answers on the page; the waiting session starts working meanwhile
  sessions = sessions.map(one =>
    one.id === 'session_01BLOCKED' ? { ...one, status_bucket: 'SESSION_STATUS_BUCKET_WORKING', updated_at: '2026-10-18T12:00:04Z' } : one,
  )
  db.put('post/p1', { to: 'session_01BLOCKED', text: 'Nimm B.', createdAt: clock.now(), state: 'neu' })
  db.put('post/p2', { to: 'session_01SELF', text: 'Wie weit bist du?', createdAt: clock.now(), state: 'neu' })
  await clock.advance(15_000)

  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain('session_01BLOCKED next: [Büro] Nachricht vom Nutzer')
  expect(sent[0]).toContain('Nimm B.')
  expect(db.get('post/p1')?.state).toBe('zugestellt')
  expect(db.get('post/p1')?.via).toBe('bote')
  expect(prompts.some(text => text.includes('Wie weit bist du?'))).toBe(true)
  expect(db.get('post/p2')?.state).toBe('zugestellt')
  expect(db.get('post/p2')?.via).toBe('selbst')
  // no longer waiting: its question goes
  expect(db.get('fragen/01BLOCKED')).toBeUndefined()
  const log = db.get(`logbuch/${dayOf(clock.now())}-01SELF`)
  expect((log?.events as OfficeEvent[]).map(event => `${event.sid} ${event.text}`)).toEqual(['session_01BLOCKED arbeitet wieder'])

  // a second session sees the lease held and leaves the messenger's work alone
  expect(db.get('leitung/bote')?.until).toBeGreaterThan(clock.now())
})

test('a session hears what colleagues in its repository did, once', async ($, on) => {
  const files = new Map<string, string>()
  const clock = world(on, files, { CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01SELF' })
  const db = store(on)
  const mate: CloudSession = {
    id: 'session_01MATE',
    title: 'Login reparieren',
    status_bucket: 'SESSION_STATUS_BUCKET_WORKING',
    created_at: '2026-10-18T09:00:00Z',
    updated_at: '2026-10-18T11:59:00Z',
    session_context: { outcomes: [{ git_repository: { git_info: { repo: 'leesyashin/Else-Live-', branches: ['claude/login'] } } }] },
  }
  const sessions = [...CLOUD_LIST.ccr.data, mate]
  on('mcp.call', ($, e) => (e.tool === 'list_sessions' ? listOf(sessions) : { value: { content: [{ type: 'text', text: '[]' }], isError: false } }))
  // someone else carries the mail here
  db.put('leitung/bote', { holder: 'cse_01OTHER', until: START + 10 * 60_000, seen: {} })
  const pushed: OfficeEvent = { at: START - 60_000, sid: 'session_01MATE', title: 'Login reparieren', repo: 'leesyashin/Else-Live-', kind: 'push', text: 'hat gepusht (claude/login)' }
  const elsewhere: OfficeEvent = { ...pushed, sid: 'session_01BLOCKED', repo: 'leesyashin/Acai', text: 'hat gepusht (main)' }
  db.put(`logbuch/${dayOf(START)}-01MATE`, { day: dayOf(START), writer: 'cse_01MATE', events: [pushed, elsewhere] })
  const contexts: (readonly string[] | undefined)[] = []
  on('prompt.submit', ($, e) => {
    contexts.push(e.context)

    return { text: e.text }
  })

  await $.session.start(START_EVENT)
  await clock.advance(5000)
  expect(db.get('buero/liste')).toBeUndefined()
  await $.prompt.submit({ text: 'Mach weiter', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: 'Und jetzt?', wait: false, origin: { kind: 'composer' } })
  const said = contexts[0]?.join('\n') ?? ''
  expect(said).toContain('[Büro] Neues aus dem Repo Else-Live-')
  expect(said).toContain('hat gepusht (claude/login)')
  expect(said).toContain('Session-ID session_01MATE')
  expect(said).not.toContain('Acai')
  expect(contexts[1]).toBeUndefined()

  const listed = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__kollegen' }))
  expect(listed).toContain('Letzte Ereignisse im Büro')
})

test('the logbook notes changes once, mail waits for its recipient first, questions read whole', () => {
  const at = (minutes: number) => new Date(START + minutes * MINUTE).toISOString()
  const one = (patch: Partial<CloudSession>): CloudSession => ({
    id: 'session_01A',
    title: 'Spiel bauen',
    status_bucket: 'SESSION_STATUS_BUCKET_WORKING',
    created_at: at(-120),
    updated_at: at(-1),
    session_context: { outcomes: [{ git_repository: { git_info: { repo: 'leesyashin/Acai', branches: ['claude/x'] } } }] },
    ...patch,
  })
  const none = new Map()
  const first = eventsFrom([one({})], none, {}, START)
  expect(first.events).toEqual([])
  const done = one({ status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', post_turn_summary: { status_detail: 'Draft-PR #8 erstellt' } })
  const ready = eventsFrom([done], new Map([['session_01A', deliveryOf(done)]]), first.seen, START)
  expect(ready.events.map(event => event.text)).toEqual(['fertig: Draft-PR #8 erstellt', 'PR #8 offen, wartet aufs Mergen'])
  expect(ready.events[0]?.repo).toBe('leesyashin/Acai')
  // the same state again says nothing; working again does, the PR it keeps
  expect(eventsFrom([done], new Map([['session_01A', deliveryOf(done)]]), ready.seen, START).events).toEqual([])
  const again = eventsFrom([one({})], none, ready.seen, START)
  expect(again.events.map(event => event.text)).toEqual(['arbeitet wieder'])
  const merged = one({ status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', post_turn_summary: { status_detail: 'PR #8 merged to main' } })
  expect(eventsFrom([merged], new Map([['session_01A', deliveryOf(merged)]]), again.seen, START).events.map(event => event.text)).toEqual([
    'fertig: PR #8 merged to main',
    'PR #8 gemergt, fertig',
  ])
  const fresh = one({ id: 'session_01NEW', created_at: at(-2) })
  expect(eventsFrom([one({}), fresh], none, again.seen, START).events.map(event => `${event.sid} ${event.text}`)).toEqual([
    'session_01NEW neue Session',
  ])
  expect(eventsIn([{ events: ready.events }, { events: ready.events }])).toHaveLength(2)

  const post = (patch: Partial<Post>): Post => ({ to: 'session_01A', text: 'ok', createdAt: START, state: 'neu', ...patch })
  const letters = [
    { id: 'jetzt', post: post({}) },
    { id: 'alt', post: post({ to: 'session_01B', createdAt: START - 30_000 }) },
    { id: 'fest', post: post({ state: 'unterwegs', claimedAt: START - 4 * 60_000 }) },
  ]
  expect(mailFor(letters, new Set(), START)).toEqual({ carry: ['alt'], unclear: ['fest'] })
  expect(mailFor(letters, new Set(['session_01A']), START).carry).toEqual(['jetzt', 'alt'])

  const asked = JSON.stringify({
    data: [
      { assistant: { message: { content: [{ type: 'text', text: 'Ich frage nach.' }] } } },
      {
        assistant: {
          message: {
            content: [
              {
                type: 'tool_use',
                name: 'AskUserQuestion',
                input: { questions: [{ question: 'Welche Farbe?', options: [{ label: 'Rot' }, { label: 'Blau' }] }] },
              },
            ],
          },
        },
      },
    ],
  })
  expect(questionIn(asked)).toBe('Welche Farbe?\n– Rot\n– Blau')
  expect(questionIn('kein JSON')).toBeUndefined()

  expect(mayLead(undefined, 'cse_1', START)).toBe(true)
  expect(mayLead(leaseOf({ holder: 'cse_2', until: START + 1000 }), 'cse_1', START)).toBe(false)
  expect(mayLead(leaseOf({ holder: 'cse_2', until: START - 1 }), 'cse_1', START)).toBe(true)
  expect(mayLead(leaseOf({ holder: 'cse_1', until: START + 1000 }), 'cse_1', START)).toBe(true)

  const records = cloudRecords([one({ id: 'session_01SELF' }), one({ id: 'session_01B', title: 'Shop' })], START)
  const event: OfficeEvent = { at: START - MINUTE, sid: 'session_01B', title: 'Shop', repo: 'leesyashin/Acai', kind: 'push', text: 'hat gepusht' }
  const told = newsFor({ self: 'cse_01SELF', repo: 'leesyashin/Acai', records, events: [event], since: 0, told: '', now: START })
  expect(told?.text).toContain('vor 1 Min.')
  expect(newsFor({ self: 'cse_01SELF', repo: 'leesyashin/Acai', records, events: [event], since: START, told: told?.told ?? '', now: START })).toBeUndefined()
})
