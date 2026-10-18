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

declare module 'claude-code' {
  interface PluginState {
    buero: {
      office: OfficeView | null
      selected: string | null
      notice: string | null
    }
  }
}
