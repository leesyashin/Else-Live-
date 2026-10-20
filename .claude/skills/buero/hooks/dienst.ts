// The office's service: the tools every session delegates with (orders,
// handing over, fetching colleagues, the shelf, meetings, the Chef vom
// Dienst), and the Chef vom Dienst's own round (commands from the page,
// disturbances, readiness). register.tsx wires it in and lends it what it
// needs through a context, so this file holds no session state of its own.

import type { EngineInterface } from 'claude-code'

import type { Auftrag, AuftragState, Beitrag, EventKind, Kommando, KommandoState, Letter, Regeln, Rolle, SessionRecord } from '../types'
import {
  AUFTRAG_LABEL,
  OFFENE_ZUSTAENDE,
  auftraegeText,
  auftragOf,
  auftragText,
  branchFor,
  kindPrompt,
  kommandoOf,
  kommandoPrompt,
  naechsteNummer,
  neuerAuftrag,
  nichtAngenommen,
  regelnId,
  regelnOf,
  regelnText,
  schritt,
} from './auftraege'
import type { AuftragAktion } from './auftraege'
import {
  ablageEintragText,
  ablageOf,
  ablageText,
  beitragOf,
  besprechungOf,
  besprechungText,
  besprechungenText,
  einladungText,
  neueAblage,
  neueBesprechung,
} from './besprechung'
import { CLOUD_SERVER, parseSession, sameSession } from './cloud'
import { OFFICE_URL, dbCreate, dbGet, dbQuery, dbWrite, textOf, unsaved } from './db'
import { clip, colleagueMessage, isActive, moodOf, resolveRecipient } from './model'
import { letterId, tailOf } from './post'

type $ = EngineInterface

/**
 * What the service borrows from the session's own state in register.tsx.
 * Nothing here takes `$`: the engine traces `$` only through plain calls,
 * so everything that needs it is a function of this module or of db.ts.
 */
export type DienstCtx = {
  cloudSelf: () => string
  self: () => SessionRecord | undefined
  change: (patch: Partial<SessionRecord>) => void
  /** Everyone in the office as last listed, this session included. */
  records: () => SessionRecord[]
  idOfSelf: () => string
  rolle: () => Rolle | undefined
  auftragTag: () => string | undefined
  setAuftragTag: (id: string | undefined) => void
  /** The Chef vom Dienst's session id (`session_…`), from the lease; this session's own when it is the CvD. */
  cvdId: () => string | undefined
  /** `owner/repo` of this session. */
  repo: () => string | undefined
  /** Notes a line in this session's logbook. */
  note: (kind: EventKind, text: string) => void
  /** Hands text to the model within its running turn. */
  arrive: (text: string) => void
  isBusy: () => boolean
  stuckMs: () => number
  /** The id of the last post from the person this session received. */
  lastPost: () => string | undefined
}

/** What a tool answers. */
export type ToolAnswer = { result: string } | { deny: string }

/** Delivers a message to another cloud session; resolves the reason when it was not. */
async function deliver($: $, sessionId: string, text: string): Promise<string | undefined> {
  try {
    // `next` joins a running turn without stopping it; an idle session starts one
    const answer = await $.mcp.call(CLOUD_SERVER, 'send_message', { session_id: sessionId, message: text, priority: 'next' })

    return answer.isError ? clip(textOf(answer), 200) || 'unbekannter Fehler' : undefined
  } catch (error) {
    return clip(String(error), 200)
  }
}

/** Puts a colleague's letter on the office page; resolves its version, or undefined when it could not. */
async function fileLetter($: $, id: string, letter: Letter): Promise<number | undefined> {
  try {
    return await dbCreate($, 'kollegenpost', id, letter)
  } catch (error) {
    $.ui.log(`buero: brief: ${String(error)}`, { to: 'debug' })

    return undefined
  }
}

/** A not-yet-accepted order is reported after this long. */
const ANNAHME_MS = 10 * 60_000
/** A disturbance is reported again after this long. */
const ALERT_AGAIN_MS = 30 * 60_000
const STOERUNG_EVERY_MS = 60_000
const WAECHTER_EVERY_MS = 5 * 60_000
const PUSH_EVERY_MS = 2 * 60_000
const DAY_MS = 24 * 60 * 60_000
const KOMMANDOS_PER_TICK = 5
/** A command taken but neither closed nor worked on for this long is handed to the model again, once. */
const STALE_KOMMANDO_MS = 15 * 60_000

const openKommandos = new Map<string, number>()
const alerted = new Map<string, number>()
let stoerungAt = 0
let waechterAt = 0
let pushAt = 0
let isWatched = false
const regelnCache = new Map<string, { at: number; regeln: Regeln }>()

const PROPS = {
  id: { type: 'string', description: 'Die ID (Auftrag a12, Besprechung b-…, Eintrag x-…).' },
}

