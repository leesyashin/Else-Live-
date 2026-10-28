import type { EngineInterface } from 'claude-code'

type $ = EngineInterface

// The Cockpit page reads this document live from its own database, so the
// phone sees the context fill without a connector of its own.
const COLLECTION = 'cockpit'
const DOC = 'context'
const MIN_GAP_MS = 15_000

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
let version: number | undefined
let threshold: number | null | undefined
let lastAt = 0
let stopped: string | undefined

export function syncState(): string {
  return stopped ?? (lastAt ? 'aktiv' : 'wartet auf den ersten Schritt')
}

export async function snapshot($: $): Promise<ContextSnapshot> {
  const usage = await $.session.usage()
  if (threshold === undefined) {
    const full = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
    const breakdown = full?.context.breakdown
    threshold = breakdown && breakdown.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null
  }
  const [sessionId, repo, at] = await Promise.all([
    $.session.id(),
    $.session.repo().catch(() => null),
    $.clock.now(),
  ])
  const { context } = usage

  return {
    sessionId,
    repo: repo?.name ?? null,
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

async function artifactData($: $, input: Record<string, unknown>): Promise<Answer> {
  // The tool table types ArtifactData's input loosely; the fields are its own.
  // Called through a plain signature: checking the full tool table here costs
  // the type checker millions of instantiations.
  return ($.tool.call as unknown as (args: object) => Promise<Answer>)({ tool: 'ArtifactData', ...input })
}

function versionIn(text: string | undefined): number | undefined {
  const match = text?.match(/version["\s:]*(?:is\s+)?(\d+)/i)

  return match ? Number(match[1]) : undefined
}

export async function syncContext($: $, url: string, force = false): Promise<string> {
  if (!url) return 'Keine Cockpit-Seite eingestellt.'
  if (stopped && !force) return stopped
  const now = await $.clock.now()
  if (!force && now - lastAt < MIN_GAP_MS) return 'Gerade erst abgeglichen.'
  lastAt = now
  const data = await snapshot($)
  const base = { url, collection: COLLECTION, doc_id: DOC }

  if (version === undefined) {
    const read = await artifactData($, { ...base, action: 'get' })
    if (read.deny) return (stopped = `Nicht erlaubt: ${read.deny}`)
    version = read.isError || /not found|no document|does not exist/i.test(read.text ?? '') ? 0 : versionIn(read.text)
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const write = await artifactData($, version ? { ...base, action: 'set', data, if_version: version } : { ...base, action: 'set', data })
    if (write.deny) return (stopped = `Nicht erlaubt: ${write.deny}`)
    const next = versionIn(write.text)
    if (!write.isError && next !== undefined) {
      version = next
      stopped = undefined
      return `Abgeglichen: ${Math.round((data.used / data.max) * 100)} %`
    }
    // Someone else wrote meanwhile: the refusal names the current version.
    version = next
  }

  return 'Abgleich fehlgeschlagen, nächster Versuch nach dem nächsten Schritt.'
}
