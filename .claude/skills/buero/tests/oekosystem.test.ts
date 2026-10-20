import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Auftrag } from '../types'
import {
  auftragOf,
  auftraegeText,
  auftragText,
  branchFor,
  kindPrompt,
  kommandoIn,
  kommandoOf,
  kommandoPrompt,
  naechsteNummer,
  neuerAuftrag,
  nichtAngenommen,
  regelnId,
  regelnOf,
  schritt,
} from '../hooks/auftraege'
import { ablageText, besprechungText, einladungText, neueAblage, neueBesprechung } from '../hooks/besprechung'
import type { CloudSession } from '../hooks/cloud'
import { cloudRecords, elternOf, parseSession, parseSessionPage, rolleOf, tagValue, trimSession } from '../hooks/cloud'
import { colleaguesText, compareVersions, isVeraltet, moodOf, resolveRecipient, workerOf } from '../hooks/model'
import { leaseOf, mayLead } from '../hooks/post'

const START = Date.UTC(2026, 9, 20, 12, 0)
const MINUTE = 60_000

function session(id: string, patch: Partial<CloudSession> = {}): CloudSession {
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

test('tags give a session its role, its team and its order', () => {
  const tags = ['config:auto-create-pr:draft', 'buero:rolle=cvd', 'buero:auftrag=a12', 'buero:eltern=session_01ELTERN']
  expect(tagValue(tags, 'rolle')).toBe('cvd')
  expect(tagValue(tags, 'auftrag')).toBe('a12')
  expect(tagValue(['buero:rolle='], 'rolle')).toBeUndefined()
  expect(rolleOf(tags)).toBe('cvd')
  expect(rolleOf(['buero:rolle=chef'])).toBeUndefined()
  expect(elternOf({ tags, parent_session_id: 'session_01PARENT' })).toBe('session_01PARENT')
  expect(elternOf({ tags })).toBe('session_01ELTERN')

  const cvd = session('session_01CVD', { tags, task_summary: 'Lese Kommandos', status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', updated_at: '2026-10-10T10:00:00Z' })
  const worker = session('session_01WORK', { parent_session_id: 'session_01CVD', external_metadata: { task_summary: 'Running npm test', context_usage: { max_tokens: 100, used_tokens: 42 }, usage: { cost_usd: 1.25 } } })
  const desks = new Map([['cse_01WORK', { stand: { text: 'Baue Warenkorb, Schritt 3 von 5', at: START - MINUTE }, modVersion: '0.4.0' }]])
  const records = cloudRecords([cvd, worker], START, new Map(), desks)
  // the Chef vom Dienst keeps its desk even when the cloud calls it finished and old
  expect(records.map(one => one.id)).toEqual(['session_01CVD', 'session_01WORK'])
  expect(records[0]?.rolle).toBe('cvd')
  expect(records[0]?.auftrag).toBe('a12')
  expect(records[1]?.eltern).toBe('session_01CVD')
  expect(records[1]?.activity).toBe('Baue Warenkorb, Schritt 3 von 5')
  expect(records[1]?.modVersion).toBe('0.4.0')
  expect(records[1]?.kontext).toBe(42)
  expect(records[1]?.kosten).toBe(1.25)
  expect(records[1]?.model).toBe('claude-opus-5-5')
  // without its own line, the cloud's live summary says what a working session does
  expect(cloudRecords([worker], START)[0]?.activity).toBe('Running npm test')

  const trimmed = trimSession(cvd)
  expect(trimmed.tags).toEqual(['buero:rolle=cvd', 'buero:auftrag=a12', 'buero:eltern=session_01ELTERN'])
  expect(trimmed.task_summary).toBe('Lese Kommandos')
  expect(trimmed.session_context?.model).toBe('claude-opus-5-5')

  const listed = colleaguesText(records, START, 5 * MINUTE, 'session_01ME', 'in deiner Claude-Code-Cloud', '0.5.0')
  expect(listed).toContain('Chef vom Dienst')
  expect(listed).toContain('Team: gestartet von')
  expect(listed).toContain('Büro-Mod 0.4.0 (veraltet)')
  expect(resolveRecipient(records, 'cvd')?.id).toBe('session_01CVD')
})

test('the session list is read page by page, a single session too', () => {
  const page = parseSessionPage(JSON.stringify({ ccr: { data: [session('session_01A')], has_more: true, last_id: 'session_01A' } }))
  expect(page.sessions.length).toBe(1)
  expect(page.hasMore).toBe(true)
  expect(page.lastId).toBe('session_01A')
  expect(parseSessionPage('nothing').sessions).toEqual([])
  const own = parseSession(`<notice>${JSON.stringify({ ccr: { id: 'session_01ME', tags: ['buero:rolle=pruefer'] }, lineage: {} })}`)
  expect(own?.id).toBe('session_01ME')
  expect(rolleOf(own?.tags)).toBe('pruefer')
})

test('the Chef vom Dienst is in readiness, never stuck, and older mods are marked', () => {
  const cvd = cloudRecords([session('session_01CVD', { tags: ['buero:rolle=cvd'], updated_at: '2026-10-20T11:00:00Z' })], START)[0]
  const worker = cloudRecords([session('session_01W', { updated_at: '2026-10-20T11:00:00Z' })], START)[0]
  expect(cvd !== undefined && moodOf(cvd, START, 5 * MINUTE)).toBe('bereit')
  expect(worker !== undefined && moodOf(worker, START, 5 * MINUTE)).toBe('haengt')
  expect(cvd !== undefined && workerOf(cvd, START, 5 * MINUTE, undefined, '0.4.0').isVeraltet).toBe(false)
  expect(compareVersions('0.4.1', '0.10.0')).toBeLessThan(0)
  expect(compareVersions('1.0', '1.0.0')).toBe(0)
  expect(isVeraltet('0.3.0', '0.4.0')).toBe(true)
  expect(isVeraltet(undefined, '0.4.0')).toBe(false)
  expect(isVeraltet('0.4.0', '')).toBe(false)
})

test('the lease goes to the Chef vom Dienst whenever it is around', () => {
  const held = leaseOf({ holder: 'cse_01OTHER', until: START + 10 * MINUTE, seen: {}, pinned: 'cse_01CVD', cvdHeartbeat: START - MINUTE, modVersion: '0.4.0' })
  expect(held?.pinned).toBe('cse_01CVD')
  expect(held?.modVersion).toBe('0.4.0')
  // the CvD takes it from a holder whose lease still runs
  expect(mayLead(held, 'cse_01CVD', START, true)).toBe(true)
  // another session neither takes it nor keeps it while the CvD was heard from lately
  expect(mayLead(held, 'cse_01THIRD', START + 2 * MINUTE)).toBe(false)
  expect(mayLead(held, 'cse_01OTHER', START)).toBe(false)
  // once the CvD has been silent for three minutes, the old rules hold again: the holder keeps it, others wait for its end
  expect(mayLead(held, 'cse_01OTHER', START + 3 * MINUTE)).toBe(true)
  expect(mayLead(held, 'cse_01THIRD', START + 3 * MINUTE)).toBe(false)
  expect(mayLead(held, 'cse_01THIRD', START + 11 * MINUTE)).toBe(true)
  expect(mayLead(undefined, 'cse_01ANY', START)).toBe(true)
})

const REGELN = regelnOf({ autoMerge: 'gruen', pruefbefehle: ['npm run check'], modelle: { mitarbeiter: 'claude-sonnet-5-5' } }, 'leesyashin/Else-Live-')

test('orders are documents with states, and every step is written down', () => {
  expect(naechsteNummer(undefined)).toBe(1)
  expect(naechsteNummer({ auftraege: 11 })).toBe(12)
  expect('error' in neuerAuftrag({ nr: 1, titel: '', text: 'x', repo: 'a/b', createdBy: 'chef', now: START, abnahme: ['geht'] })).toBe(true)
  expect('error' in neuerAuftrag({ nr: 1, titel: 'T', text: 'x', repo: 'nur-name', createdBy: 'chef', now: START, abnahme: ['geht'] })).toBe(true)
  expect('error' in neuerAuftrag({ nr: 1, titel: 'T', text: 'x', repo: 'a/b', createdBy: 'chef', now: START })).toBe(true)
  const made = neuerAuftrag({ nr: 12, titel: 'Login-Seite bauen', text: 'Ziel: Login.', repo: 'leesyashin/Else-Live-', createdBy: 'chef', now: START, abnahme: ['Tests grün'], prio: 'hoch' })
  if ('error' in made) {
    throw new Error(made.error)
  }
  expect(made.id).toBe('a12')
  expect(made.state).toBe('offen')
  expect(made.verlauf[0]?.was).toBe('angelegt')
  expect(branchFor(made, REGELN)).toBe('claude/auftrag-12-login-seite-bauen')
  expect(auftragOf(JSON.parse(JSON.stringify(made)))?.titel).toBe('Login-Seite bauen')
  expect(auftragOf({ id: 'a1' })).toBeUndefined()

  const vergeben = schritt(made, 'vergeben', 'cvd', START + MINUTE, { owner: 'session_01W', branch: 'claude/auftrag-12-login-seite-bauen', was: 'an Mia vergeben' })
  if ('error' in vergeben) {
    throw new Error(vergeben.error)
  }
  expect(vergeben.state).toBe('vergeben')
  expect(vergeben.owner).toBe('session_01W')
  expect(nichtAngenommen([vergeben], START + 12 * MINUTE, 10 * MINUTE).length).toBe(1)
  expect(nichtAngenommen([vergeben], START + 5 * MINUTE, 10 * MINUTE).length).toBe(0)
  const angenommen = schritt(vergeben, 'annehmen', 'session_01W', START + 2 * MINUTE) as Auftrag
  expect(angenommen.state).toBe('in_arbeit')
  expect('error' in schritt(angenommen, 'annehmen', 'session_01W', START)).toBe(true)
  expect('error' in schritt(angenommen, 'blockieren', 'session_01W', START)).toBe(true)
  const review = schritt(angenommen, 'review', 'session_01W', START + 3 * MINUTE, { pr: 'PR #7' }) as Auftrag
  expect(review.pr).toBe('PR #7')
  const fertig = schritt(review, 'abschliessen', 'cvd', START + 4 * MINUTE) as Auftrag
  expect(fertig.state).toBe('fertig')
  expect(fertig.verlauf.map(one => one.was)).toEqual(['angelegt', 'an Mia vergeben', 'angenommen', 'bereit zum Review', 'abgeschlossen'])
  const zurueck = schritt(angenommen, 'zurueck', 'session_01W', START) as Auftrag
  expect(zurueck.state).toBe('offen')
  expect(zurueck.owner).toBeUndefined()

  const names = new Map([['session_01W', 'Mia']])
  expect(auftragText(review, START + 5 * MINUTE, names)).toContain('Besitzer: Mia')
  expect(auftraegeText([review], START + 5 * MINUTE, names)).toContain('a12 (Review · Mia · PR #7) Login-Seite bauen')
  expect(auftraegeText([], START)).toBe('Keine Aufträge auf dem Brett.')
  expect(regelnId('leesyashin/Else-Live-')).toBe('leesyashin_Else-Live-')
  expect(REGELN.autoMerge).toBe('gruen')
  expect(REGELN.modelle.mitarbeiter).toBe('claude-sonnet-5-5')
  expect(REGELN.modelle.cvd).toBe('claude-opus-5-5')
})

test('a child session gets the order, the rules and the way back as its prompt', () => {
  const made = neuerAuftrag({ nr: 3, titel: 'Warenkorb', text: 'Ziel: Warenkorb.\nKontext: shop/', repo: 'leesyashin/shop', createdBy: 'cvd', now: START, abnahme: ['Kasse rechnet'] }) as Auftrag
  const taken = schritt(made, 'annehmen', 'session_01OLD', START + MINUTE) as Auftrag
  const withHandover = schritt(taken, 'zurueck', 'session_01OLD', START + MINUTE, {
    uebergabe: { at: START + MINUTE, von: 'session_01OLD', stand: 'Modell fertig', branch: 'claude/auftrag-3 @ abc123', offen: 'Kasse', naechster: 'Kasse bauen' },
  }) as Auftrag
  expect(withHandover.state).toBe('offen')
  const prompt = kindPrompt({ auftrag: withHandover, branch: 'claude/auftrag-3-warenkorb', regeln: REGELN, cvd: 'session_01CVD', eltern: 'session_01CVD', now: START + 2 * MINUTE })
  expect(prompt).toContain('Auftrag 3: Warenkorb')
  expect(prompt).toContain('Kasse rechnet')
  expect(prompt).toContain('npm run check')
  expect(prompt).toContain('Gemergt wird vom Chef vom Dienst')
  expect(prompt).toContain('Modell fertig')
  expect(prompt).toContain('mcp__buero__auftrag aktion=annehmen id=a3')
  expect(prompt).toContain('mcp__buero__abgeben')
})

test('commands from the page are read, handed to the model and found again in a comment', () => {
  const k = kommandoOf({ text: 'Hol jemanden für die Login-Seite', createdAt: START, state: 'neu', von: 'chef' })
  expect(k?.state).toBe('neu')
  expect(kommandoOf({ text: 'x', createdAt: START, state: 'quatsch' })).toBeUndefined()
  const withAction = kommandoOf({ text: 'Pausieren', createdAt: START, state: 'neu', aktion: { typ: 'pausieren', session: 'session_01W' } })
  expect(withAction?.aktion?.typ).toBe('pausieren')
  expect(kommandoOf({ text: 'x', createdAt: START, state: 'neu', aktion: { typ: 'explodieren', session: 's' } })?.aktion).toBeUndefined()
  const prompt = k === undefined ? '' : kommandoPrompt('k-abc', k)
  expect(prompt).toContain('[Büro] Kommando k-abc vom Chef')
  expect(prompt).toContain('mcp__buero__kommando aktion=erledigt id=k-abc')
  expect(kommandoIn('Sofort: Kommando k-abc-12: Stopp Anton')).toBe('k-abc-12')
  expect(kommandoIn('ohne')).toBeUndefined()
})

test('meetings need a question and people, the shelf needs a place for each kind', () => {
  expect('error' in neueBesprechung({ thema: 'Menü', frage: 'A oder B', von: 'chef', teilnehmer: ['session_01A'], now: START })).toBe(true)
  expect('error' in neueBesprechung({ thema: 'Menü', frage: 'A oder B?', von: 'chef', teilnehmer: [], now: START })).toBe(true)
  const b = neueBesprechung({ thema: 'Menü', frage: 'A oder B?', von: 'chef', teilnehmer: ['session_01A', 'session_01A', 'session_01B'], now: START, fristMinuten: 20 })
  if ('error' in b) {
    throw new Error(b.error)
  }
  expect(b.teilnehmer).toEqual(['session_01A', 'session_01B'])
  expect(b.bis).toBe(START + 20 * MINUTE)
  expect(einladungText('b1', b, START + 5 * MINUTE)).toContain('Antworte in 15 Min.')
  const text = besprechungText('b1', b, [{ von: 'session_01A', at: START + MINUTE, these: 'B', empfehlung: 'B nehmen', risiko: 'Zeit' }], START + 2 * MINUTE, new Map([['session_01A', 'Mia']]))
  expect(text).toContain('Mia vor 1 Min.')
  expect(text).toContain('These: B')

  expect('error' in neueAblage({ titel: 'Notiz', von: 'cvd', now: START })).toBe(true)
  expect('error' in neueAblage({ art: 'link', titel: 'Doku', url: 'ftp://x', von: 'cvd', now: START })).toBe(true)
  const link = neueAblage({ art: 'link', titel: 'Doku', url: 'https://example.org', tags: [' Design ', ''], repo: 'a/b', von: 'cvd', now: START })
  if ('error' in link) {
    throw new Error(link.error)
  }
  expect(link.tags).toEqual(['design'])
  expect(ablageText([{ id: 'x1', a: link }], START + MINUTE)).toContain('x1 [link] Doku https://example.org · a/b · #design')
})

test('a Chef vom Dienst session takes the office over, and another session keeps off while it is around', async ($, on) => {
  const files = new Map<string, string>()
  const HOME = '/home/chef'
  const clock = mockWorld(on, files, HOME, 'cse_01CVD')
  const db = mockStore(on)
  const sessions = [session('session_01CVD', { tags: ['buero:rolle=cvd'] }), session('session_01OTHER')]
  on('mcp.call', ($, e) => {
    if (e.tool === 'list_sessions') {
      return { value: { content: [{ type: 'text', text: JSON.stringify({ ccr: { data: sessions } }) }], isError: false } }
    }
    if (e.tool === 'get_session') {
      return { value: { content: [{ type: 'text', text: JSON.stringify({ ccr: sessions[0] }) }], isError: false } }
    }

    return { value: { content: [{ type: 'text', text: '[]' }], isError: false } }
  })
  // someone else keeps the office, with a lease that still runs
  db.put('leitung/bote', { holder: 'cse_01OTHER', until: START + 10 * MINUTE, seen: {} })

  await $.session.start({ cwd: '/home/chef/code/Else-Live-', surface: 'desktop', isInteractive: true })
  await clock.advance(5000)
  const lease = db.get('leitung/bote')
  expect(lease?.holder).toBe('cse_01CVD')
  expect(lease?.pinned).toBe('cse_01CVD')
  expect(typeof lease?.cvdHeartbeat).toBe('number')
  expect(db.get('sessions/01CVD')?.rolle).toBe('cvd')
  const listed = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__kollegen' }))
  expect(listed).toContain('session_01OTHER')
})

/** The world beneath the mod for these tests: a clock, a home folder and files in memory. */
function mockWorld(on: On, files: Map<string, string>, HOME: string, cloudId: string) {
  const clock = mock.clock(on, { now: START })
  mock.env(on, { HOME, CLAUDE_CODE_REMOTE_SESSION_ID: cloudId })
  on('session.id', () => ({ value: 'sess-cvd-0001' }))
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
  on('prompt.submit', ($, e) => ({ text: e.text }))

  return clock
}

/** The office page's database as ArtifactData answers it, from memory. */
function mockStore(on: On) {
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
    get: (path: string) => docs.get(path)?.data as Record<string, any> | undefined,
    put: (path: string, data: Record<string, unknown>) => docs.set(path, { data, version: (docs.get(path)?.version ?? 0) + 1 }),
  }
}