/** The tools of the service, as `$.tool.register` takes them. */
export const DIENST_TOOLS = [
  {
    name: 'auftrag',
    description:
      'Aufträge auf dem Aufgabenbrett des Büros: anlegen, zeigen, annehmen, aendern, review (PR fertig, CI grün), abschliessen, blockieren, abbrechen. Ein Auftrag ist ein Dokument mit Ziel, Kontext, Umsetzung und Abnahme, das jede Session lesen kann.',
    inputSchema: {
      type: 'object',
      properties: {
        aktion: { type: 'string', enum: ['anlegen', 'zeigen', 'annehmen', 'aendern', 'review', 'abschliessen', 'blockieren', 'abbrechen'] },
        id: PROPS.id,
        titel: { type: 'string' },
        text: { type: 'string', description: 'Markdown: Ziel, Kontext, Umsetzung.' },
        repo: { type: 'string', description: 'owner/repo; ohne Angabe das eigene.' },
        abnahme: { type: 'array', items: { type: 'string' }, description: 'Prüfbare Kriterien, mindestens eins.' },
        prio: { type: 'string', enum: ['hoch', 'normal'] },
        eltern: { type: 'string', description: 'Der übergeordnete Auftrag (a3).' },
        branch: { type: 'string' },
        pr: { type: 'number', description: 'Die PR-Nummer bei review und abschliessen.' },
        grund: { type: 'string', description: 'Bei blockieren und abbrechen.' },
      },
      required: ['aktion'],
    },
    isDeferred: false,
  },
  {
    name: 'kollegen_holen',
    description:
      'Startet eine neue Cloud-Session für einen Auftrag vom Brett: Prompt aus dem Auftrag und den Regeln des Repos, Tags, Branch, Modell. Die neue Session erscheint im Büro in deinem Team. Nutze es, wenn Arbeit parallel gehen kann oder ein anderes Repo betrifft.',
    inputSchema: {
      type: 'object',
      properties: {
        auftrag: { type: 'string', description: 'Die Auftrags-ID (a12).' },
        model: { type: 'string', description: 'Modell-ID; ohne Angabe nach den Regeln des Repos.' },
        hinweis: { type: 'string', description: 'Ein Satz an die neue Session, zusätzlich zum Auftrag.' },
      },
      required: ['auftrag'],
    },
    isDeferred: false,
  },
  {
    name: 'abgeben',
    description:
      'Gibt deinen Auftrag ab, wenn du nicht weiterkommst, der Kontext knapp wird oder jemand anderes ihn besser macht: an den Chef vom Dienst (cvd), an eine neue Session (neu) oder an einen Kollegen (Session-ID oder Name). Pflicht: Stand, offene Punkte, nächster Schritt.',
    inputSchema: {
      type: 'object',
      properties: {
        an: { type: 'string', description: 'cvd, neu, oder Session-ID/Name eines Kollegen.' },
        auftrag: { type: 'string', description: 'Die Auftrags-ID; ohne Angabe dein eigener.' },
        stand: { type: 'string', description: 'Was fertig ist und wo es liegt.' },
        branch: { type: 'string', description: 'Branch und Commit.' },
        offen: { type: 'string', description: 'Was noch fehlt.' },
        fallen: { type: 'string', description: 'Was den Nachfolger überraschen würde.' },
        naechster: { type: 'string', description: 'Der nächste Schritt.' },
      },
      required: ['an', 'stand', 'offen', 'naechster'],
    },
    isDeferred: false,
  },
  {
    name: 'stand',
    description: 'Setzt deine Statuszeile im Büro, etwa „Baue Warenkorb, Schritt 3 von 5“. Alle 30 Minuten, und bei jedem größeren Schritt.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        fortschritt: { type: 'string', description: '„3/5“, „60 %“ oder frei.' },
      },
      required: ['text'],
    },
    isDeferred: false,
  },
  {
    name: 'cvd',
    description: 'Meldet dem Chef vom Dienst etwas oder fragt ihn (zählt nicht zum Nachrichtenlimit): Auftrag fertig, Blockade, Frage, Bitte um einen Kollegen.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    isDeferred: false,
  },
  {
    name: 'antwort',
    description: 'Beantwortet die letzte Nachricht des Nutzers aus dem Büro-Fenster kurz auf der Büro-Seite, wenn eine Zeile reicht.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    isDeferred: false,
  },
  {
    name: 'kommando',
    description: 'Nur für den Chef vom Dienst: schließt ein Kommando des Chefs ab (erledigt, braucht_dich, abgelehnt) oder meldet in_arbeit. Das Ergebnis steht dann auf der Büro-Seite.',
    inputSchema: {
      type: 'object',
      properties: {
        aktion: { type: 'string', enum: ['erledigt', 'braucht_dich', 'abgelehnt', 'in_arbeit'] },
        id: { type: 'string', description: 'Die Kommando-ID (k-…).' },
        ergebnis: { type: 'string', description: 'Ein bis drei Zeilen, bei braucht_dich die Frage, bei abgelehnt der Grund.' },
      },
      required: ['aktion', 'id'],
    },
    isDeferred: false,
  },
  {
    name: 'besprechung',
    description:
      'Zusammen denken über Sessions hinweg: eroeffnen (Thema, eine Frage, Teilnehmer, Frist), beitragen (These, Empfehlung, Risiko), zusammenfassen, entscheiden, zeigen. Nur mit einer klaren Frage.',
    inputSchema: {
      type: 'object',
      properties: {
        aktion: { type: 'string', enum: ['eroeffnen', 'beitragen', 'zusammenfassen', 'entscheiden', 'zeigen'] },
        id: PROPS.id,
        thema: { type: 'string' },
        frage: { type: 'string' },
        teilnehmer: { type: 'array', items: { type: 'string' }, description: 'Session-IDs oder Namen; „alle“ für alle wachen Sessions; „repo:<name>“ für ein Repo.' },
        frist: { type: 'number', description: 'Minuten, Standard 15.' },
        these: { type: 'string' },
        empfehlung: { type: 'string' },
        risiko: { type: 'string' },
        text: { type: 'string' },
        zusammenfassung: { type: 'string' },
        entscheidung: { type: 'string' },
      },
      required: ['aktion'],
    },
    isDeferred: false,
  },
  {
    name: 'ablegen',
    description:
      'Die Ablage des Büros: ablegen (notiz, link oder datei; Datei vorher mit dem Artifact-Werkzeug auf die Büro-Seite hochladen und die URL angeben) oder zeigen (nach Repo und Tag suchen, oder einen Eintrag im Wortlaut).',
    inputSchema: {
      type: 'object',
      properties: {
        aktion: { type: 'string', enum: ['ablegen', 'zeigen'] },
        id: PROPS.id,
        art: { type: 'string', enum: ['notiz', 'link', 'datei'] },
        titel: { type: 'string' },
        text: { type: 'string' },
        url: { type: 'string' },
        asset: { type: 'string', description: 'Die Asset-ID aus dem Upload.' },
        repo: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['aktion'],
    },
    isDeferred: false,
  },
  {
    name: 'regel',
    description: 'Die Regeln eines Repos zeigen oder setzen (nur auf Kommando des Chefs): Auto-Merge, Modelle, Branch-Schema, Prüfbefehle, Archivieren, höchstens parallele Sessions, Freigaben.',
    inputSchema: {
      type: 'object',
      properties: {
        aktion: { type: 'string', enum: ['zeigen', 'setzen'] },
        repo: { type: 'string', description: 'owner/repo; ohne Angabe das eigene.' },
        autoMerge: { type: 'string', enum: ['nie', 'gruen', 'gruen_pruefer'] },
        modelle: { type: 'object', properties: { cvd: { type: 'string' }, mitarbeiter: { type: 'string' }, pruefer: { type: 'string' } } },
        branchSchema: { type: 'string' },
        pruefbefehle: { type: 'array', items: { type: 'string' } },
        archivierenNachMerge: { type: 'boolean' },
        maxParallel: { type: 'number' },
        freigabe: { type: 'string', description: 'Eine Freigabe in Worten, wird angehängt.' },
      },
      required: ['aktion'],
    },
    isDeferred: false,
  },
] as const

// Helpers for reading tool input.

function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function num(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function list(input: Record<string, unknown>, key: string): string[] {
  const value = input[key]

  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
}

function asData(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function namesOf(records: readonly SessionRecord[]): Map<string, string> {
  const names = new Map<string, string>([['chef', 'Chef'], ['cvd', 'Chef vom Dienst']])
  for (const record of records) {
    names.set(record.id, record.name)
  }

  return names
}

async function loadAuftrag($: $, id: string): Promise<{ auftrag: Auftrag; version: number } | undefined> {
  const found = await dbGet($, 'auftraege', id)
  const auftrag = auftragOf(found?.data)

  return found === undefined || auftrag === undefined ? undefined : { auftrag, version: found.version }
}

/** Applies a step to an order on the page, again when someone wrote it meanwhile. */
async function updateAuftrag(
  $: $,
  id: string,
  apply: (auftrag: Auftrag) => Auftrag | { error: string },
): Promise<Auftrag | { error: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadAuftrag($, id)
    if (loaded === undefined) {
      return { error: `Kein Auftrag ${id} auf dem Brett.` }
    }
    const next = apply(loaded.auftrag)
    if ('error' in next) {
      return next
    }
    const outcome = await dbWrite($, 'set', 'auftraege', id, asData(next), loaded.version)
    if (outcome.isDone) {
      return next
    }
    if (!outcome.isStale) {
      return { error: outcome.reason }
    }
  }

  return { error: `Auftrag ${id} wurde gerade von jemand anderem geändert; versuch es noch einmal.` }
}

async function nextNr($: $): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const doc = await dbGet($, 'leitung', 'zaehler')
    const nr = naechsteNummer(doc?.data)
    const outcome = await dbWrite($, 'set', 'leitung', 'zaehler', { auftraege: nr }, doc?.version)
    if (outcome.isDone) {
      return nr
    }
    if (!outcome.isStale) {
      throw new Error(outcome.reason)
    }
  }
  throw new Error('Der Auftragszähler ist gerade umkämpft.')
}

export async function loadRegeln($: $, repo: string, now: number): Promise<Regeln> {
  const cached = regelnCache.get(repo)
  if (cached !== undefined && now - cached.at < 5 * 60_000) {
    return cached.regeln
  }
  const found = await dbGet($, 'regeln', regelnId(repo))
  const regeln = regelnOf(found?.data, repo)
  regelnCache.set(repo, { at: now, regeln })

  return regeln
}

