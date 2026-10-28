import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const HOME = '/home/me'
const UX = `${HOME}/.claude/plugins/design/skills/ux-copy`

const PANE = {
  plugin: 'cockpit',
  component: 'Pane',
  requestId: 'cockpit',
  props: {
    title: 'Cockpit',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'cockpit',
  component: 'AbovePrompt',
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 3 },
    view: {},
  },
} as const

// Claude's skill listing: two skills fit, one more did not.
const USAGE = {
  startedAt: 0,
  context: {
    tokens: 1000,
    window: 200000,
    percent: 1,
    breakdown: {
      skills: {
        totalSkills: 3,
        includedSkills: 2,
        tokens: 90,
        skillFrontmatter: [
          { name: 'frontend-design', source: 'plugin', pluginName: 'example-skills', tokens: 40 },
          { name: 'design:ux-copy', source: 'plugin', pluginName: 'design', tokens: 50 },
        ],
      },
    },
  },
  rateLimits: [],
}

const COMMANDS = [
  { name: 'help', description: 'Hilfe', source: 'builtin' },
  { name: 'frontend-design', description: 'Gestaltet Oberflächen mit Haltung', source: 'plugin' },
  { name: 'design:ux-copy', description: 'Schreibt Microcopy', source: 'plugin' },
  { name: 'berater', description: 'Persönlicher Berater', source: 'user' },
  { name: 'cockpit', description: 'Öffnet das Cockpit', source: 'plugin' },
]

// The repo's memory file as the mod ships it; a test may take it away.
const MEMORY_FILE = 'else-live-.md'
const MEMORY = `---
repo: leesyashin/Else-Live-
base: main
branch: claude/*
connectors: github
optional: figma
skills: frontend-design, plugin-authoring
---

# Else-Live-

## Setup
- [x] Mod geladen
- [ ] Figma freigeben

## Merges
- 2026-10-28 · #46 Merge-Knopf
`
let memoryText: string | undefined = MEMORY

const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })

const TREE: Record<string, ReturnType<typeof entry>[]> = {
  [`${HOME}/.claude/plugins`]: [entry('design', 'dir')],
  [`${HOME}/.claude/plugins/design`]: [entry('skills', 'dir')],
  [`${HOME}/.claude/plugins/design/skills`]: [entry('ux-copy', 'dir')],
  [UX]: [entry('SKILL.md', 'file'), entry('references', 'dir')],
  [`${UX}/references`]: [entry('voice.md', 'file'), entry('hero.webp', 'file')],
}

const FILES: Record<string, string> = {
  [`${UX}/SKILL.md`]: '---\nname: ux-copy\n---\n# UX Copy\n\nSchreibe klar.',
  [`${UX}/references/voice.md`]: '# Stimme\n\nKurz und freundlich.',
}

// Nothing sits beneath the plugin: each hook here stands for the engine.
function world(
  on: On,
  store: Record<string, unknown> = {},
  surfaces: readonly RenderSurface[] = ['desktop'],
  env: Record<string, string> = {},
) {
  // The store in memory, so a test can read what the plugin kept.
  const saved: Record<string, unknown> = { ...store }
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  mock.env(on, { HOME, ...env })
  const clock = mock.clock(on, { now: 1_000_000 })
  const toasts: string[] = []
  const ran: string[][] = []
  const filled: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__cockpit__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE as never }))
  on('command.list', () => ({ value: COMMANDS as never }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.list', (_, e) => ({ value: (TREE[e.path ?? ''] ?? []) as never }))
  on('fs.read', (_, e) => {
    const text = FILES[e.path] ?? (e.path.endsWith(`/memory/${MEMORY_FILE}`) ? memoryText : undefined)
    if (text === undefined) throw new Error('missing')
    return { value: text }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('command.run', (_, e) => {
    ran.push([e.command, e.args])
    return { text: 'ok' }
  })
  on('session.surfaces', () => ({ value: surfaces }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  return { clock, toasts, ran, filled, saved }
}

test('the pane lists every skill with its status, on every surface', async ($, on) => {
  const { clock } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 's:frontend-design' }))?.text).toContain('frontend-design')
    expect((await ui.find({ key: 's:design:ux-copy' }))?.text).toContain('ux-copy')
    // Not in Claude's listing, but still startable from here.
    expect((await ui.find({ key: 's:berater' }))?.text).toContain('berater')
    // Own command and built-ins stay out.
    expect(await ui.find({ key: 's:cockpit' })).toBeUndefined()
    expect(await ui.find({ key: 's:help' })).toBeUndefined()
    // A recommended design skill that is not installed.
    expect((await ui.find({ key: 'c:apple-design' }))?.text).toContain('apple-design')
    expect(await ui.find({ key: 'c:frontend-design' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /passen nicht in Claudes Liste/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a loaded skill shows as a toast, in the band and in the timeline', async ($, on) => {
  const { clock, toasts } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)
  await $.skill.prompt({ skill: 'design:ux-copy', text: 'Prompt', path: `${UX}/SKILL.md` })

  expect(toasts).toContain('✦ Skill geladen: ux-copy')

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'cockpit-skills' }))?.text).toContain('1 geladen')
  const pulse = async () =>
    (await band.findAll({ type: 'Svg' })).find(svg => String(svg.props.alt).includes('Skill geladen'))
  expect(await pulse()).toBeDefined()
  // The pulse settles once the moment has passed; the minute tick redraws it.
  await clock.advance(120_000)
  expect(await pulse()).toBeUndefined()
  expect(await band.find({ type: 'Text', text: /ux-copy · vor 1 Min/ })).toBeDefined()
  await band.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await terminal.find({ key: 'cockpit-skills' }))?.text).toContain('1 geladen')
  await terminal.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /ux-copy vor 2 Min/ })).toBeDefined()
  await pane.unmount()
})

