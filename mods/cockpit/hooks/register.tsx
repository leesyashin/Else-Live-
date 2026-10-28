import type { ElementTable, EngineInterface, Register, RenderSurface } from 'claude-code'

import type { SkillFile, SkillRow, SkillUse } from '../types'
import { CATALOG, catalogFor } from './catalog'
import type { CatalogEntry } from './catalog'
import {
  CATALOG_PREFIX,
  CATEGORIES,
  ago,
  askToInstall,
  bandView,
  bumpTick,
  cardView,
  categorize,
  closeSkill,
  listView,
  loadFavorites,
  openFile,
  openSkill,
  prefixOf,
  recordUse,
  refresh,
  selectedSkill,
  setQuery,
  shortName,
  sourceLabel,
  startSkill,
  textFor,
  toggleBody,
  toggleFavorite,
  toggleFold,
} from './skills'

type $ = EngineInterface

const PANE = 'cockpit'
const TITLE = 'Cockpit'
// How long the band's dot pulses after a skill was loaded.
const RECENT_MS = 90_000
const TIMELINE_ROWS = 8

// A soft green dot with a ring that breathes out, as iOS marks something live.
const PULSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14">
<circle cx="7" cy="7" r="3" fill="#34C759"/>
<circle cx="7" cy="7" r="3" fill="none" stroke="#34C759" stroke-width="1.2">
<animate attributeName="r" values="3;6.5" dur="1.8s" repeatCount="indefinite" calcMode="spline" keySplines="0.2 0.8 0.2 1"/>
<animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" calcMode="spline" keySplines="0.2 0.8 0.2 1"/>
</circle>
</svg>`

// The context window's fill, colour-coded as the phone's Cockpit page does it.
function contextLook(share: number): { color: string; theme: 'success' | 'warning' | 'error' } {
  if (share < 0.5) return { color: '#30D158', theme: 'success' }
  if (share < 0.72) return { color: '#FFD60A', theme: 'warning' }
  return { color: '#FF453A', theme: 'error' }
}

function contextRing(share: number, color: string): string {
  const r = 7
  const len = 2 * Math.PI * r
  const off = (len * (1 - share)).toFixed(2)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="18" height="18">
<circle cx="9" cy="9" r="${r}" fill="none" stroke="rgba(142,142,147,.35)" stroke-width="3"/>
<circle cx="9" cy="9" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${len.toFixed(2)}" stroke-dashoffset="${off}" transform="rotate(-90 9 9)"/>
</svg>`
}

function clip(text: string, room: number): string {
  if (room <= 1) return ''

  return text.length > room ? `${text.slice(0, room - 1)}…` : text
}

// Opens the pane where a surface docks one; the phone places none, so there
// the cockpit is printed into the conversation as /cockpit's row instead.
async function openPane($: $): Promise<void> {
  const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })
  await refresh($)
  if (!isPlaced) await $.command.run({ command: 'cockpit' })
}

// The surface decides, not the table: an element a surface lacks may still be
// in it and draw nothing (the phone's text field).
function inputOf(ui: ElementTable, surface: RenderSurface) {
  return surface !== 'mobile' && 'Input' in ui ? ui.Input : undefined
}

function svgOf(ui: ElementTable, surface: RenderSurface) {
  return surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
}