async function openAuftraege($: $, states: readonly AuftragState[] = OFFENE_ZUSTAENDE): Promise<Auftrag[]> {
  const docs = await dbQuery($, 'auftraege', { where: [['state', 'in', states]], limit: 200 })

  return docs.map(doc => auftragOf(doc.data)).filter((one): one is Auftrag => one !== undefined)
}

/** A letter to a colleague, filed on the page for a busy recipient and sent through the cloud. */
async function sendLetter($: $, ctx: DienstCtx, target: SessionRecord, body: string): Promise<string | undefined> {
  const now = await $.clock.now()
  const records = ctx.records()
  const me = records.find(one => sameSession(one.id, ctx.cloudSelf())) ?? ctx.self()
  if (me === undefined) {
    return 'Das Büro ist noch nicht bereit.'
  }
  const letter = letterId(ctx.cloudSelf(), now)
  const text = colleagueMessage(me, clip(body, 2000), letter)
  const filed = await fileLetter($, letter, { to: target.id, from: ctx.idOfSelf(), text, createdAt: now, state: 'neu' })
  const refused = await deliver($, target.id, text)
  if (refused !== undefined && filed !== undefined) {
    await dbWrite($, 'delete', 'kollegenpost', letter, undefined, filed).catch(() => undefined)
  }

  return refused
}

function cvdOf(records: readonly SessionRecord[], ctx: DienstCtx, now: number): SessionRecord | undefined {
  const wanted = ctx.cvdId()
  const byLease = wanted === undefined ? undefined : records.find(one => sameSession(one.id, wanted) && isActive(one, now))

  return byLease ?? records.find(one => one.rolle === 'cvd' && isActive(one, now) && !sameSession(one.id, ctx.cloudSelf()))
}

/** Tells the Chef vom Dienst something; false when none is awake. */
async function tellCvd($: $, ctx: DienstCtx, text: string): Promise<boolean> {
  if (ctx.rolle() === 'cvd') {
    return false
  }
  const now = await $.clock.now()
  const cvd = cvdOf(ctx.records(), ctx, now)
  if (cvd === undefined) {
    return false
  }

  return (await sendLetter($, ctx, cvd, text)) === undefined
}

/** A short line to the person's phone, once per key, not more than one every two minutes. */
async function push($: $, key: string, message: string, now: number): Promise<void> {
  const last = alerted.get(`push:${key}`)
  if ((last !== undefined && now - last < ALERT_AGAIN_MS) || now - pushAt < PUSH_EVERY_MS) {
    return
  }
  alerted.set(`push:${key}`, now)
  pushAt = now
  try {
    await $.tool.call({ tool: 'PushNotification', message: clip(message, 190), status: 'proactive' } as never)
  } catch (error) {
    $.ui.log(`buero: push: ${String(error)}`, { to: 'debug' })
  }
}

/** Starts a session for an order: the prompt from the order and the rules, the team from the tags. */
async function holen(
  $: $,
  ctx: DienstCtx,
  auftrag: Auftrag,
  options: { model?: string; hinweis?: string },
): Promise<{ result: string } | { deny: string }> {
  const now = await $.clock.now()
  const regeln = await loadRegeln($, auftrag.repo, now)
  const records = ctx.records()
  const busy = records.filter(one => one.auftrag !== undefined && one.status === 'arbeitet' && one.project.toLowerCase() === auftrag.repo.split('/').at(-1)?.toLowerCase())
  if (busy.length >= regeln.maxParallel) {
    return { deny: `Im Repo ${auftrag.repo} arbeiten schon ${busy.length} Auftrags-Sessions; die Regel erlaubt ${regeln.maxParallel}. Warte, oder lass den Chef die Regel ändern.` }
  }
  const branch = auftrag.branch ?? branchFor(auftrag, regeln)
  const model = options.model ?? auftrag.model ?? regeln.modelle.mitarbeiter
  const cvd = ctx.rolle() === 'cvd' ? ctx.idOfSelf() : ctx.cvdId()
  const prompt =
    kindPrompt({ auftrag, branch, regeln, cvd, eltern: ctx.idOfSelf(), now }) +
    (options.hinweis === undefined ? '' : `\n\nHINWEIS VON ${records.find(one => sameSession(one.id, ctx.cloudSelf()))?.name ?? 'der Eltern-Session'}: ${clip(options.hinweis, 500)}`)
  const title = `Auftrag ${auftrag.nr}: ${auftrag.titel}`
  const answer = await $.mcp.call(CLOUD_SERVER, 'create_session', {
    title,
    prompt,
    tags: [`buero:auftrag=${auftrag.id}`, `buero:eltern=${ctx.idOfSelf()}`],
    ...(model === undefined ? {} : { model }),
    source_url: `https://github.com/${auftrag.repo}`,
    outcome_branch: branch,
  })
  const text = await unsaved($, textOf(answer))
  if (answer.isError) {
    return { deny: `Die Session ließ sich nicht starten: ${clip(text, 200)}` }
  }
  const started = parseSession(text)?.id ?? /session_[A-Za-z0-9]+/.exec(text)?.[0]
  if (started === undefined) {
    return { deny: `Die Cloud hat keine Session-ID geantwortet: ${clip(text, 200)}` }
  }
  const updated = await updateAuftrag($, auftrag.id, one =>
    schritt(one, 'vergeben', ctx.idOfSelf(), now, { owner: started, branch, model, was: `an neue Session ${started} vergeben` }),
  )
  if ('error' in updated) {
    return { result: `Session ${started} gestartet (${title}), aber der Auftrag ließ sich nicht aktualisieren: ${updated.error}` }
  }
  ctx.note('auftrag', `hat für Auftrag ${auftrag.id} eine Session geholt (${started})`)

  return {
    result:
      `Session gestartet: ${started} (${title}), Branch ${branch}, Modell ${model ?? 'Standard'}. https://claude.ai/code/${started}\n` +
      `Auftrag ${auftrag.id} ist vergeben; die Session nimmt ihn mit "annehmen" an. Der Chef vom Dienst meldet sich, wenn sie das nicht binnen 10 Minuten tut.`,
  }
}

/** Who a meeting's participants are: ids, names, `alle`, `repo:<name>`. */
function participantsOf(records: readonly SessionRecord[], wanted: readonly string[], ctx: DienstCtx, now: number): string[] {
  const active = records.filter(one => isActive(one, now) && !sameSession(one.id, ctx.cloudSelf()))
  const ids = new Set<string>()
  for (const one of wanted) {
    const key = one.trim().toLowerCase()
    if (key === 'alle') {
      active.forEach(record => ids.add(record.id))
    } else if (key.startsWith('repo:')) {
      active.filter(record => record.project.toLowerCase() === key.slice(5)).forEach(record => ids.add(record.id))
    } else {
      const found = resolveRecipient(active, one)
      if (found !== undefined) {
        ids.add(found.id)
      }
    }
  }

  return [...ids]
}

function inCloud(ctx: DienstCtx): string | undefined {
  return ctx.cloudSelf() === '' ? 'Dieses Werkzeug braucht die Büro-Seite der Cloud; auf dem PC gibt es nur kollegen und nachricht.' : undefined
}

// The tools, one function each; register.tsx hooks them.

export async function standTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const input = e as unknown as Record<string, unknown>
    const text = str(input, 'text')
    if (text === undefined) {
      return { deny: 'Ein Stand braucht einen Text.' }
    }
    const now = await $.clock.now()
    ctx.change({ stand: { text: clip(text, 200), at: now, fortschritt: str(input, 'fortschritt') } })

    return { result: `Stand gesetzt: ${clip(text, 200)}` }
  }
}

