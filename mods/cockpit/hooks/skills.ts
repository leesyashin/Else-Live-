import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SkillDetail, SkillFile, SkillRow, SkillSummary, SkillUse } from '../types'
import { CATALOG, catalogFor } from './catalog'

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
    text: `Installiere bitte den Design-Skill „${entry.title}“ von ${entry.author} (${entry.install}) und sag mir, ob er danach verfügbar ist.`,
    mode: 'replace',
  })
}

export function ago(now: number, at: number): string {
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min`
  const hours = Math.floor(minutes / 60)

  return `vor ${hours} Std`
}
