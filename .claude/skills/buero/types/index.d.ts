// The office's shared data: what every session writes about itself, and what
// the pane draws from.

/** What a session reports about itself. */
export type Status = 'neu' | 'arbeitet' | 'fertig' | 'frage' | 'freigabe' | 'fehler'

/** What the office shows: the reported status, or what the reader concludes. */
export type Mood = Status | 'haengt' | 'weg'

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