export async function cvdTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const text = str(e as unknown as Record<string, unknown>, 'text')
    if (text === undefined) {
      return { deny: 'Leere Meldung: nichts gesendet.' }
    }
    if (ctx.rolle() === 'cvd') {
      return { deny: 'Du bist selbst der Chef vom Dienst.' }
    }
    const now = await $.clock.now()
    const cvd = cvdOf(ctx.records(), ctx, now)
    if (cvd === undefined) {
      return { deny: 'Gerade ist kein Chef vom Dienst wach. Erledige, was du kannst, und schreib dem Nutzer, was seine Entscheidung braucht.' }
    }
    const refused = await sendLetter($, ctx, cvd, text)
    if (refused !== undefined) {
      return { deny: `Nicht zugestellt: ${refused}` }
    }
    ctx.note('nachricht', `→ Chef vom Dienst: ${clip(text, 120)}`)

    return { result: `An den Chef vom Dienst (${cvd.name}) gemeldet.` }
  }
}

export async function antwortTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const text = str(e as unknown as Record<string, unknown>, 'text')
    const post = ctx.lastPost()
    if (text === undefined) {
      return { deny: 'Leere Antwort.' }
    }
    if (post === undefined) {
      return { deny: 'Es gibt keine Nachricht des Nutzers aus dem Büro-Fenster, auf die du antworten könntest.' }
    }
    const now = await $.clock.now()
    const doc = await dbGet($, 'post', post)
    if (doc === undefined) {
      return { deny: 'Die Nachricht ist auf der Seite nicht mehr da.' }
    }
    const outcome = await dbWrite($, 'update', 'post', post, { reply: clip(text, 1000), repliedAt: now }, doc.version)

    return outcome.isDone ? { result: 'Antwort steht auf der Büro-Seite unter seiner Nachricht.' } : { deny: `Nicht gespeichert: ${outcome.reason}` }
  }
}

export async function auftragTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const aktion = str(input, 'aktion')
    const now = await $.clock.now()
    const who = ctx.idOfSelf()
    const records = ctx.records()
    const names = namesOf(records)
    const id = str(input, 'id') ?? (aktion === 'anlegen' || aktion === 'zeigen' ? undefined : ctx.auftragTag())
    if (aktion === 'anlegen') {
      const draft = {
        titel: str(input, 'titel') ?? '',
        text: str(input, 'text') ?? '',
        repo: str(input, 'repo') ?? ctx.repo() ?? '',
        createdBy: who,
        now,
        abnahme: list(input, 'abnahme'),
        prio: str(input, 'prio'),
        eltern: str(input, 'eltern') ?? ctx.auftragTag(),
        branch: str(input, 'branch'),
      }
      // checked before a number is taken, so a refused order leaves no gap
      const checked = neuerAuftrag({ ...draft, nr: 0 })
      if ('error' in checked) {
        return { deny: checked.error }
      }
      const made = neuerAuftrag({ ...draft, nr: await nextNr($) })
      if ('error' in made) {
        return { deny: made.error }
      }
      const version = await dbCreate($, 'auftraege', made.id, asData(made))
      if (version === undefined) {
        return { deny: 'Der Auftrag ließ sich nicht auf dem Brett speichern.' }
      }
      ctx.note('auftrag', `hat Auftrag ${made.id} angelegt: ${made.titel}`)

      return {
        result: `Auftrag ${made.id} angelegt: ${made.titel} (${made.repo}, Prio ${made.prio}). Eine Session dafür holen: mcp__buero__kollegen_holen auftrag=${made.id}; selbst machen: aktion=annehmen id=${made.id}.`,
      }
    }
    if (aktion === 'zeigen') {
      if (id === undefined) {
        return { result: auftraegeText(await openAuftraege($), now, names) }
      }
      const loaded = await loadAuftrag($, id)

      return loaded === undefined ? { deny: `Kein Auftrag ${id} auf dem Brett.` } : { result: auftragText(loaded.auftrag, now, names) }
    }
    if (id === undefined) {
      return { deny: 'Welcher Auftrag? Gib die ID an (a12) oder nimm erst einen an.' }
    }
    const pr = num(input, 'pr')
    const steps: Partial<Record<string, { aktion: AuftragAktion; patch: Partial<Auftrag> & { was?: string } }>> = {
      annehmen: { aktion: 'annehmen', patch: {} },
      aendern: {
        aktion: 'aendern',
        patch: {
          ...(str(input, 'titel') === undefined ? {} : { titel: clip(str(input, 'titel') ?? '', 120) }),
          ...(str(input, 'text') === undefined ? {} : { text: str(input, 'text') }),
          ...(str(input, 'repo') === undefined ? {} : { repo: str(input, 'repo') }),
          ...(list(input, 'abnahme').length === 0 ? {} : { abnahme: list(input, 'abnahme') }),
          ...(str(input, 'prio') === undefined ? {} : { prio: str(input, 'prio') === 'hoch' ? 'hoch' : 'normal' }),
          ...(str(input, 'branch') === undefined ? {} : { branch: str(input, 'branch') }),
          ...(pr === undefined ? {} : { pr: `PR #${pr}` }),
        },
      },
      review: { aktion: 'review', patch: { ...(pr === undefined ? {} : { pr: `PR #${pr}` }), was: pr === undefined ? 'bereit zum Review' : `bereit zum Review: PR #${pr}` } },
      abschliessen: { aktion: 'abschliessen', patch: { ...(pr === undefined ? {} : { pr: `PR #${pr}` }) } },
      blockieren: { aktion: 'blockieren', patch: { grund: str(input, 'grund'), was: `blockiert: ${str(input, 'grund') ?? ''}` } },
      abbrechen: { aktion: 'abbrechen', patch: { grund: str(input, 'grund'), was: `abgebrochen: ${str(input, 'grund') ?? ''}` } },
    }
    const step = aktion === undefined ? undefined : steps[aktion]
    if (step === undefined) {
      return { deny: `Unbekannte Aktion "${aktion ?? ''}".` }
    }
    const updated = await updateAuftrag($, id, one => schritt(one, step.aktion, who, now, step.patch))
    if ('error' in updated) {
      return { deny: updated.error }
    }
    if (step.aktion === 'annehmen') {
      ctx.setAuftragTag(id)
    }
    ctx.note('auftrag', `Auftrag ${id} ${AUFTRAG_LABEL[updated.state]}${updated.pr === undefined ? '' : ` (${updated.pr})`}`)
    const regeln = await loadRegeln($, updated.repo, now)
    if (step.aktion === 'review' || step.aktion === 'abschliessen' || step.aktion === 'blockieren' || step.aktion === 'abbrechen') {
      const merge = regeln.autoMerge === 'nie' ? 'Regel: nicht automatisch mergen.' : regeln.autoMerge === 'gruen' ? 'Regel: bei grüner CI mergen.' : 'Regel: bei grüner CI und Prüfer-Befund mergen.'
      await tellCvd($, ctx, `Auftrag ${id} (${updated.titel}) ist ${AUFTRAG_LABEL[updated.state]}${updated.pr === undefined ? '' : `, ${updated.pr}`}${updated.grund === undefined ? '' : `: ${updated.grund}`}. ${merge}`)
    }
    const ablage = step.aktion === 'annehmen' ? await ablageHint($, updated.repo, now) : ''

    return { result: `Auftrag ${id} ist jetzt ${AUFTRAG_LABEL[updated.state]}.${ablage}` }
  }
}

