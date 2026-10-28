import type { EngineInterface } from 'claude-code'

import type { SetupCheck, SetupReport } from '../types'
import { saveSetup, setupView, shortName, skillRows } from './skills'
import { isStopped, writeDoc } from './sync'

type $ = EngineInterface

// The page's document for the check, beside cockpit/context.
const DOC = 'setup'
// A turn re-checks at most this often: the branch may have changed.
const MIN_GAP_MS = 60_000

// What a repo's memory file says it needs.
export type Memory = {
  base: string | null
  branch: string | null
  connectors: string[]
  optional: string[]
  skills: string[]
}

let lastAt = 0
let lastSent = ''

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map(one => one.trim())
    .filter(Boolean)

// Reads the head (`key: value` lines between `---`); the rest of the file is
// the person's own notes.
export function parseMemory(text: string): Memory {
  const head = new Map<string, string>()
  const match = text.replace(/\r/g, '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  for (const line of (match?.[1] ?? '').split('\n')) {
    const pair = line.replace(/\s+#.*$/, '').match(/^([a-z]+):\s*(.*)$/i)
    if (pair?.[1]) head.set(pair[1].toLowerCase(), (pair[2] ?? '').trim())
  }

  return {
    base: head.get('base') || null,
    branch: head.get('branch') || null,
    connectors: list(head.get('connectors')),
    optional: list(head.get('optional')),
    skills: list(head.get('skills')),
  }
}

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

// The connected MCP servers, read off the tool names (`mcp__<server>__<tool>`).
export function connectedServers(tools: readonly { name: string; mcp: boolean }[]): string[] {
  const servers = new Set<string>()
  for (const tool of tools) {
    const parts = tool.mcp ? tool.name.split('__') : []
    if (parts.length >= 3 && parts[0] === 'mcp' && parts[1]) servers.add(parts[1])
  }

  return [...servers]
}

function pattern(glob: string): RegExp {
  return new RegExp(`^${glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
}

export function branchCheck(branch: string | null, memory: Memory | null): SetupCheck {
  const name = 'Branch'
  if (!branch) return { group: 'Branch', name, state: 'warn', detail: 'Unbekannt: kein Git-Repo erkannt' }
  if (branch === 'HEAD') return { group: 'Branch', name, state: 'warn', detail: 'Kein Branch ausgecheckt (losgelöster Stand)' }
  const base = memory?.base ?? 'main'
  if (branch === base) return { group: 'Branch', name: branch, state: 'fail', detail: `Direkt auf ${base}: erst einen eigenen Branch anlegen` }
  if (memory?.branch && !pattern(memory.branch).test(branch)) {
    return { group: 'Branch', name: branch, state: 'warn', detail: `Erwartet: ${memory.branch}` }
  }

  return { group: 'Branch', name: branch, state: 'ok', detail: `Merge geht nach ${base}` }
}

export function memoryFile(repo: string): string {
  return `${repo.toLowerCase()}.md`
}

async function readMemory($: $, repo: string | null): Promise<{ file: string | null; memory: Memory | null }> {
  if (!repo) return { file: null, memory: null }
  const file = memoryFile(repo)
  const text = await $.fs.read(`${$.plugin.root}/memory/${file}`).catch(() => undefined)

  return { file, memory: typeof text === 'string' ? parseMemory(text) : null }
}

async function currentBranch($: $, root: string | undefined): Promise<string | null> {
  if (!root) return null
  const run = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }).catch(() => undefined)

  return run && run.exitCode === 0 ? run.stdout.trim() || null : null
}

export async function checkSetup($: $): Promise<SetupReport> {
  const repo = await $.session.repo().catch(() => null)
  const repoName = repo ? (repo.name ?? repo.remote ?? repo.root).replace(/\.git$/, '').split(/[/:]/).filter(Boolean).at(-1) ?? null : null
  const [{ file, memory }, branch, tools, rows, at] = await Promise.all([
    readMemory($, repoName),
    currentBranch($, repo?.root),
    $.tool.list().catch(() => []),
    skillRows($),
    $.clock.now(),
  ])
  const servers = connectedServers(tools).map(plain)
  const hasServer = (wanted: string) => servers.some(server => server.includes(plain(wanted)))
  const skillNames = new Set(rows.flatMap(row => [row.name, shortName(row.name)]))
  const checks: SetupCheck[] = []

  checks.push(
    memory
      ? { group: 'Memory', name: file ?? '', state: 'ok', detail: 'Setup-Liste dieses Repos gefunden' }
      : {
          group: 'Memory',
          name: file ?? 'kein Repo',
          state: 'warn',
          detail: repoName ? `Noch kein Memory: mods/cockpit/memory/${file} anlegen` : 'Die Session läuft in keinem Git-Repo',
        },
  )
  for (const name of memory?.connectors ?? []) {
    checks.push(
      hasServer(name)
        ? { group: 'Connectors', name, state: 'ok', detail: 'Verbunden' }
        : { group: 'Connectors', name, state: 'fail', detail: 'Nicht verbunden, wird gebraucht' },
    )
  }
  for (const name of memory?.optional ?? []) {
    checks.push(
      hasServer(name)
        ? { group: 'Connectors', name, state: 'ok', detail: 'Verbunden' }
        : { group: 'Connectors', name, state: 'warn', detail: 'Nicht verbunden, optional' },
    )
  }
  for (const name of memory?.skills ?? []) {
    checks.push(
      skillNames.has(name)
        ? { group: 'Skills', name, state: 'ok', detail: 'Da' }
        : { group: 'Skills', name, state: 'fail', detail: 'Fehlt in dieser Session' },
    )
  }
  checks.push(branchCheck(branch, memory))

  const report: SetupReport = {
    repo: repo?.name ?? repoName,
    branch,
    memory: memory ? file : null,
    checks,
    at,
  }
  await saveSetup($, report)

  return report
}

// Checks again and sends the result to the page when something changed.
export async function syncSetup($: $, url: string, force = false): Promise<SetupReport | null> {
  const now = await $.clock.now()
  if (!force && now - lastAt < MIN_GAP_MS) return setupView($)
  lastAt = now
  const report = await checkSetup($)
  if (!url || isStopped()) return report
  const { at: _at, ...content } = report
  const key = JSON.stringify(content)
  if (key !== lastSent || force) {
    const written = await writeDoc($, url, DOC, report)
    if (written === 'written') lastSent = key
  }

  return report
}

export const COLOR = { ok: 'success', warn: 'warning', fail: 'error' } as const

// The worst state per group, in the order the band shows them.
type GroupState = { group: SetupCheck['group']; state: SetupCheck['state'] }

export function groupStates(report: SetupReport | null): GroupState[] {
  if (!report) return []
  const order: SetupCheck['group'][] = ['Connectors', 'Skills', 'Branch']
  const rank = { ok: 0, warn: 1, fail: 2 }
  const out: GroupState[] = []
  for (const group of order) {
    const mine = report.checks.filter(check => check.group === group)
    if (mine.length === 0) continue
    out.push({ group, state: mine.reduce((a, b) => (rank[b.state] > rank[a.state] ? b : a)).state })
  }

  return out
}

export function setupText(report: SetupReport): string {
  const mark = { ok: '🟢', warn: '🟡', fail: '🔴' }
  const lines = [`Setup · ${report.repo ?? 'kein Repo'}${report.branch ? ` · ${report.branch}` : ''}`, '']
  for (const group of ['Memory', 'Connectors', 'Skills', 'Branch'] as const) {
    const mine = report.checks.filter(check => check.group === group)
    if (mine.length === 0) continue
    lines.push(group)
    for (const check of mine) lines.push(`  ${mark[check.state]} ${check.name}: ${check.detail}`)
  }

  return lines.join('\n')
}
