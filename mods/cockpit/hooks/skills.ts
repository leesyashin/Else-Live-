import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SetupReport, SkillDetail, SkillFile, SkillRow, SkillSummary, SkillUse } from '../types'
import { CATALOG, catalogFor } from './catalog'
import type { CatalogEntry } from './catalog'

type $ = EngineInterface

// The state lives here alone (the engine reads atoms only in the file that
// makes them); the drawing reads it through the views below.
// Change a tag when that value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const skills = atom({ plugin: 'cockpit', key: 'skills' } as const, [], { shape: 'skills-1' })
const summary = atom({ plugin: 'cockpit', key: 'summary' } as const, null, { shape: 'summary-1' })
const uses = atom({ plugin: 'cockpit', key: 'uses' } as const, [], { shape: 'uses-1' })
const favorites = atom({ plugin: 'cockpit', key: 'favorites' } as const, [], { shape: 'favorites-1' })
const paths = atom({ plugin: 'cockpit', key: 'paths' } as const, {}, { shape: 'paths-1' })
const detail = atom({ plugin: 'cockpit', key: 'detail' } as const, null, { shape: 'detail-1' })
const folded = atom({ plugin: 'cockpit', key: 'folded' } as const, [], { shape: 'folded-1' })
const selected = atom({ plugin: 'cockpit', key: 'selected' } as const, null)
const showBody = atom({ plugin: 'cockpit', key: 'showBody' } as const, false)
const query = atom({ plugin: 'cockpit', key: 'query' } as const, '')
const tick = atom({ plugin: 'cockpit', key: 'tick' } as const, 0)
const setup = atom({ plugin: 'cockpit', key: 'setup' } as const, null, { shape: 'setup-2' })

// --- Views a drawing reads (each read subscribes it to that value) ----------

export async function bandView($: $) {
  const [rows, used, now] = await Promise.all([read($, skills), read($, uses), $.clock.now()])
  await read($, tick)

  return { rows, used, now }
}

export async function listView($: $) {
  const [rows, used, favs, sum, needle, closed, now] = await Promise.all([
    read($, skills),
    read($, uses),
    read($, favorites),
    read($, summary),
    read($, query),
    read($, folded),
    $.clock.now(),
  ])
  await read($, tick)

  return { rows, used, favs, sum, needle, closed, now }
}

export async function cardView($: $) {
  const [rows, used, favs, card, isBodyOpen, now] = await Promise.all([
    read($, skills),
    read($, uses),
    read($, favorites),
    read($, detail),
    read($, showBody),
    $.clock.now(),
  ])
  await read($, tick)

  return { rows, used, favs, card, isBodyOpen, now }
}

export function setupView($: $): Promise<SetupReport | null> {
  return read($, setup)
}

export function skillUses($: $): Promise<SkillUse[]> {
  return read($, uses)
}

export function skillRows($: $): Promise<SkillRow[]> {
  return read($, skills)
}

export function saveSetup($: $, report: SetupReport): Promise<SetupReport | null> {
  return update($, setup, () => report)
}

export function selectedSkill($: $): Promise<string | null> {
  return read($, selected)
}

// --- Small writes the drawing's handlers make --------------------------------

export function bumpTick($: $): Promise<number> {
  return update($, tick, n => n + 1)
}

export function setQuery($: $, text: string): Promise<string> {
  return update($, query, () => text)
}

export function toggleFold($: $, category: string): Promise<string[]> {
  return update($, folded, list =>
    list.includes(category) ? list.filter(one => one !== category) : [...list, category],
  )
}

export function toggleBody($: $): Promise<boolean> {
  return update($, showBody, isOpen => !isOpen)
}

export const OWN_COMMAND = 'cockpit'
export const CATEGORIES = ['Design', 'Code', 'Daten', 'Business', 'Persönlich', 'Weitere'] as const
export type Category = (typeof CATEGORIES)[number]

const PREFIX_CATEGORY: Record<string, Category> = {
  design: 'Design',
  data: 'Daten',
  marketing: 'Business',
  legal: 'Business',
  sales: 'Business',
  productivity: 'Persönlich',
}