export async function holenTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const id = str(input, 'auftrag')
    if (id === undefined) {
      return { deny: 'Welcher Auftrag? Erst anlegen (mcp__buero__auftrag aktion=anlegen), dann holen.' }
    }
    const loaded = await loadAuftrag($, id)
    if (loaded === undefined) {
      return { deny: `Kein Auftrag ${id} auf dem Brett.` }
    }
    if (loaded.auftrag.state === 'in_arbeit' || loaded.auftrag.state === 'fertig' || loaded.auftrag.state === 'abgebrochen') {
      return { deny: `Auftrag ${id} ist ${AUFTRAG_LABEL[loaded.auftrag.state]}; dafür holt man niemanden mehr.` }
    }

    return holen($, ctx, loaded.auftrag, { model: str(input, 'model'), hinweis: str(input, 'hinweis') })
  }
}

export async function abgebenTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const id = str(input, 'auftrag') ?? ctx.auftragTag()
    const an = str(input, 'an')
    const stand = str(input, 'stand')
    const offen = str(input, 'offen')
    const naechster = str(input, 'naechster')
    if (id === undefined) {
      return { deny: 'Du hast keinen Auftrag vom Brett; gib die ID an.' }
    }
    if (an === undefined || stand === undefined || offen === undefined || naechster === undefined) {
      return { deny: 'Abgeben braucht an, stand, offen und naechster.' }
    }
    const now = await $.clock.now()
    const who = ctx.idOfSelf()
    const uebergabe = { at: now, von: who, stand: clip(stand, 2000), branch: str(input, 'branch'), offen: clip(offen, 2000), fallen: str(input, 'fallen'), naechster: clip(naechster, 1000) }
    const records = ctx.records()
    const key = an.toLowerCase()
    if (key === 'cvd' || key === 'neu') {
      const updated = await updateAuftrag($, id, one => schritt(one, 'zurueck', who, now, { uebergabe, was: `abgegeben an ${key === 'cvd' ? 'den Chef vom Dienst' : 'eine neue Session'}` }))
      if ('error' in updated) {
        return { deny: updated.error }
      }
      ctx.setAuftragTag(undefined)
      ctx.note('uebergabe', `hat Auftrag ${id} abgegeben: ${clip(stand, 100)}`)
      if (key === 'neu') {
        const started = await holen($, ctx, updated, {})

        return 'deny' in started ? { result: `Auftrag ${id} liegt mit Übergabe auf dem Brett, aber: ${started.deny}` } : started
      }
      const told = await tellCvd($, ctx, `Auftrag ${id} (${updated.titel}) abgegeben. Stand: ${clip(stand, 300)}. Offen: ${clip(offen, 300)}. Nächster Schritt: ${clip(naechster, 200)}. Bitte neu vergeben.`)

      return { result: `Auftrag ${id} liegt mit deiner Übergabe auf dem Brett${told ? ', der Chef vom Dienst weiß Bescheid' : ' (kein Chef vom Dienst wach, er findet ihn beim nächsten Rundgang)'}.` }
    }
    const target = resolveRecipient(records.filter(one => !sameSession(one.id, ctx.cloudSelf()) && isActive(one, now)), an)
    if (target === undefined) {
      return { deny: `Kein Kollege "${an}" im Büro. Gib cvd, neu oder eine Session-ID an.` }
    }
    const updated = await updateAuftrag($, id, one => schritt(one, 'vergeben', who, now, { owner: target.id, uebergabe, was: `an ${target.name} abgegeben` }))
    if ('error' in updated) {
      return { deny: updated.error }
    }
    const refused = await sendLetter(
      $,
      ctx,
      target,
      `Ich gebe dir Auftrag ${id} (${updated.titel}) ab. Nimm ihn mit mcp__buero__auftrag aktion=annehmen id=${id} an und lies ihn mit aktion=zeigen. Stand: ${clip(stand, 300)}. Offen: ${clip(offen, 300)}. Nächster Schritt: ${clip(naechster, 200)}.`,
    )
    ctx.setAuftragTag(undefined)
    ctx.note('uebergabe', `hat Auftrag ${id} an ${target.name} abgegeben`)

    return refused === undefined
      ? { result: `Auftrag ${id} an ${target.name} abgegeben; bis zur Annahme bleibt er bei dir auf dem Brett.` }
      : { result: `Auftrag ${id} ist ${target.name} zugeordnet, aber die Nachricht kam nicht an (${refused}); der Chef vom Dienst sieht es beim Rundgang.` }
  }
}

export async function kommandoTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const id = str(input, 'id')
    const aktion = str(input, 'aktion')
    const ergebnis = str(input, 'ergebnis')
    const state: KommandoState | undefined =
      aktion === 'erledigt' || aktion === 'braucht_dich' || aktion === 'abgelehnt' || aktion === 'in_arbeit' ? aktion : undefined
    if (id === undefined || state === undefined) {
      return { deny: 'kommando braucht id und aktion (erledigt, braucht_dich, abgelehnt, in_arbeit).' }
    }
    if (state !== 'in_arbeit' && ergebnis === undefined) {
      return { deny: 'Gib ein Ergebnis an: ein bis drei Zeilen, die Frage oder den Grund.' }
    }
    const now = await $.clock.now()
    const closed = await closeKommando($, ctx, id, state, ergebnis ?? '', now)

    return closed === undefined ? { result: `Kommando ${id}: ${state}.` } : { deny: closed }
  }
}