test('a skill opens its card with SKILL.md and its references', async ($, on) => {
  const { clock } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 's:design:ux-copy' })
    expect(await ui.find({ type: 'Text', text: /Verfügbar · Claude sieht ihn/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Plugin design/ })).toBeDefined()

    await ui.press({ key: 'body' })
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toContain('# UX Copy')

    await ui.press({ key: `r:${UX}/references/voice.md` })
    const docs = await ui.findAll({ type: 'Markdown' })
    expect(docs.some(doc => String(doc.props.text).includes('Kurz und freundlich'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /hero\.webp {2}\(Bild\)/ })).toBeDefined()

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    await ui.unmount()
  }
})

test('Starten runs the skill as its slash command with the task', async ($, on) => {
  const { clock, ran, toasts } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 's:frontend-design' })
  await ui.input({ key: 'task', text: 'Hero für die Landingpage' })

  expect(ran).toContainEqual(['frontend-design', 'Hero für die Landingpage'])
  expect(toasts).toContain('✦ frontend-design gestartet')
  await ui.unmount()
})

test('a recommended skill asks Claude to install it', async ($, on) => {
  const { clock, filled } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'c:apple-design' })
  expect(await ui.find({ type: 'Text', text: /Nicht installiert/ })).toBeDefined()
  expect(await ui.find({ type: 'Link' })).toBeDefined()
  await ui.press({ key: 'install' })

  expect(filled[0]).toContain('github.com/emilkowalski/skills/tree/main/skills/apple-design')
  expect(filled[0]).toContain('global')
  await ui.unmount()
})

test('favorites move to the top and come back from the store', async ($, on) => {
  const { clock, saved } = world(on, { favorites: ['design:ux-copy'] })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /★ Favoriten/ })).toBeDefined()
  expect((await ui.find({ key: 'f:design:ux-copy' }))?.text).toBe('★')

  await ui.press({ key: 'f:frontend-design' })
  expect((await ui.find({ key: 'f:frontend-design' }))?.text).toBe('★')
  expect(saved.favorites).toEqual(['design:ux-copy', 'frontend-design'])
  await ui.unmount()
})

test('search narrows the list and ignores folded categories', async ($, on) => {
  const { clock } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'k:Design' })
  expect(await ui.find({ key: 's:frontend-design' })).toBeUndefined()

  await ui.input({ key: 'q', text: 'front', kind: 'change' })
  expect(await ui.find({ key: 's:frontend-design' })).toBeDefined()
  expect(await ui.find({ key: 's:berater' })).toBeUndefined()
  await ui.unmount()
})

