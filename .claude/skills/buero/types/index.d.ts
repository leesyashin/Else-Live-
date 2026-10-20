// The office's shared data: what every session writes about itself, what the
// pane and the page draw from, and the documents of the office page's
// database (orders, commands, meetings, the shelf, the rules).

/** What a session reports about itself. */
export type Status = 'neu' | 'arbeitet' | 'fertig' | 'frage' | 'freigabe' | 'fehler'

/** What the office shows: the reported status, or what the reader concludes. */
export type Mood = Status | 'haengt' | 'weg' | 'bereit'

/** A session's role in the office, from its cloud tags (`buero:rolle=cvd`). */
export type Rolle = 'cvd' | 'mitarbeiter' | 'pruefer'

export type AgentRecord = {
  id: string
  type: string
  description: string
  status: string
}

export type SentRecord = {
  at: number
  /** The recipient as addressed (a session id, a name). */
  to: string
  /** The recipient's session id, when it is known. */
  toId?: string
  text: string
  /** Sent by the model to another session: counts toward the hourly limit. */
  counts: boolean
  /** Sent by the person from the office pane. */
  fromBoss?: boolean
  /** The letter in the office page's database that tells whether it was read (cloud only). */
  letter?: string
}

/** A session's own status line, set with the `stand` tool. */
export type Stand = {
  text: string
  at: number
  /** `3/5`, `60 %`, or free text. */
  fortschritt?: string
}

/** One session's file: `<config dir>/buero/sessions/<id>.json`. */
export type SessionRecord = {
  v: 1
  id: string
  name: string
  project: string
  cwd: string
  task: string
  status: Status
  activity: string
  question?: string
  startedAt: number
  statusSince: number
  lastActivity: number
  heartbeat: number
  ended?: boolean
  agents: AgentRecord[]
  sent: SentRecord[]
  receivedAt?: number
  receivedText?: string
  /** Where the person opens the session (a cloud session's page). */
  link?: string
  /** Context and cost, as the cloud reports them. */
  usage?: string
  /** A finished cloud session's pull request that still waits for its merge (`PR #12`). */
  pr?: string
  rolle?: Rolle
  /** The session that started this one (`session_…`): its team in the office. */
  eltern?: string
  /** The version of the office mod the session runs. */
  modVersion?: string
  stand?: Stand
  /** Context used, in percent. */
  kontext?: number
  /** Cost so far, in dollars. */
  kosten?: number
  /** The order the session works on (`a12`), from its tag. */
  auftrag?: string
  tags?: string[]
  model?: string
}

export type WorkerView = {
  id: string
  name: string
  project: string
  cwd: string
  mood: Mood
  task: string
  activity: string
  question?: string
  minutesInMood: number
  minutesIdle: number
  agents: AgentRecord[]
  shirt: string
  hair: string
  skin: string
  hasMail: boolean
  mailText?: string
  isSelf: boolean
  link?: string
  usage?: string
  pr?: string
  rolle?: Rolle
  eltern?: string
  modVersion?: string
  /** Runs an older mod than the office knows. */
  isVeraltet: boolean
  stand?: string
  auftrag?: string
  kontext?: number
  kosten?: number
}

export type MessageView = {
  /** A worker's id, or `chef` for the office pane. */
  fromId: string
  toId?: string
  text: string
}

export type OfficeView = {
  workers: WorkerView[]
  messages: MessageView[]
  /** Local time as minutes past midnight, for the wall clock. */
  clockMinutes: number
}

/** What happened in the office: a line of the logbook. */
export type EventKind =
  | 'neu'
  | 'arbeitet'
  | 'frage'
  | 'fertig'
  | 'fehler'
  | 'pr'
  | 'gemergt'
  | 'archiviert'
  | 'push'
  | 'nachricht'
  | 'auftrag'
  | 'uebergabe'
  | 'besprechung'
  | 'ablage'
  | 'kommando'
  | 'regel'
  | 'stoerung'

/** One logbook entry, kept in the office page's database for a week. */
export type OfficeEvent = {
  at: number
  /** The session it is about (`session_…`). */
  sid: string
  /** The session's title then, for once it has left the office. */
  title: string
  /** `owner/repo`, or the repository's name; `ohne Repo` without one. */
  repo: string
  kind: EventKind
  text: string
}

export type PostState = 'neu' | 'unterwegs' | 'zugestellt' | 'fehler' | 'unklar'

/** A message the person wrote on the office page, waiting for a session to carry it. */
export type Post = {
  /** The recipient (`session_…`). */
  to: string
  text: string
  createdAt: number
  state: PostState
  /** Who took it to deliver: a session (`cse_…`), or `seite` for the page itself. */
  by?: string
  /** `selbst` when the recipient fetched it, `bote` when another session carried it. */
  via?: 'selbst' | 'bote' | 'seite'
  claimedAt?: number
  deliveredAt?: number
  error?: string
  /** The recipient's answer, written with the `antwort` tool. */
  reply?: string
  repliedAt?: number
}

