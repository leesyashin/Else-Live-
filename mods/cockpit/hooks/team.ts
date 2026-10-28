import type { EngineInterface } from 'claude-code'

import { github, sessionOf } from './pr'
import { SERVER, ask, repoOf } from './sessions'
import { artifactData } from './sync'

type $ = EngineInterface

// A finished team leaves the page: once every chat is done and no PR of the
// team is open any more (merged, or folded into the lead's PR and closed),
// one session archives the team chats and clears their cards. The Team card
// itself stays and offers the next task.
const TEAM_DOC = 'team'
const MEMBERS = 'cockpit/team/members'
const CLAIMS = 'cockpit/jobs/threads'

type Doc = { id: string; data: Record<string, unknown>; version: number }

// One document per line, between the read's markers.
export function docsIn(text: string | undefined): Doc[] {
  const docs: Doc[] = []
  for (const line of (text ?? '').split('\n')) {
    if (!line.startsWith('{')) continue
    try {
      const doc = JSON.parse(line) as Partial<Doc>
      if (typeof doc.id === 'string' && doc.data && typeof doc.version === 'number') docs.push(doc as Doc)
    } catch {
      // Not a document line.
    }
  }

  return docs
}

type Member = { id: string; version: number; state: string; pr: number | null; repo: string | null }

export function memberOf(doc: Doc): Member {
  const pr = Number(doc.data.pr)

  return {
    id: doc.id,
    version: doc.version,
    state: String(doc.data.state ?? ''),
    pr: Number.isInteger(pr) && pr > 0 ? pr : null,
    repo: typeof doc.data.repo === 'string' ? doc.data.repo : null,
  }
}

async function prState($: $, repo: string, number: number): Promise<{ isOpen: boolean; isMerged: boolean }> {
  const [owner, name] = repo.split('/')
  const pr = (await github($, 'pull_request_read', { method: 'get', owner, repo: name, pullNumber: number })) as {
    state?: string
    merged?: boolean
  }

  return { isOpen: pr.state === 'open', isMerged: pr.merged === true }
}

type Self = { session: string; sessionUrl?: string }

// Archives each session but this one (a chat never archives itself mid-turn).
async function archiveAll($: $, ids: string[], self: Self): Promise<{ archived: string[]; kept: string[] }> {
  const archived: string[] = []
  const kept: string[] = []
  for (const id of ids) {
    if (`https://claude.ai/code/${id}` === self.sessionUrl || id === self.session) {
      kept.push(id)
      continue
    }
    const result = await $.mcp.call(SERVER, 'archive_session', { session_id: id }).catch(() => ({ isError: true }))
    if (result.isError) kept.push(id)
    else archived.push(id)
  }

  return { archived, kept }
}

// The session IDs an order "Cockpit · Archivieren" names, one per line.
export function archiveTargets(text: string): string[] {
  const ids = text.split('\n').slice(1).map(line => line.trim()).filter(line => /^session_[A-Za-z0-9]+$/.test(line))

  return [...new Set(ids)]
}

// An order from the phone: archive these sessions, drop their team cards, and
// close the team once its last chat is gone.
export async function archiveSessions($: $, url: string, ids: string[]): Promise<string> {
  const self = await sessionOf($)
  const { archived, kept } = await archiveAll($, ids, self)
  if (url && archived.length) {
    const members = docsIn((await artifactData($, { url, collection: MEMBERS, action: 'list' })).text).map(memberOf)
    const gone = members.filter(member => archived.includes(member.id))
    const team = docsIn((await artifactData($, { url, collection: 'cockpit', doc_id: TEAM_DOC, action: 'get' })).text)[0]
    const closesTeam = team && team.data.state !== 'archived' && gone.length > 0 && gone.length === members.length
    if (gone.length) {
      await artifactData($, {
        url,
        action: 'batch',
        writes: [
          ...gone.map(member => ({ op: 'delete', collection: MEMBERS, doc_id: member.id, if_version: member.version })),
          ...(closesTeam
            ? [{ op: 'update', collection: 'cockpit', doc_id: TEAM_DOC, if_version: team.version, data: { state: 'archived', archivedAt: await $.clock.now(), archived } }]
            : []),
        ],
      })
    }
  }
  const running = kept.filter(id => `https://claude.ai/code/${id}` === self.sessionUrl || id === self.session)
  const failed = kept.filter(id => !running.includes(id))
  const parts = [`${archived.length} archiviert`]
  if (running.length) parts.push('diese Session selbst nicht (sie läuft gerade)')
  if (failed.length) parts.push(`nicht archiviert: ${failed.join(', ')}`)

  return parts.join(' · ')
}

let busy = false

// Returns what happened, for the log and the tests; quiet when there is nothing to do.
export async function tidyTeam($: $, url: string): Promise<string> {
  if (!url || busy) return 'nichts zu tun'
  busy = true
  try {
    const teamRead = await artifactData($, { url, collection: 'cockpit', doc_id: TEAM_DOC, action: 'get' })
    const team = docsIn(teamRead.text)[0]
    if (!team || team.data.state === 'archived') return 'kein Team'
    const membersRead = await artifactData($, { url, collection: MEMBERS, action: 'list' })
    const members = docsIn(membersRead.text).map(memberOf)
    if (members.length === 0 || members.some(member => member.state !== 'done')) return 'Team arbeitet noch'

    // Each chat's repo, from its own session when the card does not say.
    for (const member of members) {
      if (member.repo) continue
      const full = await ask($, 'get_session', { session_id: member.id }).catch(() => null)
      member.repo = full ? repoOf(full) : null
    }
    for (const member of members) {
      if (member.pr === null) continue
      if (!member.repo) return 'Repo eines Team-PR unbekannt'
      if ((await prState($, member.repo, member.pr)).isOpen) return `PR #${member.pr} ist noch offen`
    }
    const teamPr = Number(team.data.pr)
    const repo = members.find(member => member.repo)?.repo
    if (Number.isInteger(teamPr) && teamPr > 0 && repo && !(await prState($, repo, teamPr)).isMerged) return `PR #${teamPr} ist noch nicht gemergt`

    // Every session sees the finished team; the first to claim it tidies up.
    const self = await sessionOf($)
    const claim = await artifactData($, {
      url,
      collection: CLAIMS,
      doc_id: `team-${String(team.data.startedAt ?? team.version)}`,
      action: 'set',
      data: { session: self.session, kind: 'Team archivieren', at: await $.clock.now() },
    })
    if (claim.deny || claim.isError || !/committed/i.test(claim.text ?? '')) return 'eine andere Session räumt auf'

    const { archived, kept } = await archiveAll($, members.map(member => member.id), self)
    const now = await $.clock.now()
    await artifactData($, {
      url,
      action: 'batch',
      writes: [
        ...members.map(member => ({ op: 'delete', collection: MEMBERS, doc_id: member.id, if_version: member.version })),
        {
          op: 'update',
          collection: 'cockpit',
          doc_id: TEAM_DOC,
          if_version: team.version,
          data: { state: 'archived', archivedAt: now, archived },
        },
      ],
    })

    return `Team archiviert: ${archived.length} Chats${kept.length ? `, ${kept.length} offen gelassen` : ''}`
  } finally {
    busy = false
  }
}