export async function besprechungTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const aktion = str(input, 'aktion')
    const now = await $.clock.now()
    const records = ctx.records()
    const names = namesOf(records)
    const who = ctx.idOfSelf()
    if (aktion === 'eroeffnen') {
      const teilnehmer = participantsOf(records, list(input, 'teilnehmer'), ctx, now)
      const made = neueBesprechung({
        thema: str(input, 'thema') ?? '',
        frage: str(input, 'frage') ?? '',
        von: who,
        teilnehmer,
        now,
        moderator: ctx.rolle() === 'cvd' ? who : ctx.cvdId() ?? who,
        fristMinuten: num(input, 'frist'),
      })
      if ('error' in made) {
        return { deny: list(input, 'teilnehmer').length > 0 && teilnehmer.length === 0 ? 'Keiner der Teilnehmer ist im Büro.' : made.error }
      }
      const id = `b-${now.toString(36)}`
      if ((await dbCreate($, 'besprechungen', id, asData(made))) === undefined) {
        return { deny: 'Die Besprechung ließ sich nicht speichern.' }
      }
      const invited: string[] = []
      for (const sid of made.teilnehmer) {
        const record = records.find(one => one.id === sid)
        if (record !== undefined && (await sendLetter($, ctx, record, einladungText(id, made, now))) === undefined) {
          invited.push(record.name)
        }
      }
      ctx.note('besprechung', `hat Besprechung ${id} eröffnet: ${made.thema}`)

      return { result: `Besprechung ${id} eröffnet, eingeladen: ${invited.join(', ') || 'niemand erreichbar'}. Frist ${Math.round((made.bis - now) / 60_000)} Min. Dann: aktion=zeigen id=${id}, aktion=zusammenfassen.` }
    }
    const id = str(input, 'id')
    if (id === undefined) {
      const docs = await dbQuery($, 'besprechungen', { where: [['createdAt', '>=', now - 30 * DAY_MS]], limit: 50 })
      const found = docs.flatMap(doc => {
        const b = besprechungOf(doc.data)

        return b === undefined ? [] : [{ id: doc.id, b }]
      })

      return { result: besprechungenText(found, now) }
    }
    const doc = await dbGet($, 'besprechungen', id)
    const b = besprechungOf(doc?.data)
    if (doc === undefined || b === undefined) {
      return { deny: `Keine Besprechung ${id}.` }
    }
    const beitraegeOf = async (): Promise<Beitrag[]> =>
      (await dbQuery($, `besprechungen/${id}/beitraege`, { limit: 100 })).map(one => beitragOf(one.data)).filter((one): one is Beitrag => one !== undefined)
    if (aktion === 'zeigen') {
      return { result: besprechungText(id, b, await beitraegeOf(), now, names) }
    }
    if (aktion === 'beitragen') {
      const these = str(input, 'these')
      if (these === undefined) {
        return { deny: 'Ein Beitrag braucht eine These (ein Satz).' }
      }
      const beitrag: Beitrag = {
        von: who,
        name: names.get(who),
        at: now,
        these: clip(these, 500),
        empfehlung: clip(str(input, 'empfehlung') ?? '', 500),
        risiko: str(input, 'risiko') === undefined ? undefined : clip(str(input, 'risiko') ?? '', 500),
        text: str(input, 'text') === undefined ? undefined : clip(str(input, 'text') ?? '', 2000),
      }
      const existing = await dbGet($, `besprechungen/${id}/beitraege`, tailOf(who))
      const outcome = await dbWrite($, 'set', `besprechungen/${id}/beitraege`, tailOf(who), asData(beitrag), existing?.version)

      return outcome.isDone ? { result: `Beitrag zu ${id} gespeichert.` } : { deny: `Beitrag nicht gespeichert: ${outcome.reason}` }
    }
    if (aktion === 'zusammenfassen' || aktion === 'entscheiden') {
      const text = str(input, aktion === 'zusammenfassen' ? 'zusammenfassung' : 'entscheidung')
      if (text === undefined) {
        return { deny: `${aktion} braucht den Text (${aktion === 'zusammenfassen' ? 'zusammenfassung' : 'entscheidung'}).` }
      }
      const patch = aktion === 'zusammenfassen' ? { zusammenfassung: clip(text, 4000), state: 'zusammengefasst' } : { entscheidung: clip(text, 2000), state: 'entschieden' }
      const outcome = await dbWrite($, 'update', 'besprechungen', id, patch, doc.version)
      if (!outcome.isDone) {
        return { deny: `Nicht gespeichert: ${outcome.reason}` }
      }
      ctx.note('besprechung', `Besprechung ${id} ${patch.state}: ${clip(text, 120)}`)
      if (aktion === 'zusammenfassen') {
        await push($, `besprechung:${id}`, `Besprechung ${b.thema} zusammengefasst: ${clip(text, 120)}`, now)
      }

      return { result: `Besprechung ${id} ist ${patch.state}.` }
    }

    return { deny: `Unbekannte Aktion "${aktion ?? ''}".` }
  }
}

export async function ablegenTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const aktion = str(input, 'aktion')
    const now = await $.clock.now()
    const who = ctx.idOfSelf()
    if (aktion === 'ablegen') {
      const made = neueAblage({
        art: str(input, 'art'),
        titel: str(input, 'titel') ?? '',
        text: str(input, 'text'),
        url: str(input, 'url'),
        asset: str(input, 'asset'),
        repo: str(input, 'repo') ?? ctx.repo(),
        tags: list(input, 'tags'),
        von: who,
        now,
      })
      if ('error' in made) {
        return { deny: made.error }
      }
      const id = `x-${now.toString(36)}-${tailOf(who).slice(-4)}`
      if ((await dbCreate($, 'ablage', id, asData(made))) === undefined) {
        return { deny: 'Der Eintrag ließ sich nicht ablegen.' }
      }
      ctx.note('ablage', `hat abgelegt: ${made.titel}`)

      return { result: `Abgelegt als ${id}: ${made.titel}.` }
    }
    const id = str(input, 'id')
    const names = namesOf(ctx.records())
    if (id !== undefined) {
      const doc = await dbGet($, 'ablage', id)
      const a = ablageOf(doc?.data)

      return a === undefined ? { deny: `Kein Eintrag ${id}.` } : { result: ablageEintragText(id, a, now) }
    }
    const repo = str(input, 'repo')
    const tags = list(input, 'tags').map(one => one.toLowerCase())
    const docs = await dbQuery($, 'ablage', { where: [['at', '>=', now - 30 * DAY_MS]], limit: 200 })
    const found = docs
      .flatMap(doc => {
        const a = ablageOf(doc.data)

        return a === undefined ? [] : [{ id: doc.id, a }]
      })
      .filter(({ a }) => (repo === undefined || a.repo === repo) && tags.every(tag => a.tags.includes(tag)))

    return { result: ablageText(found, now, names) }
  }
}

export async function regelTool($: $, ctx: DienstCtx, e: unknown): Promise<ToolAnswer> {
  {
    const offline = inCloud(ctx)
    if (offline !== undefined) {
      return { deny: offline }
    }
    const input = e as unknown as Record<string, unknown>
    const repo = str(input, 'repo') ?? ctx.repo()
    if (repo === undefined) {
      return { deny: 'Für welches Repo? owner/repo angeben.' }
    }
    const now = await $.clock.now()
    if (str(input, 'aktion') === 'zeigen') {
      return { result: regelnText(await loadRegeln($, repo, now)) }
    }
    if (ctx.rolle() !== 'cvd' && ctx.auftragTag() !== undefined) {
      return { deny: 'Regeln setzt der Chef vom Dienst auf Kommando des Chefs, oder der Chef selbst auf der Seite.' }
    }
    const id = regelnId(repo)
    const found = await dbGet($, 'regeln', id)
    const current = regelnOf(found?.data, repo)
    const modelle = typeof input.modelle === 'object' && input.modelle !== null ? (input.modelle as Record<string, unknown>) : {}
    const model = (key: 'cvd' | 'mitarbeiter' | 'pruefer') => (typeof modelle[key] === 'string' ? (modelle[key] as string) : current.modelle[key])
    const freigabe = str(input, 'freigabe')
    const next: Regeln = {
      repo,
      autoMerge: str(input, 'autoMerge') === 'gruen' || str(input, 'autoMerge') === 'gruen_pruefer' || str(input, 'autoMerge') === 'nie' ? (str(input, 'autoMerge') as Regeln['autoMerge']) : current.autoMerge,
      modelle: { cvd: model('cvd'), mitarbeiter: model('mitarbeiter'), pruefer: model('pruefer') },
      branchSchema: str(input, 'branchSchema') ?? current.branchSchema,
      pruefbefehle: list(input, 'pruefbefehle').length === 0 ? current.pruefbefehle : list(input, 'pruefbefehle'),
      archivierenNachMerge: typeof input.archivierenNachMerge === 'boolean' ? input.archivierenNachMerge : current.archivierenNachMerge,
      maxParallel: num(input, 'maxParallel') ?? current.maxParallel,
      freigaben: freigabe === undefined ? current.freigaben : [...current.freigaben, clip(freigabe, 200)].slice(-20),
      updatedAt: now,
    }
    const outcome = await dbWrite($, 'set', 'regeln', id, asData(next), found?.version)
    if (!outcome.isDone) {
      return { deny: `Regeln nicht gespeichert: ${outcome.reason}` }
    }
    regelnCache.set(repo, { at: now, regeln: next })
    ctx.note('regel', `hat die Regeln für ${repo} gesetzt: Merge ${next.autoMerge}`)

    return { result: regelnText(next) }
  }
}

