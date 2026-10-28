import type { EngineInterface } from 'claude-code'

type $ = EngineInterface

// The Cockpit page reads this document live from its own database, so the
// phone sees the context fill without a connector of its own.
const COLLECTION = 'cockpit'
const DOC = 'context'
const MIN_GAP_MS = 15_000
// Room the engine keeps free for the summary: a 1M window compacts against
// an effective 980k, as the session itself reports it.
const SUMMARY_RESERVE = 20_000

export type ContextSnapshot = {
  sessionId: string
  repo: string | null
  used: number
  max: number
  threshold: number | null
  costUsd: number | null
  limits: { kind: string; percentUsed: number; resetsAt: string | null }[]
  at: number
}

// The module's own memory; a reload starts it over, which only costs one read.
// Each document's last known version, so every write is pinned to it.
const versions = new Map<string, number>()
let threshold: number | null | undefined
let lastAt = 0
let stopped: string | undefined

export function syncState(): string {
  return stopped ?? (lastAt ? 'aktiv' : 'wartet auf den ersten Schritt')
}

function repoName(location: string): string | null {
  const last = location.replace(/\.git$/, '').split(/[/:]/).filter(Boolean).at(-1)

  return last ?? null
}

export async function snapshot($: $): Promise<ContextSnapshot> {
  const usage = await $.session.usage()
  if (threshold === undefined) {
    const full = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
    const breakdown = full?.context.breakdown
    threshold = breakdown && breakdown.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null
    // A session may compact earlier than the default (cloud sessions use 80 %).
    const override = Number(await $.env.get('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE').catch(() => undefined))
    if (override > 0 && override <= 100) {
      const early = Math.round(((usage.context.window - SUMMARY_RESERVE) * override) / 100)
      threshold = threshold === null ? early : Math.min(threshold, early)
    }
  }
  const [sessionId, repo, at] = await Promise.all([
    $.session.id(),
    $.session.repo().catch(() => null),
    $.clock.now(),
  ])
  const { context } = usage

  return {
    sessionId,
    repo: repo ? (repo.name ?? repoName(repo.remote ?? repo.root)) : null,
    used: context.tokens ?? Math.round(((context.percent ?? 0) / 100) * context.window),
    max: context.window,
    threshold,
    costUsd: usage.cost?.usd ?? null,
    limits: usage.rateLimits.map(limit => ({
      kind: limit.kind,
      percentUsed: limit.percentUsed,
      resetsAt: limit.resetsAt ?? null,
    })),
    at,
  }
}

type Answer = { text?: string; isError?: boolean; deny?: string }

export async function artifactData($: $, input: Record<string, unknown>): Promise<Answer> {
  // The tool table types ArtifactData's input loosely; the fields are its own.
  // Called through a plain signature: checking the full tool table here costs
  // the type checker millions of instantiations.
  return ($.tool.call as unknown as (args: object) => Promise<Answer>)({ tool: 'ArtifactData', ...input })
}

function versionIn(text: string | undefined): number | undefined {
  const match = text?.match(/version["\s:]*(?:is\s+)?(\d+)/i)

  return match ? Number(match[1]) : undefined
}

// Writes one document of the page's `cockpit` collection, pinned to the
// version last seen; a refusal of the tool stops every write this session.
// `update` keeps the fields it does not name (a missing document is created).
export async function writeDoc(
  $: $,
  url: string,
  doc: string,
  data: object,
  mode: 'set' | 'update' = 'set',
): Promise<'written' | 'denied' | 'failed'> {
  const base = { url, collection: COLLECTION, doc_id: doc }
  let version = versions.get(doc)

  if (version === undefined) {
    const read = await artifactData($, { ...base, action: 'get' })
    if (read.deny) {
      stopped = `Nicht erlaubt: ${read.deny}`
      return 'denied'
    }
    version = read.isError || /not found|no document|does not exist/i.test(read.text ?? '') ? 0 : versionIn(read.text)
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const write = await artifactData($, version ? { ...base, action: mode, data, if_version: version } : { ...base, action: 'set', data })
    if (write.deny) {
      stopped = `Nicht erlaubt: ${write.deny}`
      return 'denied'
    }
    const next = versionIn(write.text)
    if (!write.isError && next !== undefined) {
      versions.set(doc, next)
      stopped = undefined
      return 'written'
    }
    // Someone else wrote meanwhile: the refusal names the current version.
    version = next
  }
  versions.delete(doc)

  return 'failed'
}

export function isStopped(): boolean {
  return stopped !== undefined
}

export async function syncContext($: $, url: string, force = false): Promise<string> {
  if (!url) return 'Keine Cockpit-Seite eingestellt.'
  if (stopped && !force) return stopped
  const now = await $.clock.now()
  if (!force && now - lastAt < MIN_GAP_MS) return 'Gerade erst abgeglichen.'
  lastAt = now
  const data = await snapshot($)
  const written = await writeDoc($, url, DOC, data)
  if (written === 'denied') return stopped ?? 'Nicht erlaubt.'
  if (written === 'written') return `Abgeglichen: ${Math.round((data.used / data.max) * 100)} %`

  return 'Abgleich fehlgeschlagen, nächster Versuch nach dem nächsten Schritt.'
}