const KEYWORDS: readonly (readonly [Category, RegExp])[] = [
  ['Persönlich', /berater|coach|coworker|morning|memory|task|productivity/],
  ['Design', /design|frontend|taste|\bui\b|ux|animat|motion|artifact|canvas|theme|brand|interface|visual|accessib|figma/],
  ['Daten', /data|sql|dataviz|chart|xlsx|analy|statist|dashboard/],
  ['Code', /review|simplify|security|\binit\b|\brun\b|plugin|workflow|api|hook|config|keybinding|permission|loop|commit|test|debug|code|deploy/],
  ['Business', /docx|pptx|pdf|docs|workspace|marketing|legal|seo|campaign|email|contract|research|brief|sales/],
]

export function shortName(name: string): string {
  return name.split(':').at(-1) ?? name
}

export function prefixOf(name: string): string | undefined {
  const parts = name.split(':')

  return parts.length > 1 ? parts.slice(0, -1).join(':') : undefined
}

export function categorize(row: SkillRow): Category {
  const prefix = prefixOf(row.name)?.split(':').at(-1)
  if (prefix && PREFIX_CATEGORY[prefix]) return PREFIX_CATEGORY[prefix]
  if (catalogFor(row.name)) return 'Design'
  const name = shortName(row.name).toLowerCase()
  const byName = KEYWORDS.find(([, pattern]) => pattern.test(name))
  if (byName) return byName[0]
  const byText = KEYWORDS.find(([, pattern]) => pattern.test(row.description.toLowerCase()))

  return byText ? byText[0] : 'Weitere'
}

export function sourceLabel(row: SkillRow): string {
  switch (row.source) {
    case 'built-in':
    case 'builtin':
      return 'Eingebaut'
    case 'plugin':
      return row.plugin ? `Plugin ${row.plugin}` : 'Plugin'
    case 'userSettings':
    case 'user':
      return 'Deine eigenen'
    case 'projectSettings':
      return 'Aus diesem Repo'
    case 'policySettings':
      return 'Von der Organisation'
    case 'syncedSkills':
      return 'Mit deinem Konto synchronisiert'
    case 'mcp':
      return 'Von einem Connector'
    default:
      return row.source
  }
}

// Reads Claude's skill listing and the runnable commands, and merges them.
export async function refresh($: $): Promise<void> {
  const [usage, commands] = await Promise.all([
    $.session.usage({ breakdown: 'summary' }).catch(() => undefined),
    $.command.list().catch(() => []),
  ])
  const listing = usage?.context.breakdown?.skills
  const described = new Map(commands.map(command => [command.name, command]))
  const rows = new Map<string, SkillRow>()

  for (const skill of listing?.skillFrontmatter ?? []) {
    const command = described.get(skill.name)
    rows.set(skill.name, {
      name: skill.name,
      description: command?.description ?? '',
      source: skill.source,
      plugin: skill.pluginName ?? command?.plugin,
      tokens: skill.tokens,
      isListed: true,
    })
  }
  for (const command of commands) {
    if (command.source === 'builtin' || command.name === OWN_COMMAND || rows.has(command.name)) continue
    rows.set(command.name, {
      name: command.name,
      description: command.description,
      source: command.source,
      plugin: command.plugin,
      tokens: 0,
      isListed: false,
    })
  }

  const list = [...rows.values()].sort((a, b) => shortName(a.name).localeCompare(shortName(b.name)))
  // A skill installed since the last look gets found on the next card.
  index = undefined
  const now = await $.clock.now()
  const next: SkillSummary = {
    total: listing?.totalSkills ?? list.length,
    included: listing?.includedSkills ?? list.filter(row => row.isListed).length,
    loadedAt: now,
  }
  await update($, skills, () => list)
  await update($, summary, () => next)
}