/** What the shelf holds for a repository, named once when a session takes an order. */
async function ablageHint($: $, repo: string, now: number): Promise<string> {
  try {
    const docs = await dbQuery($, 'ablage', { where: [['at', '>=', now - 7 * DAY_MS]], limit: 100 })
    const titles = docs
      .map(doc => ablageOf(doc.data))
      .filter(a => a !== undefined && a.repo === repo)
      .map(a => `${a?.titel ?? ''}`)
      .slice(0, 8)

    return titles.length === 0 ? '' : ` In der Ablage zu ${repo}: ${titles.join(' · ')} (mcp__buero__ablegen aktion=zeigen repo=${repo}).`
  } catch {
    return ''
  }
}

/** Closes a command on the page and, for a Sofort command, in its comment thread; resolves why not. */
async function closeKommando($: $, ctx: DienstCtx, id: string, state: KommandoState, result: string, now: number): Promise<string | undefined> {
  const doc = await dbGet($, 'kommandos', id)
  const kommando = kommandoOf(doc?.data)
  if (doc === undefined || kommando === undefined) {
    return `Kein Kommando ${id}.`
  }
  const outcome = await dbWrite($, 'update', 'kommandos', id, { state, result: clip(result, 1000), updatedAt: now, by: ctx.cloudSelf() }, doc.version)
  if (!outcome.isDone) {
    return `Nicht gespeichert: ${outcome.reason}`
  }
  if (state !== 'in_arbeit') {
    openKommandos.delete(id)
    ctx.note('kommando', `Kommando ${state}: ${clip(kommando.text, 60)}${result === '' ? '' : ` → ${clip(result, 100)}`}`)
    if (kommando.kommentar !== undefined) {
      await answerThread($, kommando.kommentar, result, state !== 'braucht_dich')
    }
    if (state === 'braucht_dich') {
      await push($, `kommando:${id}`, `Der Chef vom Dienst braucht dich: ${clip(result, 140)}`, now)
    }
  }

  return undefined
}

async function answerThread($: $, thread: string, text: string, isResolved: boolean): Promise<void> {
  try {
    await $.tool.call({ tool: 'ArtifactComments', action: 'reply', url: OFFICE_URL, thread_id: thread, text: clip(text, 2000) } as never)
    if (isResolved) {
      await $.tool.call({ tool: 'ArtifactComments', action: 'resolve', url: OFFICE_URL, thread_id: thread } as never)
    }
  } catch (error) {
    $.ui.log(`buero: kommentar: ${String(error)}`, { to: 'debug' })
  }
}

/** A command named in a prompt (a Sofort comment) is taken before the round would hand it over again. */
export async function claimKommando($: $, ctx: DienstCtx, id: string, now: number): Promise<void> {
  const doc = await dbGet($, 'kommandos', id)
  const kommando = kommandoOf(doc?.data)
  if (doc === undefined || kommando === undefined || kommando.state !== 'neu') {
    return
  }
  const outcome = await dbWrite($, 'update', 'kommandos', id, { state: 'angenommen', updatedAt: now, by: ctx.cloudSelf() }, doc.version)
  if (outcome.isDone) {
    openKommandos.set(id, now)
  }
}

/** Hands text to the Chef vom Dienst's model: into the running turn, or as a prompt of its own. */
async function handToModel($: $, ctx: DienstCtx, text: string): Promise<void> {
  if (ctx.isBusy()) {
    ctx.arrive(text)
  } else {
    await $.prompt.submit({ text })
  }
}

async function runAktion($: $, kommando: Kommando): Promise<{ state: KommandoState; result: string }> {
  const aktion = kommando.aktion
  if (aktion === undefined) {
    return { state: 'abgelehnt', result: 'keine Aktion' }
  }
  const call = async (tool: string, args: Record<string, unknown>) => {
    const answer = await $.mcp.call(CLOUD_SERVER, tool, args)
    const text = await unsaved($, textOf(answer))

    return answer.isError ? clip(text, 200) || 'unbekannter Fehler' : undefined
  }
  let error: string | undefined
  let done = ''
  switch (aktion.typ) {
    case 'pausieren':
      error = await call('interrupt_session', { session_id: aktion.session })
      done = 'pausiert: der laufende Schritt wird unterbrochen'
      break
    case 'weiter':
      error = await call('send_message', { session_id: aktion.session, message: `[Büro] Nachricht vom Nutzer, geschrieben im Büro-Fenster:\n${aktion.text ?? 'Mach weiter mit deinem Auftrag.'}`, priority: 'next' })
      done = 'weiter: die Session hat die Nachricht'
      break
    case 'archivieren':
      error = await call('archive_session', { session_id: aktion.session })
      done = 'archiviert'
      break
    case 'nachricht':
      error = await call('send_message', { session_id: aktion.session, message: `[Büro] Dringende Nachricht vom Nutzer, sofort lesen:\n${aktion.text ?? ''}`, priority: 'now' })
      done = 'sofort zugestellt'
      break
  }

  return error === undefined ? { state: 'erledigt', result: done } : { state: 'abgelehnt', result: `nicht ausgeführt: ${error}` }
}

/** New commands from the page: structured ones the mod carries out, the rest goes to the model. */
async function readKommandos($: $, ctx: DienstCtx, now: number): Promise<void> {
  const docs = (await dbQuery($, 'kommandos', { where: [['state', '==', 'neu']], limit: 20 }))
    .sort((a, b) => Number(a.data.createdAt) - Number(b.data.createdAt))
    .slice(0, KOMMANDOS_PER_TICK)
  // a command taken earlier that never reached a turn (a container restart, a dropped prompt) goes to the model once more
  const stale = (await dbQuery($, 'kommandos', { where: [['state', '==', 'angenommen']], limit: 20 })).filter(doc => {
    const at = Number(doc.data.updatedAt ?? doc.data.createdAt)

    return Number.isFinite(at) && now - at > STALE_KOMMANDO_MS && !openKommandos.has(doc.id) && alertOnce(`stale:${doc.id}`, now)
  })
  for (const doc of stale) {
    const kommando = kommandoOf(doc.data)
    if (kommando === undefined) {
      continue
    }
    const bumped = await dbWrite($, 'update', 'kommandos', doc.id, { updatedAt: now, by: ctx.cloudSelf() }, doc.version)
    if (bumped.isDone) {
      openKommandos.set(doc.id, now)
      await handToModel($, ctx, kommandoPrompt(doc.id, kommando))
    }
  }
  for (const doc of docs) {
    const kommando = kommandoOf(doc.data)
    if (kommando === undefined) {
      continue
    }
    const claimed = await dbWrite($, 'update', 'kommandos', doc.id, { state: kommando.aktion === undefined ? 'angenommen' : 'in_arbeit', updatedAt: now, by: ctx.cloudSelf() }, doc.version)
    if (!claimed.isDone) {
      continue
    }
    if (kommando.aktion !== undefined) {
      const ran = await runAktion($, kommando)
      await closeKommando($, ctx, doc.id, ran.state, ran.result, now)
      continue
    }
    openKommandos.set(doc.id, now)
    await handToModel($, ctx, kommandoPrompt(doc.id, kommando))
  }
}

/** Commands the model did not close itself are closed with what it answered. */
export async function closeOpenKommandos($: $, ctx: DienstCtx, answer: string): Promise<void> {
  if (openKommandos.size === 0) {
    return
  }
  const now = await $.clock.now()
  for (const id of [...openKommandos.keys()]) {
    const doc = await dbGet($, 'kommandos', id)
    const kommando = kommandoOf(doc?.data)
    if (kommando === undefined || (kommando.state !== 'angenommen' && kommando.state !== 'in_arbeit')) {
      openKommandos.delete(id)
      continue
    }
    await closeKommando($, ctx, id, 'erledigt', clip(answer, 400) || 'erledigt', now)
  }
}

