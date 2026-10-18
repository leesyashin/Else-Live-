import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { drawOffice } from '../hooks/art'
import {
  bossMessage,
  buildOffice,
  describeTool,
  moodOf,
  pickName,
  resolveRecipient,
  sendBudget,
} from '../hooks/model'
import type { SessionRecord } from '../types'

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
function world(on: On, files: Map<string, string>) {
  const clock = mock.clock(on, { now: START })
  mock.env(on, { HOME })
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
