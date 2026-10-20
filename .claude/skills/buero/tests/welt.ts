// The world beneath the mod for the tests of the office's service: a clock, a
// home folder, files in memory, and the office page's database as ArtifactData
// answers it.

import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const START = Date.UTC(2026, 9, 20, 12, 0)
export const MINUTE = 60_000
export const HOME = '/home/chef'

export function mockWorld(on: On, files: Map<string, string>, cloudId: string, sessionId = 'sess-0001') {
  const clock = mock.clock(on, { now: START })
  mock.env(on, { HOME, CLAUDE_CODE_REMOTE_SESSION_ID: cloudId })
  on('session.id', () => ({ value: sessionId }))
  on('session.root', () => ({ value: '/home/chef/code/Else-Live-' }))
  on('fs.read', ($, e) => {
    const text = files.get(e.path)

    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('fs.list', ($, e) => ({
    value: [...files.keys()]
      .filter(path => path.startsWith(`${e.path}/`))
      .map(path => ({ name: path.slice(e.path.length + 1), kind: 'file' as const, size: 1, mtimeMs: clock.now(), isLink: false })),
  }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: e.name } }))
  on('agent.list', () => ({ value: [] }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  return clock
}

export type Store = {
  get: (path: string) => Record<string, any> | undefined
  put: (path: string, data: Record<string, unknown>) => void
  all: (collection: string) => { id: string; data: Record<string, any> }[]
}

export function mockStore(on: On): Store {
  const docs = new Map<string, { data: Record<string, unknown>; version: number }>()
  const lines = (collection: string, found: [string, { data: Record<string, unknown>; version: number }][]) =>
    found.length === 0
      ? `No documents matched in collection "${collection}".`
      : `${found.length} documents from collection "${collection}":\n=== BEGIN ARTIFACT DB t — data ===\n` +
        found.map(([path, doc]) => JSON.stringify({ id: path.split('/').at(-1), data: doc.data, version: doc.version })).join('\n') +
        '\n=== END ARTIFACT DB t ==='
  const matches = (data: Record<string, unknown>, [field, op, value]: [string, string, unknown]) => {
    const have = data[field]
    switch (op) {
      case '==':
        return have === value
      case 'in':
        return Array.isArray(value) && value.includes(have)
      case '<':
        return typeof have === typeof value && (have as number) < (value as number)
      case '>=':
        return typeof have === typeof value && (have as number) >= (value as number)
      default:
        throw new Error(`op ${op}`)
    }
  }
  on('tool.call', { tool: 'ArtifactData' }, ($, e) => {
    const input = e as unknown as {
      action: string
      collection: string
      doc_id?: string
      data?: Record<string, unknown>
      if_version?: number
      query?: { where?: [string, string, unknown][] }
    }
    const path = `${input.collection}/${input.doc_id ?? ''}`
    const doc = docs.get(path)
    const answer = (text: string) => ({ result: text, text })
    switch (input.action) {
      case 'get':
        return answer(doc === undefined ? `No document "${input.doc_id}" in collection "${input.collection}".` : lines(input.collection, [[path, doc]]))
      case 'query': {
        const found = [...docs].filter(
          ([key, one]) =>
            key.startsWith(`${input.collection}/`) &&
            !key.slice(input.collection.length + 1).includes('/') &&
            (input.query?.where ?? []).every(clause => matches(one.data, clause)),
        )

        return answer(lines(input.collection, found))
      }
      default: {
        if (doc !== undefined && input.if_version === undefined) {
          return answer(`db write failed (version_mismatch): ${path} already exists and this write carried no if_version — nothing was written.`)
        }
        if (doc !== undefined && input.if_version !== doc.version) {
          return answer(`db write failed (version_mismatch): the document is no longer at version ${input.if_version} — it is now at version ${doc.version}; nothing was written.`)
        }
        if (input.action === 'delete') {
          docs.delete(path)

          return answer(`Database delete committed: "${input.collection}"/"${input.doc_id}".`)
        }
        if (input.action === 'update' && doc === undefined) {
          return answer(`db write failed (not_found): no document ${path}.`)
        }
        const version = (doc?.version ?? 0) + 1
        docs.set(path, { data: input.action === 'update' ? { ...doc?.data, ...input.data } : { ...input.data }, version })

        return answer(`Database ${input.action} committed: "${input.collection}"/"${input.doc_id}". The document is now at version ${version}.`)
      }
    }
  })

  return {
    get: path => docs.get(path)?.data as Record<string, any> | undefined,
    put: (path, data) => docs.set(path, { data, version: (docs.get(path)?.version ?? 0) + 1 }),
    all: collection =>
      [...docs]
        .filter(([key]) => key.startsWith(`${collection}/`) && !key.slice(collection.length + 1).includes('/'))
        .map(([key, doc]) => ({ id: key.split('/').at(-1) ?? '', data: doc.data as Record<string, any> })),
  }
}

import type { CloudSession } from '../hooks/cloud'

/** A cloud session as the list reports it, working in Else-Live- unless said otherwise. */
export function session(id: string, patch: Partial<CloudSession> = {}): CloudSession {
  return {
    id,
    title: `Titel ${id}`,
    session_status: 'SESSION_STATUS_RUNNING',
    status_bucket: 'SESSION_STATUS_BUCKET_WORKING',
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T11:59:00Z',
    session_context: { outcomes: [{ git_repository: { git_info: { repo: 'leesyashin/Else-Live-', branches: ['claude/x'] } } }], model: 'claude-opus-5-5' },
    ...patch,
  }
}

/** A tool result's text, as the mcp.call bottom answers it. */
export function said(text: string) {
  return { value: { content: [{ type: 'text', text }], isError: false } }
}

export function listOf(sessions: readonly CloudSession[]) {
  return said(JSON.stringify({ ccr: { data: sessions } }))
}

export const START_EVENT = { cwd: '/home/chef/code/Else-Live-', surface: 'desktop' as const, isInteractive: true }