test('on the phone /cockpit draws the cockpit into its own row', async ($, on) => {
  const { clock, ran } = world(on, {}, ['mobile'])
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.advance(2000)

  const { text } = await $.command.run({ command: 'cockpit', args: '' } as never)
  expect(text).toContain('**Cockpit** · ◉ 0 geladen · ● 3 verfügbar · ○ 5 empfohlen')
  expect(text).toContain('- Design · 2 (+5 empfohlen)')
  expect(text).toContain('- Persönlich · 1')

  const row = await $.ui.mount({
    plugin: 'cockpit',
    component: 'CommandOutput',
    requestId: 'row',
    surface: 'mobile',
    props: { command: 'cockpit', args: '', text: text ?? '', isErrored: false },
  })
  expect((await row.find({ key: 's:frontend-design' }))?.text).toContain('frontend-design')
  await row.press({ key: 's:frontend-design' })
  // No text field on the phone: the card offers Starten as a button.
  expect(await row.find({ key: 'task' })).toBeUndefined()
  await row.press({ key: 'start' })
  expect(ran).toContainEqual(['frontend-design', ''])
  await row.unmount()
})

test('/cockpit with a word opens a category, a card, the SKILL.md or a search', async ($, on) => {
  const { clock } = world(on, {}, [])
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.advance(2000)
  const run = async (args: string) => (await $.command.run({ command: 'cockpit', args } as never)).text ?? ''

  const design = await run('design')
  expect(design).toContain('**Design** · 2 installiert · 5 empfohlen')
  expect(design).toContain('● **frontend-design**: Gestaltet Oberflächen mit Haltung')
  expect(design).toContain('○ **apple-design** (Emil Kowalski)')

  const card = await run('ux-copy')
  expect(card).toContain('● Verfügbar: Claude sieht ihn')
  expect(card).toContain('**Starten:** `/design:ux-copy deine Aufgabe`')
  expect(card).toContain('**Referenzdateien:** references/hero.webp, references/voice.md')
  expect(card).toContain('`/cockpit ux-copy anleitung`')

  const body = await run('ux-copy anleitung')
  expect(body).toContain('# UX Copy')
  expect(body).not.toContain('name: ux-copy')

  expect(await run('berater')).toContain('nicht in Claudes Liste')
  const recommended = await run('apple-design')
  expect(recommended).toContain('○ Nicht installiert.')
  expect(recommended).toContain('**Quelle:** github.com/emilkowalski/skills/tree/main/skills/apple-design')
  expect(await run('haltung')).toContain('● **frontend-design**')
  expect(await run('zzz')).toContain('Nichts gefunden')
})

test('with no drawing surface a loaded skill leaves a notice in the transcript', async ($, on) => {
  const { clock } = world(on, {}, [])
  const session = mock.session(on)
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.advance(2000)
  await $.skill.prompt({ skill: 'design:ux-copy', text: 'Prompt' })

  const notices = session.appended().filter(row => row.message.type === 'system')
  expect(JSON.stringify(notices)).toContain('✦ Skill geladen: ux-copy')
})

test('on the desktop a loaded skill shows as a toast alone', async ($, on) => {
  const { clock, toasts } = world(on)
  const session = mock.session(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)
  await $.skill.prompt({ skill: 'design:ux-copy', text: 'Prompt' })

  expect(toasts).toContain('✦ Skill geladen: ux-copy')
  expect(session.appended().filter(row => row.message.type === 'system')).toHaveLength(0)
})

test('the band shows how full the context window is, on every surface', async ($, on) => {
  const { clock } = world(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desktop.find({ type: 'Text', text: /^1 % Kontext$/ })).toBeDefined()
  expect((await desktop.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: /^◔ 1 % Kontext$/ })).toBeDefined()
  await terminal.unmount()
})

// --- Context sync to the phone's Cockpit page ------------------------------------

function syncWorld(
  on: On,
  answer: (input: Record<string, unknown>) => Record<string, unknown>,
  env: Record<string, string> = {},
) {
  const { clock } = world(on, {}, ['desktop'], env)
  const calls: Record<string, unknown>[] = []
  on('session.id', () => ({ value: 'session_test' }))
  on('session.repo', () => ({ value: { root: '/home/user/x', remote: 'https://github.com/leesyashin/Else-Live-', internal: false, name: null } }))
  // Typed loosely: the tool table's union is too large to infer here.
  const onTool = on as unknown as (event: string, matcher: object, hook: (_: unknown, e: Record<string, unknown>) => unknown) => void
  onTool('tool.call', { tool: 'ArtifactData' }, (_, input) => {
    calls.push(input)
    return answer(input)
  })
  return { clock, calls }
}

type Caller = { tool: { call: (args: object) => Promise<{ result?: unknown; text?: string }> } }
const run = ($: unknown) => ($ as Caller).tool.call({ tool: 'mcp__cockpit__sync_context' })

