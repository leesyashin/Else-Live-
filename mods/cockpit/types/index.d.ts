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
    }
  }
}
