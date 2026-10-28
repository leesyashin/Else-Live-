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

  expect(filled[0]).toContain('npx skills@latest add emilkowalski/skills')
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
  expect(recommended).toContain('**Installation:** npx skills@latest add emilkowalski/skills')
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
  const report = page[0] as { checks: { name: string; state: string }[]; checklist: unknown[]; merges: string[]; memory: string }
  const states = Object.fromEntries(report.checks.map(check => [check.name, check.state]))
  expect(states).toEqual({
    [MEMORY_FILE]: 'ok',
    github: 'ok',
    figma: 'warn',
    'frontend-design': 'ok',
    'plugin-authoring': 'fail',
    'claude/phase-4': 'ok',
  })
  expect(report.checklist).toEqual([
    { text: 'Mod geladen', done: true },
    { text: 'Figma freigeben', done: false },
  ])
  expect(report.merges).toEqual(['2026-10-28 · #46 Merge-Knopf'])

  // The band shows one dot per group: connectors yellow, skills red, branch green.
  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    const setup = await band.find({ key: 'cockpit-setup' })
    expect(setup?.props.label).toBe('Setup: Connectors: Hinweis, Skills: fehlt, Branch: in Ordnung')
    const dots = (await band.findAll({ type: 'Text', text: '●' })).map(dot => dot.props.color)
    expect(dots).toEqual(['warning', 'error', 'success'])
    await band.unmount()
  }

  // The pane lists each check and the open checklist items.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ key: 'k:Setup' }))?.text).toContain('4/6')
  expect(await pane.find({ type: 'Text', text: /plugin-authoring Fehlt in dieser Session/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Figma freigeben/ })).toBeDefined()
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