test('the context fill goes to the Cockpit page, creating its document once', async ($, on) => {
  let version = 0
  const { clock, calls } = syncWorld(on, input => {
    if (input.action === 'get') return { result: '', text: 'No document "cockpit"/"context".', isError: true }
    version += 1
    return { result: '', text: `Database set committed. The document is now at version ${version}.` }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const first = await run($)
  expect(String(first.result)).toBe('Abgeglichen: 1 %')
  expect(calls.map(c => c.action)).toEqual(['get', 'set'])
  const set = calls[1]!
  expect(set.url).toBe('https://claude.ai/artifact/3mAJQLuy66EZ9EoNiqAgT8')
  expect(set.if_version).toBeUndefined()
  expect(set.data).toMatchObject({ sessionId: 'session_test', repo: 'Else-Live-', used: 1000, max: 200000 })

  const second = await run($)
  expect(String(second.result)).toBe('Abgeglichen: 1 %')
  expect(calls.map(c => c.action)).toEqual(['get', 'set', 'set'])
  expect(calls[2]!.if_version).toBe(1)
})

test('a refused write stops the sync instead of asking again', async ($, on) => {
  const { clock, calls } = syncWorld(on, () => ({ deny: 'Nicht für Plugins' }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const answer = await run($)
  expect(String(answer.result)).toContain('Nicht erlaubt')
  expect(calls.length).toBe(1)
})

test('a session that compacts early reports its own threshold', async ($, on) => {
  const { clock, calls } = syncWorld(on, input =>
    input.action === 'get'
      ? { result: '', text: 'No document.', isError: true }
      : { result: '', text: 'The document is now at version 1.' },
  { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '80' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  await run($)
  // 80 % of the 200k window less the summary's reserve.
  expect(calls[1]!.data).toMatchObject({ threshold: 144000, repo: 'Else-Live-' })
})

// --- Setup check (Phase 4) ---------------------------------------------------------

function setupWorld(on: On, branch: string, memory: string | null = MEMORY) {
  memoryText = memory ?? undefined
  const page: Record<string, unknown>[] = []
  const { clock, calls } = syncWorld(on, input => {
    if (input.action === 'get') return { result: '', text: 'No document.', isError: true }
    if (input.doc_id === 'setup') page.push(input.data as Record<string, unknown>)
    return { result: '', text: 'The document is now at version 1.' }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${branch}\n`, stderr: '' } as never }))
  on('tool.list', () => ({
    value: [
      { name: 'Bash', description: '', mcp: false },
      { name: 'mcp__github__create_pull_request', description: '', mcp: true },
      { name: 'mcp__github__merge_pull_request', description: '', mcp: true },
    ],
  }))
  return { clock, calls, page }
}

test('the setup check finds connectors, skills and the branch from the memory file', async ($, on) => {
  const { clock, page } = setupWorld(on, 'claude/phase-4')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(5000)

  // The page got the whole report once.
  expect(page.length).toBe(1)
  const report = page[0] as { checks: { name: string; state: string }[]; memory: string }
  const states = Object.fromEntries(report.checks.map(check => [check.name, check.state]))
  expect(states).toEqual({
    [MEMORY_FILE]: 'ok',
    github: 'ok',
    figma: 'warn',
    'frontend-design': 'ok',
    'plugin-authoring': 'fail',
    'claude/phase-4': 'ok',
  })

  // The band shows one dot per group: connectors yellow, skills red, branch green.
  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    const setup = await band.find({ key: 'cockpit-setup' })
    expect(setup?.props.label).toBe('Setup: Connectors: Hinweis, Skills: fehlt, Branch: in Ordnung')
    const dots = (await band.findAll({ type: 'Text', text: '●' })).map(dot => dot.props.color)
    expect(dots).toEqual(['warning', 'error', 'success'])
    await band.unmount()
  }

  // The pane lists each check.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ key: 'k:Setup' }))?.text).toContain('4/6')
  expect(await pane.find({ type: 'Text', text: /plugin-authoring Fehlt in dieser Session/ })).toBeDefined()
  await pane.press({ key: 'k:Setup' })
  expect(await pane.find({ type: 'Text', text: /plugin-authoring Fehlt/ })).toBeUndefined()
  await pane.unmount()

  // A turn re-checks, but sends nothing when nothing changed.
  await clock.advance(61_000)
  await $.turn.complete({} as never).catch(() => undefined)
  expect(page.length).toBe(1)
})

test('working on the base branch is red, a detached checkout yellow', async ($, on) => {
  const { clock, page } = setupWorld(on, 'main')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(5000)
  const branch = (page[0] as { checks: { group: string; state: string; detail: string }[] }).checks.find(c => c.group === 'Branch')
  expect(branch).toMatchObject({ state: 'fail', detail: 'Direkt auf main: erst einen eigenen Branch anlegen' })
})

test('/cockpit setup prints the check; a repo without memory says how to add one', async ($, on) => {
  const { clock } = setupWorld(on, 'HEAD', null)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(5000)
  const answer = await $.command.run({ command: 'cockpit', args: 'setup' })
  const text = String((answer as { text?: string }).text)
  expect(text).toContain('Setup · Else-Live- · HEAD')
  expect(text).toContain('🟡 else-live-.md: Noch kein Memory: mods/cockpit/memory/else-live-.md anlegen')
  expect(text).toContain('🟡 Branch: Kein Branch ausgecheckt')
})

// --- PR and skill status to the page (Phase 6) ---------------------------------------

function prWorld(on: On, pr: Record<string, unknown>, runs: Record<string, unknown>[] = [], env: Record<string, string> = {}) {
  memoryText = MEMORY
  const writes: Record<string, unknown>[] = []
  const github: string[] = []
  let version = 0
  const { clock } = syncWorld(on, input => {
    if (input.action === 'get') return { result: '', text: 'No document.', isError: true }
    version += 1
    writes.push(input)
    return { result: '', text: `The document is now at version ${version}.` }
  }, env)
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'claude/phase-6\n', stderr: '' } as never }))
  on('tool.list', () => ({ value: [] }))
  on('tool.call', { tool: 'Bash' } as never, () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
  const answer = { current: pr }
  on('mcp.call', (_, e) => {
    github.push(`${e.tool}:${String(e.args.method ?? '')}`)
    const body =
      e.tool === 'list_pull_requests' ? [{ number: 47 }]
      : e.args.method === 'get' ? answer.current
      : e.args.method === 'get_check_runs' ? { total_count: runs.length, check_runs: runs }
      : { state: 'pending', statuses: [] }
    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }], isError: false } }
  })
  return { clock, writes, github, answer }
}

const PR = {
  number: 47, title: 'Phase 6', html_url: 'https://github.com/leesyashin/Else-Live-/pull/47', state: 'open', merged: false, draft: true,
  mergeable_state: 'clean', changed_files: 3, additions: 40, deletions: 2, updated_at: '2026-10-28T20:00:00Z',
  head: { ref: 'claude/phase-6' }, base: { ref: 'main' },
}

test('the branch PR goes to the merge card with CI, conflicts and files', async ($, on) => {
  const { clock, writes, github } = prWorld(on, PR, [
    { name: 'build', status: 'completed', conclusion: 'success' },
    { name: 'lint', status: 'in_progress', conclusion: null },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(7000)

  expect(github).toContain('list_pull_requests:')
  const pr = writes.find(write => write.doc_id === 'pr')!
  expect(pr.action).toBe('set')
  expect(pr.data).toMatchObject({
    repo: 'leesyashin/Else-Live-', number: 47, head: 'claude/phase-6', base: 'main', draft: true, state: 'open',
    ci: 'pending', mergeable: true, files: 3, additions: 40, deletions: 2,
    checks: [{ name: 'build', state: 'success' }, { name: 'lint', state: 'pending' }],
    session: 'session_test',
  })
  // The session card starts empty for this session.
  expect(writes.find(write => write.doc_id === 'status')?.data).toMatchObject({ loaded: [], session: 'session_test' })
})

test('a cloud session names itself on the card, so only it merges', async ($, on) => {
  const { clock, writes } = prWorld(on, PR, [], { CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_01AbC' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(7000)

  expect(writes.find(write => write.doc_id === 'pr')!.data).toMatchObject({
    session: 'session_test', sessionUrl: 'https://claude.ai/code/session_01AbC',
  })
})

test('a push refreshes the card; the same PR is updated, keeping Claude\'s merge field', async ($, on) => {
  const { clock, writes, answer } = prWorld(on, PR)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(7000)
  const before = writes.filter(write => write.doc_id === 'pr').length

  answer.current = { ...PR, mergeable_state: 'dirty', changed_files: 4 }
  const call = $.tool.call as unknown as (args: object) => Promise<unknown>
  await call({ tool: 'Bash', command: 'git push -u origin claude/phase-6' }).catch(() => undefined)
  await clock.advance(3000)

  const prs = writes.filter(write => write.doc_id === 'pr')
  expect(prs.length).toBe(before + 1)
  expect(prs.at(-1)!.action).toBe('update')
  expect(prs.at(-1)!.data).toMatchObject({ mergeable: false, files: 4 })
})

test('a loaded skill is written to the session card', async ($, on) => {
  const { clock, writes } = prWorld(on, PR)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(7000)
  await $.skill.prompt({ skill: 'design:ux-copy', text: 'Prompt', path: `${UX}/SKILL.md` })
  await clock.advance(100)

  const status = writes.filter(write => write.doc_id === 'status').at(-1)
  expect(status?.data).toMatchObject({ loaded: [{ skill: 'design:ux-copy' }], session: 'session_test' })
})

// --- Orders from the phone: only one session acts ------------------------------------

const PAGE = 'https://claude.ai/artifact/3mAJQLuy66EZ9EoNiqAgT8'

function thread(id: string, lines: string[]) {
  return `Thread ${id}
  open · Claude: activated · created 2026-10-28
  [on page] index.html
  [the user (owner), posted by the artifact, sent to you — awaiting reply — 2026-10-28T21:10]
${lines.map(line => `      ab12cd34| ${line}`).join('\n')}
`
}

function commentsWorld(on: On, threads: string, claims: Record<string, string> = {}) {
  const { clock, calls } = syncWorld(on, input => {
    if (input.collection !== 'cockpit/jobs/threads') return { result: '', text: 'No document.', isError: true }
    const owner = claims[String(input.doc_id)]
    if (input.action === 'get') return owner ? { result: '', text: `{"id":"x","data":{"session":"${owner}"},"version":1}` } : { result: '', text: 'No document.', isError: true }
    if (owner) return { result: '', text: 'Refused: the document already exists (version 1).', isError: true }
    claims[String(input.doc_id)] = String((input.data as { session: string }).session)
    return { result: '', text: 'Database set committed. The document is now at version 1.' }
  })
  const onTool = on as unknown as (event: string, matcher: object, hook: () => unknown) => void
  onTool('tool.call', { tool: 'ArtifactComments' }, () => ({
    result: '', text: `2 comment threads\n=== BEGIN ARTIFACT COMMENTS ab12cd34 — viewer-submitted ===\n${threads}=== END ARTIFACT COMMENTS ab12cd34 ===`,
  }))
  const read = async ($: unknown) => {
    const answer = await ($ as Caller).tool.call({ tool: 'ArtifactComments', action: 'read', url: PAGE }) as { context?: string[] }
    return (answer.context ?? []).join('\n')
  }
  return { clock, calls, claims, read }
}

test('an order naming another session is left alone, without a claim', async ($, on) => {
  const { clock, calls, read } = commentsWorld(on, thread('t-merge', ['Cockpit · Merge', 'leesyashin/Else-Live- #47: a → main', 'Session: other']))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const note = await read($)
  expect(note).toContain('Thread t-merge („Merge“): gehört NICHT dieser Session. Der Auftrag nennt Session other.')
  // Not meant for it: one line in its own chat, no explanation.
  expect(note).toContain('genau einer Zeile, „Cockpit: Auftrag für eine andere Session.“')
  expect(calls.filter(call => call.collection === 'cockpit/jobs/threads').length).toBe(0)
})

test('an order without a session goes to the first session that claims it', async ($, on) => {
  const claims: Record<string, string> = { 't-old': 'session_else' }
  const { clock, read } = commentsWorld(on, thread('t-new', ['Cockpit · Skill installieren', 'apple-design von Emil Kowalski']) + thread('t-old', ['Cockpit · Skill laden', '/ux-copy']), claims)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  const note = await read($)
  expect(claims['t-new']).toBe('session_test')
  expect(note).toContain('Thread t-new („Skill installieren“): gehört DIESER Session.')
  expect(note).toContain('Thread t-old („Skill laden“): gehört NICHT dieser Session. Session session_else hat ihn schon übernommen.')
  // An install is global: into the mod and the repo, not this container alone.
  expect(note).toContain('mods/cockpit/skills/<name>/')
  // Read again, the claim is still this session's.
  expect(await read($)).toContain('Thread t-new („Skill installieren“): gehört DIESER Session.')
})

test('a thread that is answered or no order gets no note', async ($, on) => {
  const { clock, read } = commentsWorld(on, thread('t-chat', ['Schöne Seite!']))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(2000)

  expect(await read($)).toBe('')
})

test('the rules for orders reach the system prompt in every repo', async ($, on) => {
  world(on)
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'Hallo', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(sections.at(-1)).toMatchObject({ id: 'cockpit:orders', scope: 'session' })
  expect(sections.at(-1)!.text).toContain('cockpit/jobs/threads/<Thread-ID>')
})

// --- One tap to the page --------------------------------------------------------------

test('/seite opens the Cockpit page and leaves its link', async ($, on) => {
  const { clock } = world(on)
  const opened: unknown[] = []
  const onTool = on as unknown as (event: string, matcher: object, hook: (_: unknown, e: Record<string, unknown>) => unknown) => void
  onTool('tool.call', { tool: 'Artifact' }, (_, input) => {
    opened.push(input.url)
    return { result: '', text: 'Opened.' }
  })
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.advance(2000)

  const answer = await $.command.run({ command: 'seite', args: '' })
  expect(String((answer as { text?: string }).text)).toBe(`Cockpit-Seite geöffnet. [Cockpit-Seite öffnen ↗](${PAGE})`)
  expect(opened).toEqual([PAGE])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'cockpit', component: 'CommandOutput', requestId: 'seite', surface,
      props: { command: 'seite', args: '', isErrored: false, text: '', bodyColumns: 40, scroll: { offset: 0, bodyRows: 10 }, view: {} },
    } as never)
    expect(await ui.find({ type: 'Link', props: { href: PAGE } })).toBeDefined()
    await ui.unmount()
  }
})

// --- Every current session, by repo -----------------------------------------------------

const NOW_ISO = new Date(1_000_000).toISOString()
const OLD_ISO = new Date(1_000_000 - 2 * 24 * 60 * 60 * 1000).toISOString()
const SESSIONS = [
  { id: 'session_b', title: 'Website', session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', updated_at: NOW_ISO },
  { id: 'session_test', title: 'Diese hier', session_status: 'SESSION_STATUS_RUNNING', status_bucket: 'SESSION_STATUS_BUCKET_WORKING', updated_at: NOW_ISO },
  { id: 'session_a', title: 'Prop review', session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_REVIEW_READY', updated_at: NOW_ISO },
  { id: 'session_old', title: 'Alt', session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', updated_at: OLD_ISO },
  { id: 'session_gone', title: 'Archiviert', session_status: 'SESSION_STATUS_ARCHIVED', status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', updated_at: NOW_ISO },
  { id: 'session_none', title: 'Nur Chat', session_status: 'SESSION_STATUS_IDLE', status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', updated_at: NOW_ISO },
]
const SOURCES: Record<string, string | null> = {
  session_b: 'https://github.com/leesyashin/Else-Live-',
  session_test: 'https://github.com/leesyashin/Else-Live-',
  session_a: 'https://github.com/leesyashin/IF-Prop',
  session_none: null,
}

function sessionsWorld(on: On) {
  const asked: string[] = []
  const { clock, calls } = syncWorld(on, () => ({ result: '', text: 'The document is now at version 1.' }))
  on('mcp.call', (_, e) => {
    const id = String(e.args.session_id ?? '')
    asked.push(`${e.server}:${e.tool}${id ? `:${id}` : ''}`)
    const source = SOURCES[id]
    const body =
      e.tool === 'list_sessions' ? { ccr: { data: SESSIONS, has_more: false } }
      : { ccr: { id, session_context: { sources: source ? [{ git_repository: { url: source } }] : [] } } }
    // The connector wraps its JSON in a note of its own.
    return { value: { content: [{ type: 'text', text: `<other-session>\n${JSON.stringify(body)}\n</other-session>` }], isError: false } }
  })
  return { clock, calls, asked }
}

test('/sessions lists the current sessions under their repo, each one a link', async ($, on) => {
  const { clock, calls, asked } = sessionsWorld(on)
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  await clock.advance(8000)

  expect(asked).toContain('claude-code-remote:list_sessions')
  // Archived and old sessions are read no further.
  expect(asked).not.toContain('claude-code-remote:get_session:session_old')

  const text = String(((await $.command.run({ command: 'sessions', args: '' } as never)) as { text?: string }).text)
  expect(text).not.toContain('Alt')
  expect(text).not.toContain('Archiviert')
  // Repos A–Z, then the sessions without one.
  const order = ['**leesyashin/Else-Live-** · 2', '**leesyashin/IF-Prop** · 1', '**Ohne Repo** · 1'].map(line => text.indexOf(line))
  expect(order.every(at => at >= 0)).toBe(true)
  expect([...order].sort((a, b) => a - b)).toEqual(order)
  expect(text).toContain('[Website](https://claude.ai/code/session_b) · wartet auf dich')
  expect(text).toContain('[Diese hier](https://claude.ai/code/session_test) · arbeitet · gerade eben · diese Session')

  // The phone's page gets the same list.
  const doc = calls.find(call => call.doc_id === 'sessions' && call.action === 'set')
  expect((doc?.data as { rows: unknown[] }).rows.length).toBe(4)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({
      plugin: 'cockpit', component: 'CommandOutput', requestId: 'sessions', surface,
      props: { command: 'sessions', args: '', isErrored: false, text: '', bodyColumns: 40, scroll: { offset: 0, bodyRows: 20 }, view: {} },
    } as never)
    const hrefs = (await ui.findAll({ type: 'Link' })).map(link => link.props.href)
    expect(hrefs).toEqual([
      'https://claude.ai/code/session_b', 'https://claude.ai/code/session_test',
      'https://claude.ai/code/session_a', 'https://claude.ai/code/session_none',
    ])
    await ui.unmount()
  }

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ key: 'k:Sessions' }))?.text).toContain('4 aktuell · 3 Repos')
  await pane.unmount()
})

// --- A finished team leaves the page ----------------------------------------------------

function teamWorld(on: On, prState: string, memberState = 'done') {
  const line = (id: string, data: object, version: number) => JSON.stringify({ id, data, version })
  const members = ['session_m1', 'session_m2'].map((id, i) =>
    line(id, { name: `Teil ${i + 1}`, state: memberState, pr: 53 + i, url: `https://claude.ai/code/${id}` }, 3))
  const { clock, calls } = syncWorld(on, input => {
    if (input.action === 'get' && input.doc_id === 'team') {
      return { result: '', text: `=== BEGIN ARTIFACT DB x ===\n${line('team', { goal: 'Smooth', state: 'done', startedAt: 7 }, 2)}\n=== END ARTIFACT DB x ===` }
    }
    if (input.action === 'list') return { result: '', text: `=== BEGIN ARTIFACT DB x ===\n${members.join('\n')}\n=== END ARTIFACT DB x ===` }
    if (input.action === 'set' && input.collection === 'cockpit/jobs/threads') return { result: '', text: 'Database set committed.' }
    return { result: '', text: 'Database set committed. The document is now at version 1.' }
  })
  const archived: string[] = []
  on('mcp.call', (_, e) => {
    const text = (body: unknown) => ({ value: { content: [{ type: 'text', text: JSON.stringify(body) }], isError: false } })
    if (e.tool === 'pull_request_read') return text({ number: e.args.pullNumber, state: prState, merged: false })
    if (e.tool === 'archive_session') {
      archived.push(String(e.args.session_id))
      return text({ ok: true })
    }
    if (e.tool === 'get_session') return text({ ccr: { id: e.args.session_id, session_context: { sources: [{ git_repository: { url: 'https://github.com/leesyashin/Else-Live-' } }] } } })
    return text({ ccr: { data: [] } })
  })
  return { clock, calls, archived }
}

test('a team that is done and merged is archived and its cards cleared', async ($, on) => {
  const { clock, calls, archived } = teamWorld(on, 'closed')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(8000)

  expect(archived).toEqual(['session_m1', 'session_m2'])
  const batch = calls.find(call => call.action === 'batch') as { writes: Record<string, unknown>[] } | undefined
  expect(batch?.writes).toEqual([
    { op: 'delete', collection: 'cockpit/team/members', doc_id: 'session_m1', if_version: 3 },
    { op: 'delete', collection: 'cockpit/team/members', doc_id: 'session_m2', if_version: 3 },
    expect.objectContaining({ op: 'update', doc_id: 'team', if_version: 2, data: expect.objectContaining({ state: 'archived' }) }),
  ])
})

test('a team with a PR still open stays', async ($, on) => {
  const { clock, archived, calls } = teamWorld(on, 'open')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(8000)
  expect(archived).toEqual([])
  expect(calls.some(call => call.action === 'batch')).toBe(false)
})

test('a team chat still at work keeps the team', async ($, on) => {
  const { clock, archived } = teamWorld(on, 'closed', 'working')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.advance(8000)
  expect(archived).toEqual([])
})
