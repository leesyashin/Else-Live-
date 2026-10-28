// One skill or plugin command the person can run in this session.
export type SkillRow = {
  name: string
  description: string
  source: string
  plugin?: string
  // Tokens its listing takes in Claude's context; 0 when it is not listed.
  tokens: number
  // True when Claude's skill listing carries it, so Claude can pick it alone.
  isListed: boolean
}

// What the header says about the skill listing as a whole.
export type SkillSummary = {
  total: number
  included: number
  loadedAt: number
}

// One moment a skill's prompt was expanded for the model.
export type SkillUse = { id: string; skill: string; at: number }

export type SkillFile = {
  path: string
  label: string
  kind: 'markdown' | 'code' | 'svg' | 'image' | 'other'
}

// The info card's content for the selected skill.
export type SkillDetail = {
  skill: string
  path?: string
  body?: string
  files: SkillFile[]
  isLoading: boolean
  openPath?: string
  openText?: string
}

// One line of the setup check: is what this repo needs here?
export type SetupCheck = {
  group: 'Memory' | 'Connectors' | 'Skills' | 'Branch'
  name: string
  state: 'ok' | 'warn' | 'fail'
  detail: string
}

// The setup check for the session's repo, as the band, the pane and the
// phone's Cockpit page show it.
export type SetupReport = {
  repo: string | null
  branch: string | null
  memory: string | null
  checks: SetupCheck[]
  at: number
}

export type SessionState = 'working' | 'blocked' | 'review' | 'failed' | 'done' | 'idle'

// One of the account's current cloud sessions, as the Sessions list shows it.
export type SessionRow = {
  id: string
  title: string
  // owner/repo, or null when the session has none.
  repo: string | null
  state: SessionState
  note: string | null
  updatedAt: number
  url: string
  isSelf: boolean
}

export type SessionList = {
  rows: SessionRow[]
  at: number
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    cockpit: {
      skills: Shaped<SkillRow[]>
      summary: Shaped<SkillSummary | null>
      uses: Shaped<SkillUse[]>
      favorites: Shaped<string[]>
      paths: Shaped<Record<string, string>>
      detail: Shaped<SkillDetail | null>
      folded: Shaped<string[]>
      selected: string | null
      showBody: boolean
      query: string
      tick: number
      setup: Shaped<SetupReport | null>
      sessions: Shaped<SessionList | null>
    }
  }
}