function alertOnce(key: string, now: number): boolean {
  const last = alerted.get(key)
  if (last !== undefined && now - last < ALERT_AGAIN_MS) {
    return false
  }
  alerted.set(key, now)

  return true
}

/** Stuck or failed sessions, orders not accepted, orders ready for review: the Chef vom Dienst hears of each once. */
async function stoerungen($: $, ctx: DienstCtx, now: number): Promise<void> {
  const records = ctx.records()
  const lines: string[] = []
  for (const record of records) {
    if (sameSession(record.id, ctx.cloudSelf()) || !isActive(record, now)) {
      continue
    }
    const mood = moodOf(record, now, ctx.stuckMs())
    const auftrag = record.auftrag === undefined ? '' : ` (Auftrag ${record.auftrag})`
    if (mood === 'haengt' && alertOnce(`haengt:${record.id}`, now)) {
      lines.push(`${record.name} (Session-ID ${record.id})${auftrag} hängt: arbeitet seit ${Math.round((now - record.lastActivity) / 60_000)} Min. ohne Aktivität. Frag nach dem Stand (mcp__buero__nachricht, dringend: send_message priority now).`)
    }
    if (record.status === 'fehler' && alertOnce(`fehler:${record.id}`, now)) {
      lines.push(`${record.name} (Session-ID ${record.id})${auftrag} ist fehlgeschlagen. Lies den Fehler (list_events kinds assistant,result), schick einmal "weiter" (send_message), sonst hol eine Fortsetzung (mcp__buero__kollegen_holen).`)
    }
    if (record.status === 'frage' && alertOnce(`frage:${record.id}`, now)) {
      await push($, `frage:${record.id}`, `${record.name} wartet auf dich: ${clip(record.question ?? record.task, 120)}`, now)
    }
  }
  const open = await openAuftraege($)
  for (const auftrag of nichtAngenommen(open, now, ANNAHME_MS)) {
    if (alertOnce(`annahme:${auftrag.id}`, now)) {
      lines.push(`Auftrag ${auftrag.id} (${auftrag.titel}) ist seit ${Math.round((now - auftrag.updatedAt) / 60_000)} Min. vergeben, aber nicht angenommen (Besitzer ${auftrag.owner ?? '–'}). Prüf die Session, vergib neu (mcp__buero__kollegen_holen) oder frag den Chef.`)
    }
  }
  for (const auftrag of open.filter(one => one.state === 'review' || one.state === 'blockiert')) {
    if (alertOnce(`${auftrag.state}:${auftrag.id}:${auftrag.updatedAt}`, now)) {
      const regeln = await loadRegeln($, auftrag.repo, now)
      lines.push(
        auftrag.state === 'review'
          ? `Auftrag ${auftrag.id} (${auftrag.titel}) ist bereit zum Review${auftrag.pr === undefined ? '' : `: ${auftrag.pr}`} in ${auftrag.repo}. Regel: ${regeln.autoMerge === 'nie' ? 'nicht automatisch mergen, dem Chef melden' : regeln.autoMerge === 'gruen' ? 'bei grüner CI mergen (pull_request_read get_check_runs, dann merge_pull_request), danach aktion=abschliessen' : 'Prüfer holen, bei grüner CI und gutem Befund mergen'}.`
          : `Auftrag ${auftrag.id} (${auftrag.titel}) ist blockiert: ${auftrag.grund ?? ''}. Entscheide oder frag den Chef (mcp__buero__kommando aktion=braucht_dich, wenn ein Kommando offen ist, sonst eine kurze Meldung).`,
      )
      if (auftrag.state === 'review') {
        await push($, `review:${auftrag.id}`, `Auftrag ${auftrag.id} bereit: ${auftrag.pr ?? 'PR offen'} (${auftrag.titel})`, now)
      }
    }
  }
  if (lines.length > 0) {
    await handToModel($, ctx, `[Büro] Störungen und Meldungen vom Rundgang (Information der Büro-Mod):\n${lines.map(line => `- ${line}`).join('\n')}\nHandle, was deine Dienstanweisung vorsieht; melde dem Chef nur, was seine Entscheidung braucht.`)
  }
}

/** The readiness watchdog: without the background pause the session would fall asleep. */
async function waechter($: $, ctx: DienstCtx): Promise<void> {
  if (ctx.isBusy()) {
    return
  }
  try {
    const ran = await $.process.run(['pgrep', '-f', '^sleep 7100'])
    if (ran.exitCode === 0 && ran.stdout.trim() !== '') {
      return
    }
  } catch {
    return
  }
  await $.prompt.submit({
    text:
      '[Büro] Bereitschaft: Der Wachhalter läuft nicht mehr. Starte ihn neu: Bash mit run_in_background=true und timeout=7200000: `sleep 7100; echo "Bereitschaft abgelaufen"`. Antworte danach mit einer Zeile.',
  })
}

/** The Chef vom Dienst's round, called from the session's tick. */
export async function dienstTick($: $, ctx: DienstCtx, now: number): Promise<void> {
  if (ctx.rolle() !== 'cvd') {
    return
  }
  if (!isWatched) {
    isWatched = true
    try {
      await $.tool.call({ tool: 'ArtifactComments', action: 'watch', url: OFFICE_URL } as never)
    } catch (error) {
      $.ui.log(`buero: watch: ${String(error)}`, { to: 'debug' })
    }
  }
  await readKommandos($, ctx, now)
  if (now - stoerungAt > STOERUNG_EVERY_MS) {
    stoerungAt = now
    await stoerungen($, ctx, now)
  }
  if (now - waechterAt > WAECHTER_EVERY_MS) {
    waechterAt = now
    await waechter($, ctx)
  }
}

/** Whether a merge from an order's session is allowed by its repository's rules; undefined leaves the decision to the engine. */
export async function mergeVerdict($: $, ctx: DienstCtx, input: Record<string, unknown>, now: number): Promise<string | undefined> {
  if (ctx.rolle() === 'cvd' || ctx.auftragTag() === undefined) {
    return undefined
  }
  const owner = typeof input.owner === 'string' ? input.owner : ''
  const repo = typeof input.repo === 'string' ? input.repo : ''
  if (owner === '' || repo === '') {
    return undefined
  }
  const regeln = await loadRegeln($, `${owner}/${repo}`, now)

  return regeln.autoMerge === 'nie'
    ? `Die Regel für ${owner}/${repo} erlaubt keinen Merge aus einer Auftrags-Session. Melde dem Chef vom Dienst, dass der PR bereit ist (mcp__buero__auftrag aktion=review).`
    : undefined
}

/** Old commands, finished orders, meetings and shelf entries go. */
export async function pruneDienst($: $, now: number): Promise<void> {
  const rounds: [string, Record<string, unknown>][] = [
    ['kommandos', { where: [['createdAt', '<', now - 7 * DAY_MS]], limit: 50 }],
    ['auftraege', { where: [['state', 'in', ['fertig', 'abgebrochen']], ['updatedAt', '<', now - 7 * DAY_MS]], limit: 50 }],
    ['besprechungen', { where: [['createdAt', '<', now - 30 * DAY_MS]], limit: 50 }],
    ['ablage', { where: [['art', 'in', ['notiz', 'link']], ['at', '<', now - 30 * DAY_MS]], limit: 50 }],
  ]
  for (const [collection, query] of rounds) {
    for (const doc of await dbQuery($, collection, query)) {
      await dbWrite($, 'delete', collection, doc.id, undefined, doc.version)
    }
  }
}
