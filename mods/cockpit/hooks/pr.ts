import type { EngineInterface } from 'claude-code'

import { currentBranch } from './setup'
import { skillUses } from './skills'
import { artifactData, isStopped, writeDoc } from './sync'

type $ = EngineInterface

// The phone's merge card reads cockpit/pr; the session card cockpit/status.
const PR_DOC = 'pr'
const STATUS_DOC = 'status'
// A turn looks again at most this often: CI changes on its own.
const MIN_GAP_MS = 90_000
const GITHUB = 'github'

export type PrCard = {
  repo: string
  number: number
  title: string
  url: string
  head: string
  base: string
  draft: boolean
  state: 'open' | 'merged' | 'closed'
  ci: 'success' | 'failure' | 'pending' | 'none'
  checks: { name: string; state: 'success' | 'failure' | 'pending' | 'skipped' }[]
  mergeable: boolean | null
  files: number | null
  additions: number | null
  deletions: number | null
  updatedAt: number
}

let lastAt = 0
let lastSent = ''
// The PR number the page's document holds; another number starts it afresh.
let pageNumber: number | null | undefined

// owner/name from the origin remote, whatever host or proxy it goes through.
export function repoSlug(remote: string | null | undefined): { owner: string; name: string } | null {
  const match = remote?.replace(/\.git$/, '').match(/([^/:]+)\/([^/:]+)$/)

  return match?.[1] && match[2] ? { owner: match[1], name: match[2] } : null
}

async function github($: $, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await $.mcp.call(GITHUB, tool, args)
  const text = result.content.find(block => block.type === 'text')?.text
  if (result.isError || !text) throw new Error(text ?? `${tool} failed`)

  return JSON.parse(text)
}

type Run = { name?: string; status?: string; conclusion?: string | null }
type Status = { context?: string; state?: string }

export function checkState(run: Run): PrCard['checks'][number]['state'] {
  if (run.status && run.status !== 'completed') return 'pending'
  if (run.conclusion === 'success' || run.conclusion === 'neutral') return 'success'
  if (run.conclusion === 'skipped') return 'skipped'
  if (!run.conclusion) return 'pending'

  return 'failure'
}

export function overall(checks: PrCard['checks']): PrCard['ci'] {
  if (checks.length === 0) return 'none'
  if (checks.some(check => check.state === 'failure')) return 'failure'
  if (checks.some(check => check.state === 'pending')) return 'pending'

  return 'success'
}

// Reads the branch's newest PR and its checks; null when the branch has none.
export async function readPr($: $): Promise<PrCard | null> {
  const repo = await $.session.repo().catch(() => null)
  const slug = repoSlug(repo?.remote)
  const branch = await currentBranch($, repo?.root)
  if (!slug || !branch || branch === 'HEAD') return null
  const base = { owner: slug.owner, repo: slug.name }

  const list = (await github($, 'list_pull_requests', {
    ...base,
    head: `${slug.owner}:${branch}`,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    perPage: 1,
    fields: ['number'],
  })) as { number?: number }[]
  const number = Array.isArray(list) ? list[0]?.number : undefined
  if (typeof number !== 'number') return null

  const read = (method: string) => github($, 'pull_request_read', { ...base, pullNumber: number, method })
  const [pr, runs, statuses] = (await Promise.all([
    read('get'),
    read('get_check_runs').catch(() => ({ check_runs: [] })),
    read('get_status').catch(() => ({ statuses: [] })),
  ])) as [Record<string, unknown>, { check_runs?: Run[] }, { statuses?: Status[] }]

  const checks: PrCard['checks'] = [
    ...(runs.check_runs ?? []).map(run => ({ name: run.name ?? 'Check', state: checkState(run) })),
    ...(statuses.statuses ?? []).map(status => ({
      name: status.context ?? 'Status',
      state: status.state === 'success' ? ('success' as const) : status.state === 'pending' ? ('pending' as const) : ('failure' as const),
    })),
  ].slice(0, 12)
  const ref = (side: unknown) => (side && typeof side === 'object' && 'ref' in side ? String(side.ref) : '')
  const num = (value: unknown) => (typeof value === 'number' ? value : null)
  const mergeableState = String(pr.mergeable_state ?? 'unknown')
  const updated = Date.parse(String(pr.updated_at ?? ''))

  return {
    repo: `${slug.owner}/${slug.name}`,
    number,
    title: String(pr.title ?? ''),
    url: String(pr.html_url ?? ''),
    head: ref(pr.head) || branch,
    base: ref(pr.base) || 'main',
    draft: pr.draft === true,
    state: pr.merged === true ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
    ci: overall(checks),
    checks,
    mergeable: mergeableState === 'dirty' ? false : mergeableState === 'unknown' ? null : true,
    files: num(pr.changed_files),
    additions: num(pr.additions),
    deletions: num(pr.deletions),
    updatedAt: Number.isFinite(updated) ? updated : await $.clock.now(),
  }
}

// Sends the branch's PR to the page when it changed. Claude's own `merge`
// field stays: the card is updated, not replaced, while the number holds.
export async function syncPr($: $, url: string, force = false): Promise<string> {
  if (!url) return 'Keine Cockpit-Seite eingestellt.'
  if (isStopped()) return 'Der Abgleich mit der Seite ist für diese Session aus.'
  const now = await $.clock.now()
  if (!force && now - lastAt < MIN_GAP_MS) return 'Gerade erst abgeglichen.'
  lastAt = now
  const card = await readPr($)
  if (!card) return 'Dieser Branch hat keinen PR.'
  const { updatedAt: _at, ...content } = card
  const key = JSON.stringify(content)
  if (key === lastSent && !force) return `PR #${card.number} unverändert.`

  if (pageNumber === undefined) {
    const current = await artifactData($, { url, collection: 'cockpit', doc_id: PR_DOC, action: 'get' })
    const match = current.text?.match(/"number"\s*:\s*(\d+)/)
    pageNumber = match ? Number(match[1]) : null
  }
  const fresh = pageNumber !== card.number
  const written = await writeDoc($, url, PR_DOC, card, fresh ? 'set' : 'update')
  if (written !== 'written') return 'PR nicht geschrieben.'
  lastSent = key
  pageNumber = card.number

  return `PR #${card.number} abgeglichen: CI ${card.ci}, ${card.mergeable === false ? 'Konflikte' : 'keine Konflikte'}.`
}

// Every skill this session loaded, so the page's session card turns green.
export async function syncStatus($: $, url: string): Promise<void> {
  if (!url || isStopped()) return
  const [list, session, now] = await Promise.all([skillUses($), $.session.id(), $.clock.now()])
  await writeDoc($, url, STATUS_DOC, {
    loaded: list.map(use => ({ skill: use.skill, at: use.at })),
    session,
    updatedAt: now,
  })
}

// Tools after which the PR may look different.
export function touchesPr(tool: string, input: Record<string, unknown>): boolean {
  if (tool === 'Bash') return /\bgit\b[^|;&\n]*\bpush\b/.test(String(input.command ?? ''))
  return /^mcp__github__(create_pull_request|update_pull_request|merge_pull_request|update_pull_request_branch|push_files|create_or_update_file)$/.test(tool)
}
