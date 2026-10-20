// Meetings and the shelf: thinking together across sessions, and the
// notes, links and files they share. Pure, like auftraege.ts.

import type { Ablage, AblageArt, Beitrag, Besprechung, BesprechungState } from '../types'
import { ago, clip } from './model'

export const BESPRECHUNG_LABEL: Record<BesprechungState, string> = {
  offen: 'offen',
  zusammengefasst: 'zusammengefasst',
  entschieden: 'entschieden',
}

/** A meeting's default deadline. */
export const FRIST_MS = 15 * 60_000

export function besprechungOf(data: Record<string, unknown> | undefined): Besprechung | undefined {
  if (
    data === undefined ||
    typeof data.thema !== 'string' ||
    typeof data.frage !== 'string' ||
    typeof data.createdAt !== 'number' ||
    typeof data.state !== 'string' ||
    !(data.state in BESPRECHUNG_LABEL)
  ) {
    return undefined
  }

  return {
    thema: data.thema,
    frage: data.frage,
    moderator: typeof data.moderator === 'string' ? data.moderator : 'cvd',
    teilnehmer: Array.isArray(data.teilnehmer) ? data.teilnehmer.filter((one): one is string => typeof one === 'string') : [],
    state: data.state as BesprechungState,
    createdAt: data.createdAt,
    bis: typeof data.bis === 'number' ? data.bis : data.createdAt + FRIST_MS,
    zusammenfassung: typeof data.zusammenfassung === 'string' ? data.zusammenfassung : undefined,
    entscheidung: typeof data.entscheidung === 'string' ? data.entscheidung : undefined,
    von: typeof data.von === 'string' ? data.von : 'chef',
  }
}

export function beitragOf(data: Record<string, unknown> | undefined): Beitrag | undefined {
  if (data === undefined || typeof data.von !== 'string' || typeof data.at !== 'number' || typeof data.these !== 'string') {
    return undefined
  }

  return {
    von: data.von,
    name: typeof data.name === 'string' ? data.name : undefined,
    at: data.at,
    these: data.these,
    empfehlung: typeof data.empfehlung === 'string' ? data.empfehlung : '',
    risiko: typeof data.risiko === 'string' ? data.risiko : undefined,
    text: typeof data.text === 'string' ? data.text : undefined,
  }
}

export function neueBesprechung(input: {
  thema: string
  frage: string
  von: string
  teilnehmer: readonly string[]
  now: number
  moderator?: string
  fristMinuten?: number
}): Besprechung | { error: string } {
  const thema = input.thema.trim()
  const frage = input.frage.trim()
  if (thema === '') {
    return { error: 'Eine Besprechung braucht ein Thema.' }
  }
  if (frage === '' || !/[?]/.test(frage)) {
    return { error: 'Eine Besprechung braucht eine klare Frage (mit Fragezeichen).' }
  }
  if (input.teilnehmer.length === 0) {
    return { error: 'Eine Besprechung braucht Teilnehmer: Session-IDs oder Namen.' }
  }
  const minutes = input.fristMinuten !== undefined && input.fristMinuten > 0 ? Math.min(input.fristMinuten, 24 * 60) : 15

  return {
    thema: clip(thema, 120),
    frage: frage.slice(0, 2000),
    moderator: input.moderator ?? 'cvd',
    teilnehmer: [...new Set(input.teilnehmer)],
    state: 'offen',
    createdAt: input.now,
    bis: input.now + minutes * 60_000,
    von: input.von,
  }
}

/** How the invitation reads at a participant's session. */
export function einladungText(id: string, b: Besprechung, now: number): string {
  const minutes = Math.max(1, Math.round((b.bis - now) / 60_000))

  return (
    `[Büro] Besprechung ${id}: ${b.thema}\nFrage: ${b.frage}\n` +
    `Antworte in ${minutes} Min. mit mcp__buero__besprechung aktion=beitragen id=${id} these=<deine Antwort in einem Satz> empfehlung=<was du tun würdest> risiko=<was schiefgehen kann>. ` +
    'Kurz; du musst dafür deinen Auftrag nicht unterbrechen, wenn du gerade mitten in einem Schritt bist.'
  )
}


/** A meeting in full: question, contributions, summary, decision. */
export function besprechungText(id: string, b: Besprechung, beitraege: readonly Beitrag[], now: number, names: ReadonlyMap<string, string> = new Map()): string {
  const who = (one: Beitrag) => one.name ?? names.get(one.von) ?? one.von
  const lines = [
    `Besprechung ${id}: ${b.thema} (${BESPRECHUNG_LABEL[b.state]}, Frist ${b.bis > now ? `in ${Math.round((b.bis - now) / 60_000)} Min.` : 'abgelaufen'})`,
    `Frage: ${b.frage}`,
    `Teilnehmer: ${b.teilnehmer.map(one => names.get(one) ?? one).join(', ')} · Moderator: ${names.get(b.moderator) ?? b.moderator}`,
  ]
  if (beitraege.length === 0) {
    lines.push('Noch keine Beiträge.')
  }
  for (const one of [...beitraege].sort((a, c) => a.at - c.at)) {
    lines.push(
      '',
      `${who(one)} ${ago(one.at, now)}:`,
      `- These: ${one.these}`,
      `- Empfehlung: ${one.empfehlung || '–'}`,
      ...(one.risiko === undefined ? [] : [`- Risiko: ${one.risiko}`]),
      ...(one.text === undefined ? [] : [`- ${one.text}`]),
    )
  }
  if (b.zusammenfassung !== undefined) {
    lines.push('', `Zusammenfassung: ${b.zusammenfassung}`)
  }
  if (b.entscheidung !== undefined) {
    lines.push('', `Entscheidung: ${b.entscheidung}`)
  }

  return lines.join('\n')
}