export async function recordUse($: $, skill: string, path: string | undefined): Promise<SkillUse> {
  const at = await $.clock.now()
  const use: SkillUse = { id: `${at}-${skill}`, skill, at }
  await update($, uses, list => [...list, use].slice(-100))
  if (path) await update($, paths, known => ({ ...known, [skill]: path }))

  return use
}

export async function toggleFavorite($: $, name: string): Promise<void> {
  const list = await update($, favorites, list =>
    list.includes(name) ? list.filter(one => one !== name) : [...list, name],
  )
  await $.store.set('favorites', list).catch(() => undefined)
}

export async function loadFavorites($: $): Promise<void> {
  const stored = await $.store.get('favorites').catch(() => undefined)
  if (Array.isArray(stored)) {
    const names = stored.filter((one): one is string => typeof one === 'string')
    await update($, favorites, () => names)
  }
}

// --- Finding a skill's files ------------------------------------------------

const SKIP = new Set(['node_modules', '.git', 'types', 'dist', 'build', '.cache'])
let index: Promise<Map<string, string>> | undefined

async function scan($: $): Promise<Map<string, string>> {
  const home = await $.env.get('HOME').catch(() => undefined)
  const roots = ['.claude/skills']
  if (home) roots.push(`${home}/.claude/skills`, `${home}/.claude/plugins`)
  const found = new Map<string, string>()
  const queue = roots.map(path => ({ path, depth: 0 }))
  let visits = 0

  while (queue.length > 0 && visits < 1500) {
    const { path, depth } = queue.shift()!
    visits += 1
    const entries = await $.fs.list(path).catch(() => [])
    if (entries.some(entry => entry.kind === 'file' && entry.name === 'SKILL.md')) {
      const parts = path.split('/')
      const skill = parts.at(-1) ?? path
      const at = parts.lastIndexOf('skills')
      const owner = at > 0 ? parts[at - 1] : undefined
      const file = `${path}/SKILL.md`
      if (!found.has(skill)) found.set(skill, file)
      if (owner) found.set(`${owner}:${skill}`, file)
      continue
    }
    if (depth >= 8) continue
    for (const entry of entries) {
      const isHidden = entry.name.startsWith('.') && entry.name !== '.claude'
      if (entry.kind !== 'dir' || isHidden || SKIP.has(entry.name)) continue
      queue.push({ path: `${path}/${entry.name}`, depth: depth + 1 })
    }
  }

  return found
}

async function skillFile($: $, name: string): Promise<string | undefined> {
  const known = (await read($, paths))[name]
  if (known) return known
  index ??= scan($)
  const found = await index

  return found.get(name) ?? found.get(shortName(name))
}

const TEXT = /\.(md|mdx|txt)$/i
const CODE = /\.(py|js|mjs|ts|tsx|jsx|json|csv|ya?ml|sh|css|html|toml)$/i
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i

function kindOf(name: string): SkillFile['kind'] {
  if (TEXT.test(name)) return 'markdown'
  if (/\.svg$/i.test(name)) return 'svg'
  if (CODE.test(name)) return 'code'
  if (IMAGE.test(name)) return 'image'

  return 'other'
}

async function listFiles($: $, folder: string): Promise<SkillFile[]> {
  const files: SkillFile[] = []
  const top = await $.fs.list(folder).catch(() => [])
  for (const entry of top) {
    if (entry.name.startsWith('.')) continue
    if (entry.kind === 'file' && entry.name !== 'SKILL.md') {
      files.push({ path: `${folder}/${entry.name}`, label: entry.name, kind: kindOf(entry.name) })
    }
    if (entry.kind === 'dir' && !SKIP.has(entry.name)) {
      const inner = await $.fs.list(`${folder}/${entry.name}`).catch(() => [])
      for (const one of inner) {
        if (one.kind !== 'file' || one.name.startsWith('.')) continue
        const label = `${entry.name}/${one.name}`
        files.push({ path: `${folder}/${label}`, label, kind: kindOf(one.name) })
      }
    }
    if (files.length >= 40) break
  }

  return files.sort((a, b) => a.label.localeCompare(b.label))
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
}

const MAX_TEXT = 12000