function languageOf(path: string): string | undefined {
  return path.split('.').at(-1)?.toLowerCase()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cockpit',
      description: 'Öffnet das Cockpit: alle Skills mit Status, Infokarten und Zeitstrahl',
    })
    await loadFavorites($)
    // Relative times ("vor 3 Min") and the band's pulse move on once a minute.
    $.clock.every(60_000, () => void bumpTick($))
    $.clock.after(1500, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'cockpit' }, async ($, e) => {
    if (e.args.trim() === '') await $.ui.open({ id: PANE, title: TITLE })
    await refresh($)

    return { text: await textFor($, e.args) }
  })

  // On the phone the cockpit lives in /cockpit's own row: the same list and
  // cards as the pane, drawn inline. Elsewhere the pane shows them and the
  // row keeps its text.
  on('ui.render', { component: 'CommandOutput', props: { command: 'cockpit' } }, async ($, e, next) => {
    if (e.surface !== 'mobile' || e.props.isErrored || e.props.args.trim() !== '') return next(e)
    const ui = $.ui.resolve(e)
    const name = await selectedSkill($)
    const columns = e.viewport?.columns ?? 40

    return name ? drawCard($, ui, e.surface, name, columns) : drawList($, ui, e.surface, columns)
  })

  // A finished turn changed the context window: the band reads it again.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await bumpTick($).catch(() => undefined)

    return result
  })

  // Every way a skill reaches the model passes here: /name, the Skill tool, a
  // subagent's preload. That is the proof a skill was really used.
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    try {
      await recordUse($, e.skill, e.path)
      const text = `✦ Skill geladen: ${shortName(e.skill)}`
      $.ui.toast(text)
      // A client that draws no toast (the phone on a cloud session) still
      // shows the transcript: there the proof is a notice the model never reads.
      const surfaces = await $.session.surfaces()
      if (!surfaces.some(surface => surface !== 'mobile')) {
        await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } })
      }
    } catch {
      // Recording is a courtesy; the skill's prompt stands either way.
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const Svg = svgOf(ui, e.surface)
    const { rows, used, now } = await bandView($)
    const active = new Set(used.map(use => use.skill))
    const last = used.at(-1)
    const isRecent = last !== undefined && now - last.at < RECENT_MS
    const count = rows.length > 0 ? `${rows.length}` : ''
    const loaded = active.size > 0 ? ` · ${active.size} geladen` : ''
    const { context } = await $.session.usage().catch(() => ({ context: undefined }))
    const share = context
      ? Math.min(1, (context.percent ?? ((context.tokens ?? 0) / Math.max(1, context.window)) * 100) / 100)
      : undefined
    const look = share === undefined ? undefined : contextLook(share)

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {look && share !== undefined && Svg && (
          <Svg source={contextRing(share, look.color)} alt={`Kontext ${Math.round(share * 100)} Prozent belegt`} width={18} height={18} />
        )}
        {look && share !== undefined && (
          <Text color={look.theme}>{`${Svg ? '' : '◔ '}${Math.round(share * 100)} % Kontext`}</Text>
        )}
        {isRecent && Svg && <Svg source={PULSE} alt="Gerade wurde ein Skill geladen" width={14} height={14} isInteractive />}
        <Button key="cockpit-skills" plain onPress={() => openPane($)}>
          ✦ Skills <Text dimColor>{`${count}${loaded}`}</Text>
        </Button>
        {last && (
          <Text dimColor>
            {clip(`◉ ${shortName(last.skill)} · ${ago(now, last.at)}`, Math.max(0, e.props.bodyColumns - 24))}
          </Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const name = await selectedSkill($)
    const columns = e.props.bodyColumns

    return name ? drawCard($, ui, e.surface, name, columns) : drawList($, ui, e.surface, columns)
  })
}