/**
 * A colleague's message, kept beside the cloud's own delivery: the cloud hands
 * a busy session its messages only once its turn ends, the recipient's mod
 * fetches them from here into the running turn, and the sender sees it was read.
 */
export type Letter = {
  /** The recipient (`session_…`). */
  to: string
  /** The sender (`session_…`). */
  from: string
  /** The message as the recipient reads it, its letter id in the first line. */
  text: string
  createdAt: number
  state: 'neu' | 'gelesen'
  readAt?: number
}

/** The messenger's lease: one session at a time keeps the office up to date. */
export type Lease = {
  /** The session holding it (`cse_…`). */
  holder: string
  until: number
  /** Per session (id tail): what the logbook last said about it. */
  seen: Record<string, string>
  /** The Chef vom Dienst (`cse_…`): it takes the lease whenever it is awake. */
  pinned?: string
  /** When the Chef vom Dienst was last heard from. */
  cvdHeartbeat?: number
  /** The mod version of the holder: the newest the office knows. */
  modVersion?: string
}

// Orders: the work of the office as documents, not as prompts.

export type AuftragState = 'entwurf' | 'offen' | 'vergeben' | 'in_arbeit' | 'review' | 'blockiert' | 'fertig' | 'abgebrochen'

export type Verlauf = {
  at: number
  /** Who did it: a session id, `chef` for the person, `cvd`. */
  von: string
  was: string
}

/** What a session leaves behind when it hands an order over. */
export type Uebergabe = {
  at: number
  von: string
  stand: string
  branch?: string
  offen: string
  fallen?: string
  naechster: string
}

export type Auftrag = {
  /** `a12`: the document id. */
  id: string
  nr: number
  titel: string
  /** Markdown: Ziel, Kontext, Umsetzung. */
  text: string
  /** `owner/repo`. */
  repo: string
  branch?: string
  state: AuftragState
  /** The session working on it (`session_…`). */
  owner?: string
  createdBy: string
  createdAt: number
  updatedAt: number
  /** A parent order (`a3`). */
  eltern?: string
  /** `PR #12` once there is one. */
  pr?: string
  abnahme: string[]
  prio: 'hoch' | 'normal'
  faellig?: number
  verlauf: Verlauf[]
  uebergabe?: Uebergabe
  /** Why it is blocked or cancelled. */
  grund?: string
  model?: string
}

export type KommandoState = 'neu' | 'angenommen' | 'in_arbeit' | 'erledigt' | 'abgelehnt' | 'braucht_dich'

/** A structured command the mod carries out itself, without the model. */
export type KommandoAktion = {
  typ: 'pausieren' | 'weiter' | 'archivieren' | 'nachricht'
  /** The session it is about (`session_…`). */
  session: string
  text?: string
}

/** What the person tells the Chef vom Dienst from the office page. */
export type Kommando = {
  text: string
  createdAt: number
  state: KommandoState
  /** `chef` from the page, or a session id. */
  von: string
  result?: string
  auftraege?: string[]
  /** The comment thread of a Sofort command, to answer there too. */
  kommentar?: string
  aktion?: KommandoAktion
  updatedAt?: number
  /** The session that took it (`cse_…`). */
  by?: string
}

export type BesprechungState = 'offen' | 'zusammengefasst' | 'entschieden'

export type Besprechung = {
  thema: string
  frage: string
  /** Who summarizes: a session id, or `cvd`. */
  moderator: string
  /** Session ids. */
  teilnehmer: string[]
  state: BesprechungState
  createdAt: number
  bis: number
  zusammenfassung?: string
  entscheidung?: string
  von: string
}

export type Beitrag = {
  von: string
  name?: string
  at: number
  these: string
  empfehlung: string
  risiko?: string
  text?: string
}

export type AblageArt = 'notiz' | 'link' | 'datei'

export type Ablage = {
  art: AblageArt
  titel: string
  text?: string
  url?: string
  /** An id in the office page's asset store. */
  asset?: string
  repo?: string
  tags: string[]
  von: string
  at: number
}

export type AutoMerge = 'nie' | 'gruen' | 'gruen_pruefer'

/** What a repository allows without asking: `regeln/<repo>`. */
export type Regeln = {
  repo: string
  autoMerge: AutoMerge
  modelle: { cvd?: string; mitarbeiter?: string; pruefer?: string }
  /** `claude/auftrag-{nr}-{name}` */
  branchSchema: string
  pruefbefehle: string[]
  archivierenNachMerge: boolean
  maxParallel: number
  /** Things the person allowed in words, kept as text. */
  freigaben: string[]
  updatedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    buero: {
      office: OfficeView | null
      selected: string | null
      notice: string | null
    }
  }
}