function cap(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n\n… (gekürzt)` : text
}

// A recommended skill that is not installed is selected as `catalog:<id>`.
export const CATALOG_PREFIX = 'catalog:'

export async function openSkill($: $, name: string): Promise<void> {
  await update($, selected, () => name)
  await update($, showBody, () => false)
  if (name.startsWith(CATALOG_PREFIX)) {
    await update($, detail, () => ({ skill: name, files: [], isLoading: false }))
    return
  }
  await update($, detail, () => ({ skill: name, files: [], isLoading: true }))
  const path = await skillFile($, name).catch(() => undefined)
  const next: SkillDetail = { skill: name, path, files: [], isLoading: false }
  if (path) {
    const folder = path.slice(0, path.lastIndexOf('/'))
    const [text, files] = await Promise.all([
      $.fs.read(path).catch(() => undefined),
      listFiles($, folder),
    ])
    next.body = typeof text === 'string' ? cap(stripFrontmatter(text)) : undefined
    next.files = files
  }
  // The person may have moved on to another skill meanwhile.
  if ((await read($, selected)) === name) await update($, detail, () => next)
}

export async function openFile($: $, file: SkillFile): Promise<void> {
  const text = await $.fs.read(file.path).catch(() => undefined)
  await update($, detail, current =>
    current && {
      ...current,
      openPath: current.openPath === file.path ? undefined : file.path,
      openText: typeof text === 'string' ? cap(text) : undefined,
    },
  )
}

export async function closeSkill($: $): Promise<void> {
  await update($, selected, () => null)
  await update($, detail, () => null)
}

// Runs the skill as a slash command where it is one, else asks Claude for it.
export async function startSkill($: $, name: string, task: string): Promise<void> {
  const commands = await $.command.list().catch(() => [])
  const text = task.trim()
  if (commands.some(command => command.name === name)) {
    await $.command.run({ command: name, args: text })
  } else {
    await $.prompt.submit({ text: `Nutze den Skill „${name}“${text ? `: ${text}` : '.'}` })
  }
  $.ui.toast(`✦ ${shortName(name)} gestartet`)
}

export async function askToInstall($: $, id: string): Promise<void> {
  const entry = CATALOG.find(one => one.id === id)
  if (!entry) return
  await $.prompt.fill({
    text: `Installiere bitte den Design-Skill „${entry.title}“ von ${entry.author} global, so wie die Cockpit-Regeln es beschreiben (mods/cockpit/skills und .claude/skills in Else-Live-). Quelle: ${entry.install}`,
    mode: 'replace',
  })
}

// --- /cockpit as text --------------------------------------------------------
// What a client sees where it draws no tree of the plugin's (the phone shows a
// cloud session's command rows as text), and what the model reads of the run.

const BODY_WORDS = new Set(['anleitung', 'skill.md', 'md'])

function oneLine(text: string, room: number): string {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > room ? `${line.slice(0, room - 1)}…` : line
}

function findCategory(word: string): Category | undefined {
  return CATEGORIES.find(category => category.toLowerCase() === word.toLowerCase())
}

function findSkill(rows: SkillRow[], word: string): SkillRow | undefined {
  const lower = word.toLowerCase()

  return (
    rows.find(row => row.name.toLowerCase() === lower) ??
    rows.find(row => shortName(row.name).toLowerCase() === lower)
  )
}

function findCatalog(word: string): CatalogEntry | undefined {
  const lower = word.toLowerCase()

  return CATALOG.find(entry => entry.id === lower || entry.title.toLowerCase() === lower)
}

// `/cockpit` alone, `/cockpit <Kategorie>`, `/cockpit <skill> [anleitung]`,
// or anything else as a search.
export async function textFor($: $, args: string): Promise<string> {
  const words = args.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return textOverview($)
  const wantsBody = words.length > 1 && BODY_WORDS.has(words.at(-1)!.toLowerCase())
  const term = (wantsBody ? words.slice(0, -1) : words).join(' ')
  const rows = await read($, skills)
  const category = findCategory(term)
  if (category) return textCategory($, category)
  const row = findSkill(rows, term)
  if (row) return textSkill($, row.name, wantsBody)
  const entry = findCatalog(term)
  if (entry) return textSkill($, `${CATALOG_PREFIX}${entry.id}`, false)

  return textSearch($, term)
}

async function textOverview($: $): Promise<string> {
  const [rows, used, favs, sum, now] = await Promise.all([
    read($, skills),
    read($, uses),
    read($, favorites),
    read($, summary),
    $.clock.now(),
  ])
  const active = new Set(used.map(use => use.skill))
  const installed = new Set(rows.map(row => catalogFor(row.name)?.id))
  const missing = CATALOG.filter(entry => !installed.has(entry.id))
  const lines = [`**Cockpit** · ◉ ${active.size} geladen · ● ${rows.length} verfügbar · ○ ${missing.length} empfohlen`]
  const unlisted = sum ? Math.max(0, sum.total - sum.included) : 0
  if (unlisted > 0) lines.push(`⚠ ${unlisted} Skills passen nicht in Claudes Liste: Claude wählt sie nicht von selbst.`)
  const favored = rows.filter(row => favs.includes(row.name)).map(row => shortName(row.name))
  if (favored.length > 0) lines.push(`★ **Favoriten:** ${favored.join(', ')}`)
  const recent = [...used].reverse().filter((use, at, list) => list.findIndex(one => one.skill === use.skill) === at)
  if (recent.length > 0) {
    lines.push(`◉ **Geladen:** ${recent.map(use => `${shortName(use.skill)} (${ago(now, use.at)})`).join(', ')}`)
  }
  const counts = CATEGORIES.map(category => {
    const count = rows.filter(row => categorize(row) === category).length
    const extra = category === 'Design' && missing.length > 0 ? ` (+${missing.length} empfohlen)` : ''

    return count > 0 || extra ? `- ${category} · ${count}${extra}` : undefined
  }).filter(Boolean)
  lines.push(`**Kategorien**\n${counts.join('\n')}`)
  lines.push('`/cockpit design` zeigt eine Kategorie mit Beschreibungen, `/cockpit ux-copy` die Infokarte eines Skills.')

  return lines.join('\n\n')
}

function statusMark(row: SkillRow, active: Set<string>): string {
  if (active.has(row.name)) return '◉'

  return '●'
}

async function textCategory($: $, category: Category): Promise<string> {
  const [rows, used] = await Promise.all([read($, skills), read($, uses)])
  const active = new Set(used.map(use => use.skill))
  const members = rows.filter(row => categorize(row) === category)
  const installed = new Set(rows.map(row => catalogFor(row.name)?.id))
  const missing = category === 'Design' ? CATALOG.filter(entry => !installed.has(entry.id)) : []
  const head = `**${category}** · ${members.length} installiert${missing.length > 0 ? ` · ${missing.length} empfohlen` : ''}`
  const lines = members.map(row => {
    const hint = row.isListed ? '' : ' _(nicht in Claudes Liste)_'
    const text = row.description ? `: ${oneLine(row.description, 110)}` : ''

    return `${statusMark(row, active)} **${shortName(row.name)}**${hint}${text}`
  })
  for (const entry of missing) lines.push(`○ **${entry.title}** (${entry.author}): ${entry.summary}`)

  return [head, lines.join('\n'), '`/cockpit <name>` öffnet die Infokarte.'].join('\n\n')
}

async function textSearch($: $, term: string): Promise<string> {
  const [rows, used] = await Promise.all([read($, skills), read($, uses)])
  const active = new Set(used.map(use => use.skill))
  const lower = term.toLowerCase()
  const hits = rows.filter(
    row => row.name.toLowerCase().includes(lower) || row.description.toLowerCase().includes(lower),
  )
  const recommended = CATALOG.filter(
    entry => entry.title.toLowerCase().includes(lower) || entry.summary.toLowerCase().includes(lower),
  )
  if (hits.length === 0 && recommended.length === 0) {
    return `Nichts gefunden für „${term}“. \`/cockpit\` zeigt alle Kategorien.`
  }
  const lines = hits
    .slice(0, 15)
    .map(row => `${statusMark(row, active)} **${shortName(row.name)}**: ${oneLine(row.description, 90)}`)
  if (hits.length > 15) lines.push(`… und ${hits.length - 15} weitere`)
  for (const entry of recommended) lines.push(`○ **${entry.title}** (${entry.author}): ${entry.summary}`)

  return [`**Suche „${term}“** · ${hits.length + recommended.length} Treffer`, lines.join('\n')].join('\n\n')
}