async function drawList($: $, ui: ElementTable, surface: RenderSurface, columns: number) {
  const { Box, Button, Text } = ui
  const Input = inputOf(ui, surface)
  const { rows, used, favs, sum, needle, closed, now } = await listView($)
  const active = new Set(used.map(use => use.skill))
  const term = needle.trim().toLowerCase()
  const isSearching = term.length > 0
  const fits = (text: string) => text.toLowerCase().includes(term)
  const visible = rows.filter(row => !isSearching || fits(row.name) || fits(row.description))
  const installed = new Set(rows.map(row => catalogFor(row.name)?.id))
  const missing = CATALOG.filter(
    entry => !installed.has(entry.id) && (!isSearching || fits(entry.title) || fits(entry.summary)),
  )
  const favored = visible.filter(row => favs.includes(row.name))
  const unlisted = sum ? Math.max(0, sum.total - sum.included) : 0

  const skillLine = (row: SkillRow) => {
    const isActive = active.has(row.name)
    const isFavorite = favs.includes(row.name)
    const short = shortName(row.name)
    const room = columns - short.length - 7

    return (
      <Box flexDirection="row" justifyContent="space-between">
        <Button key={`s:${row.name}`} plain onPress={() => openSkill($, row.name)}>
          <Text color={isActive ? 'success' : row.isListed ? 'text' : 'inactive'}>{isActive ? '◉' : '●'}</Text>
          {` ${short} `}
          <Text dimColor>{clip(row.description, room)}</Text>
        </Button>
        <Button key={`f:${row.name}`} plain dimColor={!isFavorite} onPress={() => toggleFavorite($, row.name)}>
          {isFavorite ? '★' : '☆'}
        </Button>
      </Box>
    )
  }

  const catalogLine = (entry: CatalogEntry) => (
    <Button key={`c:${entry.id}`} plain onPress={() => openSkill($, `${CATALOG_PREFIX}${entry.id}`)}>
      <Text color="inactive">○</Text>
      {` ${entry.title} `}
      <Text dimColor>{clip(`empfohlen · ${entry.author}`, columns - entry.title.length - 4)}</Text>
    </Button>
  )

  const sections = CATEGORIES.map(category => {
    const members = visible.filter(row => !favs.includes(row.name) && categorize(row) === category)
    const extra = category === 'Design' ? missing : []
    if (members.length === 0 && extra.length === 0) return null
    const isClosed = !isSearching && closed.includes(category)

    return (
      <Box flexDirection="column">
        <Button
          key={`k:${category}`}
          plain
          onPress={() => toggleFold($, category)}
        >
          <Text weight="semibold">{`${isClosed ? '▸' : '▾'} ${category}`}</Text>
          <Text dimColor>{`  ${members.length + extra.length}`}</Text>
        </Button>
        {!isClosed && members.map(skillLine)}
        {!isClosed && extra.map(catalogLine)}
      </Box>
    )
  })

  const recent = used.slice(-TIMELINE_ROWS).reverse()

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text weight="semibold" size="heading">
          Skills
        </Text>
        <Button key="refresh" plain dimColor onPress={() => refresh($)}>
          ↻ Aktualisieren
        </Button>
      </Box>
      <Text dimColor>
        {`◉ ${active.size} geladen · ● ${rows.length} verfügbar · ○ ${missing.length} empfohlen`}
      </Text>
      {unlisted > 0 && (
        <Text color="warning">
          {`⚠ ${unlisted} Skills passen nicht in Claudes Liste. Claude wählt sie nicht von selbst, du kannst sie hier starten.`}
        </Text>
      )}
      {rows.length === 0 && <Text dimColor>Lese die Skills dieser Session …</Text>}
      {Input && (
        <Input
          key="q"
          placeholder="Skill suchen …"
          value={needle}
          submitLabel="suchen"
          onInput={value => setQuery($, value)}
          onSubmit={value => setQuery($, value)}
        />
      )}
      {favored.length > 0 && (
        <Box flexDirection="column">
          <Text weight="semibold">★ Favoriten</Text>
          {favored.map(skillLine)}
        </Box>
      )}
      {sections}
      <Box flexDirection="column">
        <Text weight="semibold">Zeitstrahl</Text>
        {recent.length === 0 && <Text dimColor>In dieser Session wurde noch kein Skill geladen.</Text>}
        {recent.map((use: SkillUse) => (
          <Text>
            <Text color="success">◉</Text>
            {` ${shortName(use.skill)} `}
            <Text dimColor>{ago(now, use.at)}</Text>
          </Text>
        ))}
      </Box>
    </Box>
  )
}

