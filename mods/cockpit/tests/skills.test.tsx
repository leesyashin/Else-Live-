import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
function world(on: On, store: Record<string, unknown> = {}) {
  // The store in memory, so a test can read what the plugin kept.
  const saved: Record<string, unknown> = { ...store }
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  mock.env(on, { HOME })
  const clock = mock.clock(on, { now: 1_000_000 })
  const toasts: string[] = []
  const ran: string[][] = []
  const filled: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
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
    const text = FILES[e.path]
    if (text === undefined) throw new Error('missing')
    return { value: text }
  })
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('command.run', (_, e) => {
    ran.push([e.command, e.args])
    return { text: 'ok' }
  })
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
  expect(await band.find({ type: 'Svg' })).toBeDefined()
  // The pulse settles once the moment has passed; the minute tick redraws it.
  await clock.advance(120_000)
  expect(await band.find({ type: 'Svg' })).toBeUndefined()
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