async function textSkill($: $, name: string, wantsBody: boolean): Promise<string> {
  const [rows, used, favs, now] = await Promise.all([
    read($, skills),
    read($, uses),
    read($, favorites),
    $.clock.now(),
  ])
  const isCatalog = name.startsWith(CATALOG_PREFIX)
  const entry = isCatalog ? CATALOG.find(one => `${CATALOG_PREFIX}${one.id}` === name) : catalogFor(name)
  const row = rows.find(one => one.name === name)
  const mine = used.filter(use => use.skill === name)
  const latest = mine.at(-1)
  const title = isCatalog ? (entry?.title ?? name) : shortName(name)
  const prefix = isCatalog ? undefined : prefixOf(name)
  const star = favs.includes(name) ? ' ★' : ''
  const lines = [`**${title}**${star}${prefix ? ` · ${prefix}` : ''}${entry ? ` · von ${entry.author}` : ''}`]

  if (isCatalog) lines.push('○ Nicht installiert.')
  else if (latest) lines.push(`◉ In dieser Session geladen: ${mine.length}×, zuletzt ${ago(now, latest.at)}.`)
  else if (row?.isListed) lines.push('● Verfügbar: Claude sieht ihn und kann ihn selbst wählen.')
  else lines.push('● Startbar per Befehl, aber nicht in Claudes Liste: Claude wählt ihn nicht von selbst.')
  if (row) lines.push(`${sourceLabel(row)}${row.tokens > 0 ? ` · ~${row.tokens} Tokens in Claudes Kontext` : ''}`)
  if (row?.description) lines.push(row.description)
  if (!isCatalog) lines.push(`**Starten:** \`/${name} deine Aufgabe\``)

  if (entry) {
    lines.push(`**Was er tut:** ${entry.summary}\n${entry.rules.map(rule => `- ${rule}`).join('\n')}`)
    const links = entry.references.map(link => `[${link.label}](${link.href})`).join(' · ')
    lines.push(`**Referenzen:** ${entry.referenceNote}\n${links}`)
    if (entry.note) lines.push(`⚠ ${entry.note}`)
    lines.push(`**Quelle:** ${entry.install} · Claude installiert ihn global (Cockpit-Mod und Else-Live-).`)
  }

  if (!isCatalog) {
    const path = await skillFile($, name).catch(() => undefined)
    if (!path) {
      lines.push('_Keine Dateien auf diesem Rechner: eingebaut oder von einem Connector geliefert._')
    } else {
      const folder = path.slice(0, path.lastIndexOf('/'))
      const files = await listFiles($, folder)
      if (files.length > 0) lines.push(`**Referenzdateien:** ${files.map(file => file.label).join(', ')}`)
      if (wantsBody) {
        const text = await $.fs.read(path).catch(() => undefined)
        const body = typeof text === 'string' ? stripFrontmatter(text) : ''
        lines.push(`**SKILL.md**, so wie Claude sie liest:\n\n${body.length > 6000 ? `${body.slice(0, 6000)}\n\n… (gekürzt)` : body}`)
      } else {
        lines.push(`**Anleitung:** \`/cockpit ${shortName(name)} anleitung\` zeigt die SKILL.md.`)
      }
    }
  }

  return lines.join('\n\n')
}

export function ago(now: number, at: number): string {
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min`
  const hours = Math.floor(minutes / 60)

  return `vor ${hours} Std`
}