async function drawCard($: $, ui: ElementTable, surface: RenderSurface, name: string, columns: number) {
  const { Box, Button, Code, Link, Markdown, Text } = ui
  const Input = inputOf(ui, surface)
  const Svg = svgOf(ui, surface)
  const { rows, used, favs, card, isBodyOpen, now } = await cardView($)
  const isCatalog = name.startsWith(CATALOG_PREFIX)
  const entry = isCatalog
    ? CATALOG.find(one => `${CATALOG_PREFIX}${one.id}` === name)
    : catalogFor(name)
  const row = rows.find(one => one.name === name)
  const mine = used.filter(use => use.skill === name)
  const latest = mine.at(-1)
  const isFavorite = favs.includes(name)
  const title = isCatalog ? (entry?.title ?? name) : shortName(name)
  const prefix = isCatalog ? undefined : prefixOf(name)

  const status = isCatalog
    ? { dot: '○', color: 'inactive', text: 'Nicht installiert' }
    : latest
      ? {
          dot: '◉',
          color: 'success',
          text: `In dieser Session geladen · ${mine.length}× · zuletzt ${ago(now, latest.at)}`,
        }
      : row?.isListed
        ? { dot: '●', color: 'text', text: 'Verfügbar · Claude sieht ihn und kann ihn selbst wählen' }
        : { dot: '●', color: 'inactive', text: 'Startbar per Knopf · nicht in Claudes Liste' }

  const fileLine = (file: SkillFile) => {
    const isViewable = file.kind === 'markdown' || file.kind === 'code' || file.kind === 'svg'
    if (!isViewable) {
      return <Text dimColor>{`  ${file.label}${file.kind === 'image' ? '  (Bild)' : ''}`}</Text>
    }
    const isOpen = card?.openPath === file.path

    return (
      <Box flexDirection="column">
        <Button key={`r:${file.path}`} plain onPress={() => openFile($, file)}>
          {`${isOpen ? '▾' : '▸'} ${file.label}`}
        </Button>
        {isOpen && card?.openText !== undefined && file.kind === 'markdown' && (
          <Markdown text={card.openText} />
        )}
        {isOpen && card?.openText !== undefined && file.kind === 'svg' && Svg && (
          <Svg source={card.openText} alt={file.label} width={Math.min(320, columns * 8)} />
        )}
        {isOpen && card?.openText !== undefined && (file.kind === 'code' || (file.kind === 'svg' && !Svg)) && (
          <Code source={card.openText} language={languageOf(file.path)} wrap="wrap" />
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Button key="back" plain onPress={() => closeSkill($)}>
          ‹ Alle Skills
        </Button>
        {row && (
          <Button key="favorite" plain dimColor={!isFavorite} onPress={() => toggleFavorite($, name)}>
            {isFavorite ? '★ Favorit' : '☆ Favorit'}
          </Button>
        )}
      </Box>

      <Box flexDirection="column">
        <Text weight="semibold" size="title">
          {title}
        </Text>
        {prefix && <Text dimColor>{prefix}</Text>}
        {entry && <Text dimColor>{`von ${entry.author}`}</Text>}
      </Box>

      <Text>
        <Text color={status.color}>{status.dot}</Text>
        {` ${status.text}`}
      </Text>
      {row && (
        <Text dimColor>
          {`${sourceLabel(row)}${row.tokens > 0 ? ` · ~${row.tokens} Tokens in Claudes Kontext` : ''}`}
        </Text>
      )}
      {row?.description && <Text>{row.description}</Text>}

      {!isCatalog && Input && (
        <Input
          key="task"
          label="Aufgabe"
          placeholder="Was soll der Skill tun? (optional)"
          submitLabel="Starten"
          onSubmit={value => startSkill($, name, value)}
        />
      )}
      {!isCatalog && !Input && (
        <Button key="start" variant="primary" onPress={() => startSkill($, name, '')}>
          Starten
        </Button>
      )}
      {isCatalog && entry && (
        <Button key="install" variant="primary" onPress={() => askToInstall($, entry.id)}>
          Von Claude installieren lassen
        </Button>
      )}

      {entry && (
        <Box flexDirection="column">
          <Text weight="semibold">Was er tut</Text>
          <Text dimColor>{entry.summary}</Text>
          {entry.rules.map(rule => (
            <Text>{`•  ${rule}`}</Text>
          ))}
        </Box>
      )}
      {entry && (
        <Box flexDirection="column">
          <Text weight="semibold">Referenzen</Text>
          <Text dimColor>{entry.referenceNote}</Text>
          {entry.references.map(link => (
            <Link href={link.href} label={link.label} />
          ))}
          {entry.note && <Text color="warning">{entry.note}</Text>}
          <Text dimColor>{`Installation: ${entry.install}`}</Text>
        </Box>
      )}

      {!isCatalog && (
        <Box flexDirection="column">
          <Text weight="semibold">Dateien des Skills</Text>
          {card?.isLoading && <Text dimColor>Suche die Dateien …</Text>}
          {card && !card.isLoading && !card.path && (
            <Text dimColor>Keine Dateien auf diesem Rechner: eingebaut oder von einem Connector geliefert.</Text>
          )}
          {card?.body !== undefined && (
            <Button key="body" plain onPress={() => toggleBody($)}>
              {`${isBodyOpen ? '▾' : '▸'} SKILL.md · die Anleitung, die Claude liest`}
            </Button>
          )}
          {isBodyOpen && card?.body !== undefined && <Markdown text={card.body} />}
          {card?.files.map(fileLine)}
          {card?.path && <Text dimColor>{card.path}</Text>}
        </Box>
      )}
    </Box>
  )
}
