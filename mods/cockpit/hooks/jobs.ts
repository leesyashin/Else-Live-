import type { EngineInterface } from 'claude-code'

import { artifactData } from './sync'

type $ = EngineInterface

// Every session that watches the Cockpit page is woken by an order from the
// phone. Only one may act: the one the order names (`Session: <id>`), or,
// with no name, the first to create the order's claim document.
const CLAIMS = 'cockpit/jobs/threads'
const ORDER = 'Cockpit · '

export type Order = { thread: string; text: string }
export type Verdict = { thread: string; kind: string; mine: 'mine' | 'theirs' | 'unknown'; why: string }

// The open orders in an ArtifactComments read: threads whose last comment
// sent to Claude still awaits a reply and starts with "Cockpit · ".
export function openOrders(text: string): Order[] {
  const nonce = text.match(/=== BEGIN ARTIFACT COMMENTS (\S+)/)?.[1]
  if (!nonce) return []
  const marker = `${nonce}| `
  const orders: Order[] = []
  for (const block of text.split(/^Thread (?=\S+\s*$)/m).slice(1)) {
    const thread = block.slice(0, block.indexOf('\n')).trim()
    const lines = block.split('\n')
    let at = -1
    lines.forEach((line, i) => {
      if (line.trimStart().startsWith('[') && line.includes('awaiting reply')) at = i
    })
    if (at < 0) continue
    const body: string[] = []
    for (const line of lines.slice(at + 1)) {
      const start = line.indexOf(marker)
      if (start < 0) break
      body.push(line.slice(start + marker.length))
    }
    if (body[0]?.startsWith(ORDER)) orders.push({ thread, text: body.join('\n') })
  }

  return orders
}

export function namedSession(text: string): string | undefined {
  return text.match(/^Session:\s*(\S+)\s*$/m)?.[1]
}

type Claim = { state: 'mine' | 'theirs' | 'unknown'; owner?: string }

async function claim($: $, url: string, order: Order, session: string): Promise<Claim> {
  const base = { url, collection: CLAIMS, doc_id: order.thread }
  // Without if_version a write only creates: the second session is refused.
  const created = await artifactData($, {
    ...base,
    action: 'set',
    data: { session, kind: order.text.split('\n')[0], at: await $.clock.now() },
  })
  if (created.deny) return { state: 'unknown' }
  if (!created.isError && /committed/i.test(created.text ?? '')) return { state: 'mine' }
  const read = await artifactData($, { ...base, action: 'get' })
  const owner = read.text?.match(/"session"\s*:\s*"([^"]+)"/)?.[1]
  if (!owner) return { state: 'unknown' }

  return { state: owner === session ? 'mine' : 'theirs', owner }
}

export async function judge($: $, url: string, order: Order): Promise<Verdict> {
  const session = await $.session.id()
  const kind = order.text.split('\n')[0]!.slice(ORDER.length).trim()
  const named = namedSession(order.text)
  const verdict = (mine: Verdict['mine'], why: string): Verdict => ({ thread: order.thread, kind, mine, why })
  if (named && named !== session) return verdict('theirs', `Der Auftrag nennt Session ${named}.`)
  const { state, owner } = await claim($, url, order, session)
  if (state === 'theirs') return verdict('theirs', `Session ${owner} hat ihn schon übernommen.`)
  if (state === 'unknown') return verdict('unknown', 'Die Mod konnte ihn nicht beanspruchen.')

  return verdict('mine', named ? 'Der Auftrag nennt diese Session.' : 'Diese Session hat ihn zuerst übernommen.')
}

// What the model reads after the comment read: who acts, and how an install goes.
export function verdictNote(verdicts: Verdict[]): string {
  const lines = verdicts.map(v => {
    const head = `- Thread ${v.thread} („${v.kind}“):`
    if (v.mine === 'mine') return `${head} gehört DIESER Session. ${v.why} Bearbeite ihn.`
    if (v.mine === 'theirs') return `${head} gehört NICHT dieser Session. ${v.why} Nichts tun: nicht antworten, nicht auflösen, nichts schreiben, nichts installieren. Auch dem Nutzer im Chat nichts erklären: Beende den Zug mit genau einer Zeile, ${SILENT}`
    return `${head} ${v.why} Erst selbst beanspruchen wie in den Cockpit-Regeln, dann bearbeiten.`
  })
  const install = verdicts.some(v => v.mine !== 'theirs' && v.kind === 'Skill installieren') ? `\n\n${INSTALL_RULE}` : ''

  return `Cockpit-Mod, Zuteilung der Aufträge vom Handy:\n${lines.join('\n')}${install}`
}

// What a session that is not meant says in its own chat: one line, nothing more.
export const SILENT = '„Cockpit: Auftrag für eine andere Session.“'

export const INSTALL_RULE = `„Cockpit · Skill installieren“ heißt global, nicht nur für diese Session:
<name> ist das erste Wort in Zeile 2 des Auftrags, dahinter steht die Quelle.
1. Den Skill-Ordner von GitHub holen (git clone --depth 1; npx ist hier gesperrt) und die SKILL.md lesen.
2. Im Repo leesyashin/Else-Live- ablegen: mods/cockpit/skills/<name>/ (SKILL.md, Referenzen, LICENSE.txt) und einen Link .claude/skills/<name> -> ../../mods/cockpit/skills/<name>. So kommt er mit der Mod in jedes Repo und in jede Session von Else-Live-.
3. Zusätzlich nach ~/.claude/skills/<name> kopieren, damit er sofort in dieser Session gilt.
4. Branch claude/skill-<name>, Commit, Push, PR als Entwurf. Der Nutzer merged über die Merge-Karte.
5. In cockpit/skills der Cockpit-Seite unter installed den Eintrag { id, name, title, author, at, pr } ergänzen (if_version). Damit verlässt der Skill „Empfohlen“ und steht unter Design.
6. Im Thread antworten (mit PR-Nummer) und ihn auflösen.`

// The rules every session with the mod reads, whatever repo it works in.
export const RULES = `# Cockpit-Aufträge vom Handy
Kommentare auf der Cockpit-Seite, die mit „Cockpit · “ beginnen, sind Aufträge. Alle Sessions, die die Seite beobachten, werden geweckt; nur eine handelt.
- Nach dem Lesen des Threads (ArtifactComments read) hängt die Cockpit-Mod eine Zuteilung an. Steht dort „gehört NICHT dieser Session“: nichts tun, auch nicht im Thread antworten.
- Ist der Auftrag nicht für diese Session, auch im eigenen Chat nichts erklären. Den Zug mit genau einer Zeile beenden: ${SILENT}
- Ohne Zuteilung (Mod nicht geladen): Steht \`Session: <ID>\` im Auftrag und passt nicht zu $CLAUDE_CODE_SESSION_ID, nichts tun. Sonst zuerst beanspruchen: ArtifactData set auf cockpit/jobs/threads/<Thread-ID> mit { session } und ohne if_version. Wird das abgelehnt, weil es das Dokument schon gibt, nichts tun.
${INSTALL_RULE}`
