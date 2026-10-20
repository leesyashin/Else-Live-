// The office page's database, through the ArtifactData tool: documents with
// versions, written only where the version still matches. Every cloud
// session talks to the one office page through this.

import type { EngineInterface } from 'claude-code'

import { docsIn, writeOutcome } from './post'
import type { Doc, WriteOutcome } from './post'

type $ = EngineInterface

/** The office page whose database the cloud sessions feed. */
export const OFFICE_URL = 'https://claude.ai/artifact/94pH1R4YMfQgxPUeghXbiK'

export function textOf(answer: { content: readonly unknown[] }): string {
  return answer.content
    .map(block => {
      const text = (block as { text?: unknown }).text

      return typeof text === 'string' ? text : ''
    })
    .join('\n')
}

/** A long answer is saved to a file and its text names the file. */
export async function unsaved($: $, text: string): Promise<string> {
  const saved = /saved to (\S+\.(?:txt|json))/.exec(text)?.[1]

  return saved === undefined ? text : $.fs.read(saved)
}

export async function db($: $, action: string, fields: Record<string, unknown>): Promise<string> {
  const ran = (await $.tool.call({ tool: 'ArtifactData', action, url: OFFICE_URL, ...fields } as never)) as {
    text?: unknown
    result?: unknown
    deny?: unknown
  }

  return unsaved($, String(ran.text ?? (typeof ran.result === 'string' ? ran.result : undefined) ?? ran.deny ?? ''))
}

export async function dbGet($: $, collection: string, docId: string): Promise<Doc | undefined> {
  return docsIn(await db($, 'get', { collection, doc_id: docId })).find(doc => doc.id === docId)
}

export async function dbQuery($: $, collection: string, query: Record<string, unknown>): Promise<Doc[]> {
  return docsIn(await db($, 'query', { collection, query }))
}

export async function dbWrite(
  $: $,
  action: 'set' | 'update' | 'delete',
  collection: string,
  docId: string,
  data: Record<string, unknown> | undefined,
  version: number | undefined,
): Promise<WriteOutcome> {
  const text = await db($, action, {
    collection,
    doc_id: docId,
    ...(data === undefined ? {} : { data }),
    ...(version === undefined ? {} : { if_version: version }),
  })

  return writeOutcome(text)
}

/** Creates a document that must not exist yet; resolves its version, or undefined when it could not. */
export async function dbCreate($: $, collection: string, docId: string, data: Record<string, unknown>): Promise<number | undefined> {
  const outcome = await dbWrite($, 'set', collection, docId, data, undefined)

  return outcome.isDone ? (outcome.version ?? 1) : undefined
}

/** Updates a document at whatever version it is at now; a missing one stays missing. */
export async function settle($: $, collection: string, id: string, data: Record<string, unknown>): Promise<boolean> {
  const doc = await dbGet($, collection, id)
  if (doc === undefined) {
    return false
  }

  return (await dbWrite($, 'update', collection, id, data, doc.version)).isDone
}

/**
 * Reads, changes and writes one document, again when someone wrote it
 * meanwhile. `change` answers the fields to merge, or undefined to leave it.
 */
export async function revise(
  $: $,
  collection: string,
  id: string,
  change: (data: Record<string, unknown>) => Record<string, unknown> | undefined,
): Promise<Doc | undefined> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const doc = await dbGet($, collection, id)
    if (doc === undefined) {
      return undefined
    }
    const patch = change(doc.data)
    if (patch === undefined) {
      return doc
    }
    const outcome = await dbWrite($, 'update', collection, id, patch, doc.version)
    if (outcome.isDone) {
      return { id, data: { ...doc.data, ...patch }, version: outcome.version ?? doc.version + 1 }
    }
    if (!outcome.isStale) {
      throw new Error(outcome.reason)
    }
  }

  return undefined
}

/** A document of the office page only this session writes, whole, at the version it last saw. */
export type Owned = { collection: string; id: string; version: number | undefined; isKnown: boolean; last: string }

export function owned(collection: string, id: string): Owned {
  return { collection, id, version: undefined, isKnown: false, last: '' }
}

/**
 * Writes a document only this session writes, whole, when `signature`
 * changed. A reload forgets its version, so it reads it again when unsure.
 */
export async function keep($: $, doc: Owned, data: Record<string, unknown>, signature = JSON.stringify(data)): Promise<void> {
  if (signature === doc.last) {
    return
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!doc.isKnown) {
      doc.version = (await dbGet($, doc.collection, doc.id))?.version
      doc.isKnown = true
    }
    const outcome = await dbWrite($, 'set', doc.collection, doc.id, data, doc.version)
    if (outcome.isDone) {
      doc.version = outcome.version ?? (doc.version ?? 0) + 1
      doc.last = signature

      return
    }
    if (!outcome.isStale) {
      throw new Error(outcome.reason)
    }
    doc.isKnown = false
  }
}

export function byCreated(a: Doc, b: Doc): number {
  return Number(a.data.createdAt) - Number(b.data.createdAt)
}