export function besprechungenText(list: readonly { id: string; b: Besprechung }[], now: number): string {
  if (list.length === 0) {
    return 'Keine Besprechungen.'
  }

  return (
    'Besprechungen:\n' +
    [...list]
      .sort((a, c) => c.b.createdAt - a.b.createdAt)
      .slice(0, 20)
      .map(({ id, b }) => `- ${id} (${BESPRECHUNG_LABEL[b.state]}) ${b.thema}: ${clip(b.frage, 100)} · ${ago(b.createdAt, now)}`)
      .join('\n')
  )
}

// The shelf.

export function ablageOf(data: Record<string, unknown> | undefined): Ablage | undefined {
  if (data === undefined || typeof data.titel !== 'string' || typeof data.at !== 'number') {
    return undefined
  }
  const art: AblageArt = data.art === 'link' || data.art === 'datei' ? data.art : 'notiz'

  return {
    art,
    titel: data.titel,
    text: typeof data.text === 'string' ? data.text : undefined,
    url: typeof data.url === 'string' ? data.url : undefined,
    asset: typeof data.asset === 'string' ? data.asset : undefined,
    repo: typeof data.repo === 'string' ? data.repo : undefined,
    tags: Array.isArray(data.tags) ? data.tags.filter((one): one is string => typeof one === 'string') : [],
    von: typeof data.von === 'string' ? data.von : '',
    at: data.at,
  }
}

export function neueAblage(input: {
  art?: string
  titel: string
  text?: string
  url?: string
  asset?: string
  repo?: string
  tags?: readonly string[]
  von: string
  now: number
}): Ablage | { error: string } {
  const titel = input.titel.trim()
  if (titel === '') {
    return { error: 'Ein Eintrag braucht einen Titel.' }
  }
  const art: AblageArt = input.art === 'link' ? 'link' : input.art === 'datei' ? 'datei' : 'notiz'
  if (art === 'notiz' && (input.text ?? '').trim() === '') {
    return { error: 'Eine Notiz braucht einen Text.' }
  }
  if (art === 'link' && !/^https?:\/\//.test(input.url ?? '')) {
    return { error: 'Ein Link braucht eine URL mit http(s).' }
  }
  if (art === 'datei' && (input.asset ?? '').trim() === '' && !/^https?:\/\//.test(input.url ?? '')) {
    return { error: 'Eine Datei braucht die Asset-ID oder URL aus dem Upload auf die Büro-Seite.' }
  }

  return {
    art,
    titel: clip(titel, 120),
    text: input.text === undefined ? undefined : input.text.slice(0, 20_000),
    url: input.url,
    asset: input.asset,
    repo: input.repo,
    tags: (input.tags ?? []).map(one => one.trim().toLowerCase()).filter(one => one !== '').slice(0, 10),
    von: input.von,
    at: input.now,
  }
}

/** The shelf as `ablegen zeigen` answers: newest first, titles and where. */
export function ablageText(list: readonly { id: string; a: Ablage }[], now: number, names: ReadonlyMap<string, string> = new Map()): string {
  if (list.length === 0) {
    return 'Die Ablage ist leer.'
  }
  const lines = [...list]
    .sort((a, c) => c.a.at - a.a.at)
    .slice(0, 30)
    .map(({ id, a }) => {
      const where = a.art === 'link' ? ` ${a.url ?? ''}` : a.art === 'datei' ? ` (Datei${a.url === undefined ? '' : ` ${a.url}`})` : ''
      const tags = a.tags.length === 0 ? '' : ` · ${a.tags.map(one => `#${one}`).join(' ')}`

      return `- ${id} [${a.art}] ${a.titel}${where}${a.repo === undefined ? '' : ` · ${a.repo}`}${tags} · ${names.get(a.von) ?? a.von} ${ago(a.at, now)}`
    })

  return `Ablage:\n${lines.join('\n')}\nEinen Eintrag im Wortlaut: mcp__buero__ablegen aktion=zeigen id=<id>.`
}

export function ablageEintragText(id: string, a: Ablage, now: number): string {
  return [
    `${id} [${a.art}] ${a.titel} · ${a.von} ${ago(a.at, now)}${a.repo === undefined ? '' : ` · ${a.repo}`}`,
    ...(a.url === undefined ? [] : [a.url]),
    ...(a.text === undefined ? [] : ['', a.text]),
  ].join('\n')
}
