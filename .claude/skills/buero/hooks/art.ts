// Draws the office as one pixel-art SVG. Pure: an OfficeView in, markup out.
// Figures are drawn in 2-unit pixels with a light, a base and a shade tone and
// a soft shadow beneath, so they read like little figurines seen from above.
// Furniture that repeats is drawn once in <defs> and placed with <use>.

import type { AgentRecord, Mood, OfficeView, WorkerView } from '../types'
import { MOOD_COLOR, clip, hash, moodLabel } from './model'

export const WIDTH = 600
const WALL_H = 44
const TOP_H = 228
const CELL_W = 150
const CELL_H = 138
const COLS = 4
const PX = 2
const MAX_DESKS = 24
const MAX_VISITORS = 5
/** The engine refuses an Svg source past 131072 characters. */
const SOURCE_LIMIT = 125_000
/** Where visitors come into the boss office: the gap in its glass wall. */
const DOOR = { x: 357, y: TOP_H }
const WALK_S = 1.6
const LOOP = 'repeatCount="indefinite"'

type Palette = Record<string, string>
type Point = { x: number; y: number }
/** What one drawing collects on the way: the shared pieces it placed. */
type Ctx = { isAnimated: boolean; need: Set<string> }

// Sprites, one letter per 2-unit pixel. Hair H/h/G, skin S/s, blush B, eyes E,
// mouth M, shirt T with light L and shade D, collar C, pants P/Q, shoes K/k.

const BACK_TYPING = [
  '......hhHHHG......',
  '.....hhHHHHHG.....',
  '....hhHHHHHHHG....',
  '....hHHHHHHHHG....',
  '...sHHHHHHHHHGs...',
  '...sHHHHHHHHHGs...',
  '....GHHHHHHHHG....',
  '.LT..GGHHHHGG..TD.',
  '.LTL..sSSSSs..DTD.',
  'LTTLLLTTTTTTTDDDTD',
  'LTTDTTTTTTTTTTTDTD',
  'LTTDTTTTTTTTDTTDTD',
  '.LTDTTTTTTTTDTTDD.',
  '..LLTTTTTTTTDTTD..',
  '..LTTTTTTTTTTTTD..',
  '..LTTTTTTTTTTTTD..',
]

const HAND = ['Ss', 'ss']

const BACK_IDLE = [
  '......hhHHHG......',
  '.....hhHHHHHG.....',
  '....hhHHHHHHHG....',
  '....hHHHHHHHHG....',
  '...sHHHHHHHHHGs...',
  '...sHHHHHHHHHGs...',
  '....GHHHHHHHHG....',
  '.....GGHHHHGG.....',
  '......sSSSSs......',
  '....LLTTTTTTDD....',
  '...LLTTTTTTTTDD...',
  '..LTDTTTTTTTTDTD..',
  '..LTDTTTTTTTTDTD..',
  '..LTDTTTTTTTTDTD..',
  '..LTDTTTTTTTTDTD..',
  '..SsDTTTTTTTTDSs..',
  '..ssTTTTTTTTTTss..',
]

const BACK_SLEEP = [
  '..................',
  '..................',
  '......hhHHHG......',
  '.....hhHHHHHG.....',
  '....hhHHHHHHHG....',
  '...shHHHHHHHHGs...',
  'LLTTGHHHHHHHHGTTDD',
  'LTTTTGGHHHHGGTTTTD',
  '.DDDD.sSSSSs.DDDD.',
  '....LLTTTTTTDD....',
  '...LLTTTTTTTTDD...',
  '..LLTTTTTTTTTTDD..',
  '..LTTTTTTTTTTTTD..',
  '..LTTTTTTTTTTTTD..',
  '...LTTTTTTTTTTD...',
  '...LTTTTTTTTTTD...',
]

const BACK_PANIC = [
  '......hhHHHG......',
  '...SShhHHHHHGSS...',
  '...sshHHHHHHHss...',
  '..LThHHHHHHHHGTD..',
  '.LT.HHHHHHHHHG.TD.',
  'LT..GHHHHHHHHG..TD',
  'LT...GGHHHHGG...TD',
  'LT....sSSSSs....TD',
  'LTDLLTTTTTTTTTDDTD',
  'LTDLTTTTTTTTTTTDTD',
  '.LDLTTTTTTTTTTTDD.',
  '..DLTTTTTTTTTTTD..',
  '...LTTTTTTTTTTD...',
  '...LTTTTTTTTTTD...',
]

const FRONT_SIT = [
  '......hhHHHG......',
  '.....hhHHHHHG.....',
  '....hhHHHHHHHG....',
  '....HHHSSHHHHG....',
  '....HSSSSSSSHG....',
  '...sSSESSSSESSs...',
  '...sSSESSSSESSs...',
  '....SBSSSsSSBs....',
  '....sSSSMMSSSs....',
  '.....sSSSSSSs.....',
  '.......sSSs.......',
  '...LTTTCSSCTTTD...',
  '..LLTTTTCCTTTTDD..',
  '..LTTTTTTTTTTTTD..',
  '..LTDTTTTTTTTDTD..',
  '..LTDTTTTTTTTDTD..',
  '..SsDTTTTTTTTDSs..',
  '..ssPPPPPPPPPPss..',
  '...PPPPPPPPPPPQ...',
  '...PPPPQ..PPPPQ...',
  '....PPQ....PPQ....',
  '....PPQ....PPQ....',
  '...kKKK....kKKK...',
]

/** FRONT_SIT with its right hand lifted off the lap: it holds the mug. */
const FRONT_MUG = FRONT_SIT.map((row, r) =>
  r === 16 ? `${row.slice(0, 14)}TD${row.slice(16)}` : r === 17 ? `${row.slice(0, 14)}PQ${row.slice(16)}` : row,
)

const STAND_BACK = [
  ...BACK_IDLE.slice(0, 11),
  '..LTDTTTTTTTTDTD..',
  '..LTDTTTTTTTTDTD..',
  '..LTDTTTTTTTTDTD..',
  '..SsDTTTTTTTTDSs..',
  '....PPPPPPPPPQ....',
  '....PPPPQPPPPQ....',
  '....PPPQ..PPPQ....',
  '....PPPQ..PPPQ....',
]
const STEP_A = ['....PPPQ...KKK....', '....KKKK..........']
const STEP_B = ['.....KKK..PPPQ....', '..........KKKK....']

const INTERN = [
  '....hHHG....',
  '...hHHHHG...',
  '..hHHHHHHG..',
  '..HHSSSSHG..',
  '.sSESSSSESs.',
  '..SBSSSSBs..',
  '..sSSMMSSs..',
  '...sSSSSs...',
  '..LTTCCTTD..',
  '.LLTTTTTTDD.',
  '.LTDTTTTDTD.',
  '.LTDTTTTDTD.',
  '.SsDTTTTDSs.',
  '..PPPPPPPQ..',
  '..PPPQPPPQ..',
  '..PPQ..PPQ..',
  '..PPQ..PPQ..',
  '.kKKK..kKKK.',
]

const BOSS = [
  '......hhHHHG......',
  '.....hhHHHHHG.....',
  '....hhHHHHHHHG....',
  '....HHHHHHHHHG....',
  '....HSSSSSSSHG....',
  '...sSOOOOOOOOSs...',
  '...sSOOgSSOOgSs...',
  '....SSSSSsSSSs....',
  '....sSSSMMSSSs....',
  '.....sSSSSSSs.....',
  '...LTTTWRRWTTTD...',
  '..LLTTTWRRWTTTDD..',
  '..LTTTTTRRTTTTTD..',
  '..LTTTTTRRTTTTTD..',
  '..LTTTTTTRTTTTTD..',
  '..LTTTTTTRTTTTTD..',
  '..LTTTTTTTTTTTTD..',
  '..LTTTTTTTTTTTTD..',
]

// Hair styles, laid over the head of the sprites above.
const LONG_FRONT = [
  '', '', '', '',
  '...H..........G...',
  '...H..........G...',
  '...H..........G...',
  '...H..........G...',
  '...HH........GG...',
  '...HH........GG...',
  '...HH........GG...',
  '..HHH........GGG..',
  '..hH..........GG..',
]
const LONG_BACK = [
  '', '', '', '', '', '', '', '',
  '....hHHHHHHHHG....',
  '....HHHHHHHHHG....',
  '....GHHHHHHHHG....',
  '.....GGHHHHGG.....',
]
const BUN = ['.......hHHG.......', '.......HHHG.......']

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Mixes two #rrggbb colors; `t` 0 is `a`, 1 is `b`. */
function mix(a: string, b: string, t: number): string {
  const x = Number.parseInt(a.slice(1), 16)
  const y = Number.parseInt(b.slice(1), 16)
  const channel = (shift: number) =>
    Math.round(((x >> shift) & 255) + (((y >> shift) & 255) - ((x >> shift) & 255)) * t)

  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`
}

function lighten(hex: string, amount: number): string {
  return mix(hex, '#ffffff', amount)
}

function darken(hex: string, amount: number): string {
  return mix(hex, '#000000', amount)
}

function paletteOf(worker: Pick<WorkerView, 'shirt' | 'hair' | 'skin'>): Palette {
  return {
    H: worker.hair,
    h: lighten(worker.hair, 0.32),
    G: darken(worker.hair, 0.38),
    S: worker.skin,
    s: darken(worker.skin, 0.14),
    B: mix(worker.skin, '#e0707a', 0.3),
    E: '#231d26',
    M: darken(worker.skin, 0.42),
    T: worker.shirt,
    L: lighten(worker.shirt, 0.24),
    D: darken(worker.shirt, 0.3),
    C: lighten(worker.shirt, 0.6),
    P: '#3b3f5c',
    Q: '#2a2d44',
    K: '#3a2a22',
    k: '#5c473a',
    O: '#1d1a22',
    g: '#6b7685',
    W: '#f4f4f4',
    R: '#c0392b',
  }
}

type Run = { fill: string; c: number; w: number; r: number; h: number }

/**
 * One path per color, in sprite pixels scaled up: a run of a color in a row
 * grows down into the rows below that repeat it, so a sprite stays small.
 */
export function sprite(rows: readonly string[], palette: Palette, x: number, y: number, px = PX): string {
  const open = new Map<string, Run>()
  const runs: Run[] = []
  rows.forEach((row, r) => {
    const continued = new Set<string>()
    let c = 0
    while (c < row.length) {
      const ch = row.charAt(c)
      let end = c + 1
      while (end < row.length && row[end] === ch) {
        end += 1
      }
      const fill = palette[ch]
      if (ch !== '.' && fill !== undefined) {
        const key = `${fill} ${c} ${end}`
        const run = open.get(key)
        if (run === undefined) {
          open.set(key, { fill, c, w: end - c, r, h: 1 })
        } else {
          run.h += 1
        }
        continued.add(key)
      }
      c = end
    }
    for (const [key, run] of open) {
      if (!continued.has(key)) {
        runs.push(run)
        open.delete(key)
      }
    }
  })
  runs.push(...open.values())
  const paths = new Map<string, string>()
  for (const run of runs) {
    paths.set(run.fill, `${paths.get(run.fill) ?? ''}M${run.c} ${run.r}h${run.w}v${run.h}h-${run.w}z`)
  }
  let out = ''
  for (const [fill, d] of paths) {
    out += `<path fill="${fill}" d="${d}"/>`
  }

  return `<g transform="translate(${x} ${y}) scale(${px})">${out}</g>`
}

function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`
}

function text(x: number, y: number, body: string, size: number, fill: string, extra = ''): string {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${extra}>${escapeXml(body)}</text>`
}

function shadow(cx: number, cy: number, rx: number, ry: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#bo-shadow)"/>`
}

/** A shared piece from <defs>, placed with its own origin at (x, y). */
function use(ctx: Ctx, id: string, x = 0, y = 0): string {
  ctx.need.add(id)

  return `<use href="#bo-${id}" x="${x}" y="${y}"/>`
}

function keyTimes(times: readonly number[]): string {
  return times.map(t => Number(t.toFixed(3))).join(';')
}

function timing(dur: number, begin: number): string {
  return `dur="${Number(dur.toFixed(2))}s"${begin === 0 ? '' : ` begin="${Number(begin.toFixed(2))}s"`} ${LOOP}`
}

/** Discrete frames of one attribute, the way pixel art animates. */
function frames(ctx: Ctx, attr: string, values: readonly (string | number)[], times: readonly number[], dur: number, begin = 0): string {
  if (!ctx.isAnimated) {
    return ''
  }

  return `<animate attributeName="${attr}" calcMode="discrete" values="${values.join(';')}" keyTimes="${keyTimes(times)}" ${timing(dur, begin)}/>`
}

function moves(ctx: Ctx, values: readonly string[], times: readonly number[], dur: number, begin = 0, calc = 'discrete'): string {
  if (!ctx.isAnimated) {
    return ''
  }

  return (
    `<animateTransform attributeName="transform" type="translate" calcMode="${calc}" values="${values.join(';')}" ` +
    `keyTimes="${keyTimes(times)}" ${timing(dur, begin)}/>`
  )
}

function bounce(ctx: Ctx, inner: string, dur = 1): string {
  return `<g>${inner}${moves(ctx, ['0 0', '0 -3', '0 0'], [0, 0.5, 1], dur, 0, 'linear')}</g>`
}

function bubble(ctx: Ctx, x: number, y: number, label: string, fill: string, ink: string): string {
  const w = Math.max(16, label.length * 7 + 8)
  const inner =
    rect(x + 2, y + 2, w, 15, '#000', ' opacity="0.18" rx="3"') +
    rect(x, y, w, 15, fill, ' rx="3" stroke="#2a2230" stroke-width="1"') +
    rect(x + 3, y + 2, w - 6, 2, lighten(fill, 0.45), ' opacity="0.8"') +
    `<path d="M${x + 6} ${y + 14.5} l4 5 l3 -5 z" fill="${fill}" stroke="#2a2230" stroke-width="1"/>` +
    rect(x + 5, y + 13, 9, 2, fill) +
    text(x + w / 2, y + 11.5, label, 11, ink, ' font-weight="bold" text-anchor="middle"')

  return bounce(ctx, inner)
}

function envelope(x: number, y: number): string {
  return (
    rect(x, y, 11, 8, '#ffffff', ' stroke="#b8860b" stroke-width="1"') +
    `<path d="M${x} ${y} l5.5 4.5 l5.5 -4.5" fill="none" stroke="#b8860b" stroke-width="1"/>` +
    rect(x + 4, y + 5, 3, 2, '#d9534f')
  )
}

function deskOrigin(index: number): Point {
  return { x: (index % COLS) * CELL_W, y: TOP_H + Math.floor(index / COLS) * CELL_H }
}

/** The guest chairs in front of the boss's desk: the chair's center and the top of its back. */
function guestSeat(slot: number): Point {
  return { x: 402 + slot * 34, y: 166 }
}

function hairStyle(id: string): 'kurz' | 'lang' | 'dutt' {
  const styles = ['kurz', 'lang', 'dutt'] as const

  return styles[hash(`frisur:${id}`) % styles.length] ?? 'kurz'
}

function hasGlasses(id: string): boolean {
  return hash(`brille:${id}`) % 4 === 0
}

/** The hair style and glasses of a worker, over a sprite drawn at (x, y). */
function looks(view: WorkerView, palette: Palette, x: number, y: number, side: 'front' | 'back', hasLong = true): string {
  const style = hairStyle(view.id)
  let out = ''
  if (style === 'lang' && hasLong) {
    out += sprite(side === 'front' ? LONG_FRONT : LONG_BACK, palette, x, y)
  }
  if (style === 'dutt') {
    out += sprite(BUN, palette, x, y - 4)
  }
  if (side === 'front' && hasGlasses(view.id)) {
    // thin frames around both eyes, finer than a sprite pixel
    const frame = (fx: number) =>
      rect(fx, y + 9, 6, 1, '#2b2b33') + rect(fx, y + 14, 6, 1, '#2b2b33') + rect(fx, y + 9, 1, 6, '#2b2b33') + rect(fx + 5, y + 9, 1, 6, '#2b2b33')
    out += frame(x + 10) + frame(x + 20) + rect(x + 16, y + 10, 4, 1, '#2b2b33') + rect(x + 11, y + 10, 2, 1, '#ffffff', ' opacity="0.5"')
  }

  return out
}

// The floor, the walls and the kitchen.

function patterns(): string {
  const tile = (x: number, y: number, fill: string) =>
    rect(x, y, 16, 16, fill) + rect(x, y, 16, 1, lighten(fill, 0.35)) + rect(x, y, 1, 16, lighten(fill, 0.25)) +
    rect(x, y + 15, 16, 1, darken(fill, 0.08)) + rect(x + 15, y, 1, 16, darken(fill, 0.06))
  const plank = (x: number, y: number, w: number, fill: string, hasSeam = true) =>
    rect(x, y, w, 16, fill) + rect(x, y, w, 1, lighten(fill, 0.18)) + (hasSeam ? rect(x + w - 1, y, 1, 16, '#a27d55') : '') +
    (w > 20 ? rect(x + 6, y + 6, Math.min(26, w - 12), 1, darken(fill, 0.05)) : '') +
    (w > 34 ? rect(x + 14, y + 11, Math.min(18, w - 20), 1, darken(fill, 0.04)) : '')

  return (
    '<radialGradient id="bo-shadow"><stop offset="0" stop-color="#000" stop-opacity="0.36"/><stop offset="0.7" stop-color="#000" stop-opacity="0.16"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="bo-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4f2"/><stop offset="1" stop-color="#cdeeff"/></linearGradient>' +
    '<linearGradient id="bo-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.32"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="bo-glow"><stop offset="0" stop-color="#9fd0ff" stop-opacity="0.5"/><stop offset="1" stop-color="#9fd0ff" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="bo-lamp"><stop offset="0" stop-color="#fff2b0" stop-opacity="0.7"/><stop offset="1" stop-color="#fff2b0" stop-opacity="0"/></radialGradient>' +
    `<pattern id="bo-planks" width="160" height="32" patternUnits="userSpaceOnUse">` +
    plank(0, 0, 60, '#c6a274') + plank(60, 0, 80, '#cdab7f') + plank(140, 0, 20, '#c6a274', false) +
    plank(0, 16, 20, '#cba87b') + plank(20, 16, 80, '#c39e70') + plank(100, 16, 60, '#cfad82') +
    '</pattern>' +
    `<pattern id="bo-tiles" width="32" height="32" patternUnits="userSpaceOnUse">` +
    tile(0, 0, '#e6dfd1') + tile(16, 0, '#d2c9b7') + tile(0, 16, '#d2c9b7') + tile(16, 16, '#e6dfd1') +
    '</pattern>' +
    `<pattern id="bo-carpet" width="8" height="8" patternUnits="userSpaceOnUse">` +
    rect(0, 0, 8, 8, '#56668b') + rect(1, 2, 1, 1, '#61729a') + rect(5, 6, 1, 1, '#4c5b7e') + rect(6, 1, 1, 1, '#5d6e95') +
    '</pattern>' +
    `<pattern id="bo-paper" width="12" height="44" patternUnits="userSpaceOnUse">` +
    rect(0, 0, 12, 44, '#efe8da') + rect(0, 0, 5, 44, '#ebe3d4') +
    '</pattern>'
  )
}

function background(ctx: Ctx, height: number, office: OfficeView): string {
  return (
    rect(0, TOP_H, WIDTH, height - TOP_H, 'url(#bo-planks)') +
    // a soft band of shade where the office floor meets the rooms above
    rect(0, TOP_H, WIDTH, 6, '#000', ' opacity="0.08"') +
    rect(0, WALL_H, 296, TOP_H - WALL_H, 'url(#bo-tiles)') +
    rect(0, 0, 296, WALL_H, 'url(#bo-paper)') +
    rect(0, WALL_H - 4, 296, 4, '#b9ab92') +
    rect(0, WALL_H - 4, 296, 1, '#cfc1a7') +
    rect(0, WALL_H, 296, 3, '#000', ' opacity="0.07"') +
    officeWindow(ctx, 72, 'a') +
    officeWindow(ctx, 142, 'b') +
    noticeBoard(office.messages.length) +
    kitchen(ctx)
  )
}

function officeWindow(ctx: Ctx, x: number, id: string): string {
  const cloud = (cx: number, cy: number, s: number, dur: number, begin: number) =>
    `<g transform="translate(${cx} 0)">${moves(ctx, [`${x - 14} 0`, `${x + 60} 0`], [0, 1], dur, begin, 'linear')}` +
    rect(0, cy, 10 * s, 3 * s, '#ffffff', ' opacity="0.9"') + rect(2 * s, cy - 2 * s, 5 * s, 2 * s, '#ffffff', ' opacity="0.9"') + '</g>'

  return (
    `<clipPath id="bo-win-${id}"><rect x="${x + 3}" y="9" width="54" height="22"/></clipPath>` +
    rect(x - 1, 5, 62, 31, '#000', ' opacity="0.08"') +
    rect(x, 6, 60, 28, '#ffffff') +
    rect(x + 3, 9, 54, 22, 'url(#bo-sky)') +
    `<g clip-path="url(#bo-win-${id})">${cloud(x + 12, 14, 1, 70, -25)}${cloud(x + 36, 22, 0.7, 55, -40)}</g>` +
    rect(x + 3, 9, 54, 2, '#000', ' opacity="0.06"') +
    rect(x + 29, 9, 2, 22, '#ffffff') +
    rect(x + 3, 19, 54, 2, '#ffffff') +
    `<path d="M${x + 6} 30 l8 -18 h4 l-8 18 z" fill="#ffffff" opacity="0.28"/>` +
    rect(x - 2, 34, 64, 3, '#e8e2d6') +
    rect(x - 2, 37, 64, 1, '#c6bdac')
  )
}

function noticeBoard(count: number): string {
  const label = count === 0 ? 'keine Post' : `Post: ${count}`

  return (
    `<g><title>${escapeXml(`Nachrichten der letzten 90 Sekunden: ${count}`)}</title>` +
    rect(213, 6, 78, 31, '#000', ' opacity="0.1"') +
    rect(212, 5, 78, 31, '#9c7348') +
    rect(214, 7, 74, 27, '#d9b98c') +
    rect(214, 7, 74, 1, '#e8cfa6') +
    rect(220, 12, 4, 1, '#c4a274') + rect(262, 26, 5, 1, '#c4a274') + rect(240, 10, 3, 1, '#c4a274') +
    rect(218, 10, 14, 11, '#fffbe6') + rect(220, 13, 9, 1, '#c9c2a8') + rect(220, 16, 7, 1, '#c9c2a8') + rect(224, 9, 2, 2, '#d9534f') +
    rect(236, 11, 12, 10, '#ffe08a') + rect(238, 14, 7, 1, '#d4b75c') + rect(241, 10, 2, 2, '#4a7fd6') +
    rect(254, 9, 13, 11, '#f7c6d9') + rect(256, 12, 8, 1, '#d79db4') + rect(259, 8, 2, 2, '#43a047') +
    rect(272, 10, 12, 12, '#ffffff') + rect(274, 13, 8, 1, '#c9c9d4') + rect(274, 16, 6, 1, '#c9c9d4') + rect(277, 9, 2, 2, '#f0a030') +
    text(251, 31, label, 8, '#3a2a14', ' text-anchor="middle" font-weight="bold"') +
    '</g>'
  )
}

function kitchen(ctx: Ctx): string {
  const door = (x: number) =>
    rect(x, 59, 28, 30, '#b5a390') + rect(x, 59, 1, 30, '#c7b7a3') + rect(x + 27, 59, 1, 30, '#9b8a77') + rect(x + 22, 70, 2, 7, '#ece6da')
  const beam = (x: number) => `<path d="M${x + 3} 37 h54 l40 96 h-54 z" fill="url(#bo-beam)"/>`
  const steam = (x: number, y: number, begin: number) =>
    `<rect x="${x}" y="${y}" width="2" height="3" fill="#ffffff" opacity="0">` +
    frames(ctx, 'opacity', [0, 0.8, 0.5, 0], [0, 0.25, 0.6, 0.9], 2, begin) +
    frames(ctx, 'y', [y, y - 3, y - 6, y - 9], [0, 0.25, 0.6, 0.9], 2, begin) +
    '</rect>'
  const bubbleUp = (x: number, begin: number) =>
    `<rect x="${x}" y="32" width="2" height="2" fill="#ffffff" opacity="0.7">` +
    frames(ctx, 'y', [33, 30, 27, 24, 21], [0, 0.25, 0.5, 0.75, 0.95], 2.4, begin) +
    '</rect>'

  return (
    beam(72) + beam(142) +
    // wall cabinets
    rect(4, 4, 56, 22, '#e3d6c0') + rect(6, 6, 25, 18, '#eadfcb') + rect(33, 6, 25, 18, '#eadfcb') +
    rect(6, 6, 25, 1, '#f5ede0') + rect(33, 6, 25, 1, '#f5ede0') + rect(27, 13, 2, 4, '#8a7a62') + rect(35, 13, 2, 4, '#8a7a62') +
    rect(4, 26, 56, 2, '#000', ' opacity="0.12"') +
    // counter with cabinets
    shadow(66, 96, 68, 4) +
    rect(4, 56, 124, 36, '#a89683') + door(6) + door(37) + door(68) + door(99) +
    rect(4, 92, 124, 4, '#6e6052') +
    rect(2, 46, 128, 10, '#d8cfc0') + rect(2, 46, 128, 1, '#ece6db') + rect(2, 54, 128, 2, '#b3a897') +
    // coffee machine
    rect(12, 20, 28, 30, '#3a3a42', ' rx="2"') + rect(12, 20, 28, 3, '#55555f', ' rx="1"') + rect(12, 23, 2, 26, '#4b4b55') + rect(37, 23, 3, 26, '#2a2a30') +
    rect(16, 25, 12, 6, '#16232b') + rect(17, 26, 7, 1, '#7fd1ff') + rect(17, 28, 9, 1, '#7fd1ff', ' opacity="0.6"') +
    rect(31, 25, 4, 2, '#e53935') + rect(31, 28, 4, 2, '#43a047') +
    rect(22, 33, 9, 3, '#24242c') + rect(16, 46, 21, 3, '#222228') + rect(18, 47, 17, 1, '#3a3a44') +
    rect(22, 40, 8, 6, '#ffffff') + rect(29, 41, 2, 3, '#e6e6e6') + rect(22, 40, 8, 1, '#5a3418') + rect(28, 40, 2, 6, '#e3e3e3') +
    `<rect x="25.5" y="36" width="1" height="4" fill="#6b3e1e" opacity="0.9">${frames(ctx, 'opacity', [0.9, 0, 0.9], [0, 0.5, 0.75], 1.4)}</rect>` +
    `<rect x="36" y="46" width="1" height="1" fill="#ff5252">${frames(ctx, 'opacity', [1, 0.2], [0, 0.5], 1.8)}</rect>` +
    steam(23, 36, 0) + steam(27, 36, 1) +
    // toaster, fruit bowl and sink
    rect(46, 37, 17, 10, '#c8ccd2', ' rx="2"') + rect(46, 37, 17, 2, '#e3e6ea') + rect(49, 37, 4, 1, '#3a3a44') + rect(56, 37, 4, 1, '#3a3a44') + rect(60, 41, 2, 3, '#555c66') +
    rect(66, 42, 20, 5, '#e6e6e6', ' rx="2"') + `<circle cx="71" cy="41" r="3" fill="#f0a030"/><circle cx="77" cy="40" r="3" fill="#7cb342"/><circle cx="82" cy="41.5" r="2.5" fill="#d9534f"/>` +
    rect(90, 48, 32, 6, '#9aa4ad') + rect(92, 49, 28, 4, '#76828c') + rect(104, 34, 3, 14, '#c3ccd4') + rect(104, 34, 10, 3, '#c3ccd4') + rect(104, 34, 10, 1, '#e8eef2') + rect(112, 37, 2, 2, '#9aa4ad') +
    // fridge
    shadow(149, 97, 18, 3) +
    rect(134, 10, 30, 86, '#e9edf1', ' rx="2"') + rect(160, 11, 4, 84, '#cfd5dc') + rect(135, 11, 2, 84, '#ffffff') +
    rect(134, 36, 30, 1, '#b4bcc6') + rect(156, 20, 2, 11, '#97a1ab') + rect(156, 42, 2, 18, '#97a1ab') +
    rect(140, 46, 5, 5, '#d9534f') + rect(146, 62, 6, 4, '#4a7fd6') + rect(141, 70, 8, 10, '#fffbe6') +
    rect(136, 96, 4, 2, '#555c66') + rect(158, 96, 4, 2, '#555c66') +
    // water cooler
    shadow(180, 93, 13, 3) +
    rect(173, 14, 14, 22, '#a8dcff', ' opacity="0.85" rx="2"') + rect(175, 15, 2, 19, '#e8f6ff', ' opacity="0.8"') + rect(176, 12, 8, 3, '#3d8bfd') +
    bubbleUp(179, 0) + bubbleUp(182, 1.1) +
    rect(170, 36, 20, 56, '#e8e8e8') + rect(170, 36, 20, 2, '#f7f7f7') + rect(186, 38, 4, 54, '#cfcfcf') +
    rect(175, 46, 4, 4, '#3d8bfd') + rect(181, 46, 4, 4, '#e53935') + rect(174, 56, 12, 2, '#9a9a9a') +
    // bistro table with stools
    shadow(62, 162, 26, 4) +
    rect(40, 132, 44, 6, '#7a5232') + rect(40, 132, 44, 2, '#9a6a44') + rect(40, 138, 44, 2, '#5c3c24') +
    rect(60, 140, 4, 18, '#4a4a52') + rect(60, 140, 1, 18, '#6a6a74') + rect(52, 158, 20, 3, '#3a3a42') +
    rect(66, 127, 6, 5, '#ffffff') + rect(66, 127, 6, 1, '#6b3e1e') + rect(72, 128, 2, 3, '#e6e6e6') +
    shadow(29, 166, 9, 2) + rect(22, 146, 14, 4, '#c0392b', ' rx="1"') + rect(22, 146, 14, 1, '#de5546') + rect(28, 150, 2, 14, '#666c74') + rect(24, 160, 10, 1, '#7a8088') +
    shadow(95, 166, 9, 2) + rect(88, 146, 14, 4, '#c0392b', ' rx="1"') + rect(88, 146, 14, 1, '#de5546') + rect(94, 150, 2, 14, '#666c74') + rect(90, 160, 10, 1, '#7a8088') +
    // rug, couch, coffee table and a plant
    rect(150, 196, 144, 28, '#7c9a9a') + rect(153, 199, 138, 22, '#8fb0ae') + rect(153, 199, 138, 1, '#a6c4c2') +
    shadow(222, 200, 66, 5) +
    rect(166, 158, 112, 16, '#8e5b3a', ' rx="3"') + rect(166, 158, 112, 2, '#a8714c') +
    rect(168, 172, 36, 16, '#a86c45') + rect(205, 172, 36, 16, '#a86c45') + rect(242, 172, 36, 16, '#a86c45') +
    rect(168, 172, 36, 2, '#c2865d') + rect(205, 172, 36, 2, '#c2865d') + rect(242, 172, 36, 2, '#c2865d') +
    rect(204, 172, 1, 16, '#7f4f31') + rect(241, 172, 1, 16, '#7f4f31') +
    rect(166, 188, 112, 8, '#7a4a2e') + rect(170, 196, 4, 4, '#3a2414') + rect(270, 196, 4, 4, '#3a2414') +
    rect(158, 164, 10, 32, '#7f4f31', ' rx="2"') + rect(158, 164, 10, 3, '#9b6440') +
    rect(276, 164, 10, 32, '#7f4f31', ' rx="2"') + rect(276, 164, 10, 3, '#9b6440') +
    rect(172, 162, 16, 12, '#f0c75e', ' rx="2"') + rect(172, 162, 16, 2, '#f7dc8f') + rect(184, 164, 4, 10, '#d9ad43') +
    rect(256, 162, 16, 12, '#5fa8d3', ' rx="2"') + rect(256, 162, 16, 2, '#8cc5e6') + rect(268, 164, 4, 10, '#4a8db6') +
    shadow(222, 217, 40, 3) +
    rect(184, 204, 76, 6, '#6d4630') + rect(184, 204, 76, 1, '#8a5a3e') + rect(188, 210, 3, 6, '#4e3222') + rect(253, 210, 3, 6, '#4e3222') +
    rect(196, 203, 14, 4, '#e0457b') + rect(198, 204, 9, 1, '#f08fb0') + rect(236, 200, 5, 5, '#ffffff') + rect(236, 200, 5, 1, '#6b3e1e') +
    shadow(138, 197, 12, 3) +
    rect(130, 182, 16, 14, '#b5651d') + rect(129, 181, 18, 3, '#cf7a2e') + rect(142, 184, 4, 12, '#94511a') +
    rect(126, 160, 8, 6, '#2f7d32') + rect(134, 150, 8, 10, '#43a047') + rect(140, 158, 10, 8, '#2f7d32') + rect(130, 168, 10, 12, '#3e8e41') +
    rect(138, 164, 8, 16, '#56b35a') + rect(128, 172, 6, 8, '#56b35a') + rect(136, 152, 3, 4, '#7cc97f') + rect(141, 166, 2, 4, '#7cc97f') +
    text(10, 220, 'Küche', 10, '#7a6a52', ' font-weight="bold"')
  )
}

function bookshelf(): string {
  const inks = ['#c0392b', '#2e86c1', '#f0a030', '#27ae60', '#8e44ad', '#e0bd45', '#16a085', '#d35400']
  let books = ''
  ;[22, 42, 62, 82].forEach((shelf, row) => {
    let x = 312
    let i = row * 3
    while (x < 350) {
      const w = 3 + (hash(`buch${i}`) % 3)
      const h = 12 + (hash(`hoch${i}`) % 6)
      const ink = inks[hash(`farbe${i}`) % inks.length] ?? '#c0392b'
      books += rect(x, shelf - h, w, h, ink) + rect(x, shelf - h, 1, h, lighten(ink, 0.3)) + rect(x, shelf - h + 3, w, 1, darken(ink, 0.25))
      x += w + (i % 5 === 4 ? 4 : 0)
      i += 1
    }
  })

  return (
    shadow(332, 94, 28, 3) +
    rect(308, 2, 48, 92, '#5a3a24') + rect(311, 5, 42, 86, '#3a2516') + books +
    [22, 42, 62, 82].map(y => rect(310, y, 44, 3, '#6b4630') + rect(310, y, 44, 1, '#8a5c3e')).join('') +
    rect(308, 2, 48, 2, '#7a5034') + rect(308, 2, 2, 92, '#6e482e')
  )
}

function bossOffice(ctx: Ctx, office: OfficeView, visitors: readonly WorkerView[], arriving: ReadonlySet<string>): string {
  const minutes = office.clockMinutes
  const hourAngle = ((minutes / 60) % 12) * 30
  const minuteAngle = (minutes % 60) * 6
  const bossLook = paletteOf({ shirt: '#2f3640', hair: '#3a2a1a', skin: '#f2c9a0' })
  const boss: Palette = { ...bossLook, L: '#454e5c', D: '#22272e', O: '#121212' }
  const steam = (x: number, begin: number) =>
    `<rect x="${x}" y="80" width="2" height="3" fill="#ffffff" opacity="0">` +
    frames(ctx, 'opacity', [0, 0.8, 0.5, 0], [0, 0.25, 0.6, 0.9], 2.2, begin) +
    frames(ctx, 'y', [80, 77, 74, 71], [0, 0.25, 0.6, 0.9], 2.2, begin) +
    '</rect>'
  let out =
    // wall with wainscoting
    rect(296, 0, WIDTH - 296, WALL_H, '#ddd2c0') +
    rect(296, 26, WIDTH - 296, 14, '#cfc2ab') + rect(296, 26, WIDTH - 296, 2, '#b9a88c') +
    rect(296, WALL_H - 4, WIDTH - 296, 4, '#a89a80') + rect(296, WALL_H - 4, WIDTH - 296, 1, '#bfb197') +
    rect(302, WALL_H, WIDTH - 302, TOP_H - WALL_H - 4, 'url(#bo-carpet)') +
    rect(302, WALL_H, WIDTH - 302, 3, '#000', ' opacity="0.1"') +
    // picture, brass sign and clock
    rect(373, 7, 36, 26, '#000', ' opacity="0.12"') +
    rect(372, 6, 36, 26, '#7a5232') + rect(375, 9, 30, 20, '#9fd3f5') + rect(375, 21, 30, 8, '#6aa84f') +
    `<path d="M375 23 l8 -7 l6 5 l5 -4 l11 8 v4 h-30 z" fill="#4e8a3a"/>` + rect(397, 11, 4, 4, '#ffe066') +
    rect(421, 9, 100, 22, '#000', ' opacity="0.14"') +
    rect(420, 8, 100, 22, '#c9a227') + rect(423, 11, 94, 16, '#e0bd45') + rect(423, 11, 94, 1, '#f3d778') +
    rect(424, 12, 2, 2, '#a8861c') + rect(514, 12, 2, 2, '#a8861c') +
    text(470, 24, 'CHEFBÜRO', 12, '#3a2a00', ' text-anchor="middle" font-weight="bold"') +
    `<circle cx="567" cy="23" r="13" fill="#000" opacity="0.12"/>` +
    `<circle cx="566" cy="22" r="13" fill="#ffffff" stroke="#555" stroke-width="2"/>` +
    [0, 90, 180, 270].map(a => `<rect x="565.5" y="11" width="1" height="2" fill="#777" transform="rotate(${a} 566 22)"/>`).join('') +
    `<line x1="566" y1="22" x2="566" y2="15" stroke="#222" stroke-width="2" transform="rotate(${hourAngle} 566 22)"/>` +
    `<line x1="566" y1="22" x2="566" y2="12" stroke="#222" stroke-width="1" transform="rotate(${minuteAngle} 566 22)"/>` +
    bookshelf() +
    // rug under the desk and the guest chairs
    rect(372, 120, 200, 96, '#7d2f2f') + rect(376, 124, 192, 88, '#93393a') +
    rect(380, 128, 184, 1, '#c9a227') + rect(380, 207, 184, 1, '#c9a227') + rect(380, 128, 1, 80, '#c9a227') + rect(563, 128, 1, 80, '#c9a227') +
    // tall plant in the corner
    shadow(582, 180, 14, 3) +
    rect(574, 160, 16, 18, '#b5651d') + rect(573, 159, 18, 3, '#cf7a2e') + rect(586, 162, 4, 16, '#94511a') +
    rect(572, 124, 10, 12, '#2f7d32') + rect(580, 116, 10, 14, '#43a047') + rect(584, 130, 10, 12, '#2f7d32') +
    rect(574, 138, 12, 20, '#3e8e41') + rect(582, 140, 8, 18, '#56b35a') + rect(583, 118, 3, 5, '#7cc97f') + rect(576, 142, 2, 6, '#7cc97f') +
    // the boss: you, in a high-backed leather chair
    rect(446, 30, 48, 54, '#3b2a20', ' rx="7"') + rect(450, 33, 6, 48, '#54402f') + rect(487, 34, 4, 46, '#2c1f17') +
    [0, 1, 2, 3].map(r => [0, 1, 2].map(c => rect(460 + c * 9, 40 + r * 10, 2, 2, '#2a1d16')).join('')).join('') +
    sprite(BOSS, boss, 452, 44) +
    // the desk
    shadow(470, 122, 86, 6) +
    rect(392, 80, 156, 22, '#6b3e26') + rect(392, 80, 156, 2, '#875136') + rect(400, 86, 40, 1, '#5e3520') + rect(470, 94, 50, 1, '#5e3520') +
    rect(392, 102, 156, 2, '#8a5536') + rect(392, 104, 156, 14, '#4e2c1a') + rect(392, 117, 156, 1, '#38200f') +
    rect(398, 107, 44, 8, '#5a3420') + rect(498, 107, 44, 8, '#5a3420') + rect(398, 107, 44, 1, '#6a4028') + rect(498, 107, 44, 1, '#6a4028') +
    rect(456, 106, 28, 9, '#c9a227') + rect(457, 107, 26, 7, '#e0bd45') +
    text(470, 113, 'DU', 7, '#3a2a00', ' text-anchor="middle" font-weight="bold"') +
    // on the desk: laptop, papers, mug, phone and lamp
    rect(404, 63, 30, 19, '#c5cad3', ' rx="1"') + rect(405, 64, 28, 1, '#e4e8ee') + rect(431, 64, 2, 18, '#a9afba') + rect(417, 71, 4, 4, '#9aa2ae') +
    rect(400, 82, 38, 3, '#aab0ba') +
    rect(397, 87, 15, 10, '#f5f5f5') + rect(399, 85, 15, 10, '#ffffff') + rect(401, 88, 9, 1, '#c9c9d4') + rect(401, 91, 7, 1, '#c9c9d4') +
    rect(443, 83, 7, 7, '#ffffff') + rect(443, 83, 7, 1, '#6b3e1e') + rect(450, 85, 2, 3, '#e6e6e6') + steam(445, 0) + steam(448, 1.1) +
    rect(450, 80, 7, 7, '#2f3640') + rect(450, 80, 2, 7, '#454e5c') + rect(483, 80, 7, 7, '#2f3640') + rect(488, 80, 2, 7, '#22272e') +
    rect(450, 86, 7, 1, '#f4f4f4') + rect(483, 86, 7, 1, '#f4f4f4') +
    rect(450, 87, 7, 4, '#f2c9a0') + rect(450, 90, 7, 1, '#d9b08a') + rect(483, 87, 7, 4, '#f2c9a0') + rect(483, 90, 7, 1, '#d9b08a') +
    rect(500, 89, 13, 6, '#2a2a30') + rect(500, 87, 13, 2, '#3a3a42') + rect(502, 90, 3, 1, '#5cd65c') +
    `<ellipse cx="526" cy="90" rx="20" ry="6" fill="url(#bo-lamp)"/>` +
    rect(519, 88, 14, 3, '#2d2d38') + rect(525, 70, 2, 18, '#c9a227') + rect(514, 64, 22, 7, '#2e7d4f') + rect(514, 64, 22, 1, '#4caf72') + rect(514, 70, 22, 1, '#fff2b0') +
    // glass walls with the door at the bottom
    rect(296, WALL_H, 6, TOP_H - WALL_H, '#bfe3f2', ' opacity="0.9"') + rect(296, WALL_H, 1, TOP_H - WALL_H, '#e8f6fc') +
    rect(296, 90, 6, 2, '#8aa4b3') + rect(296, 160, 6, 2, '#8aa4b3') +
    rect(296, TOP_H - 4, 34, 4, '#bfe3f2') + rect(384, TOP_H - 4, WIDTH - 384, 4, '#bfe3f2') + rect(296, TOP_H - 4, WIDTH - 296, 1, '#e8f6fc', ' opacity="0.7"') +
    rect(326, TOP_H - 12, 4, 12, '#8aa4b3') + rect(384, TOP_H - 12, 4, 12, '#8aa4b3')

  for (let slot = 0; slot < MAX_VISITORS; slot += 1) {
    const seat = guestSeat(slot)
    const view = visitors[slot]
    out += view === undefined ? use(ctx, 'guest', seat.x, seat.y) : visitor(ctx, view, seat, arriving.has(view.id))
  }
  if (visitors.length > MAX_VISITORS) {
    out += text(590, 214, `+${visitors.length - MAX_VISITORS}`, 10, '#ffffff', ' text-anchor="end" font-weight="bold"')
  }

  return out
}

/** A worker waiting in the boss office, seated on a guest chair; walks in when it just arrived. */
function visitor(ctx: Ctx, view: WorkerView, seat: Point, isArriving: boolean): string {
  const palette = paletteOf(view)
  const isPermission = view.mood === 'freigabe'
  const tip = `${view.name} · ${view.project} – ${moodLabel(view)}${view.question === undefined ? '' : `: ${view.question}`}`
  const ox = seat.x - 18
  const oy = seat.y - 26
  const person =
    sprite(BACK_IDLE.slice(9), palette, ox, oy + 18) +
    `<g>${moves(ctx, ['0 0', '1 0', '0 0', '-1 0', '0 0'], [0, 0.3, 0.45, 0.75, 0.9], 4.2, (hash(view.id) % 7) / 3)}` +
    sprite(BACK_IDLE.slice(0, 9), palette, ox, oy) + looks(view, palette, ox, oy, 'back') + '</g>'
  const chair = use(ctx, 'guest', seat.x, seat.y)
  const marks =
    bubble(ctx, seat.x - 9, seat.y - 48, isPermission ? 'OK?' : '?', isPermission ? '#ffe066' : '#ffb84d', '#222') +
    rect(seat.x - 16, seat.y + 37, 32, 11, '#1d2333', ' opacity="0.78" rx="2"') +
    text(seat.x, seat.y + 45, clip(view.name, 7), 8, '#ffffff', ' text-anchor="middle" font-weight="bold"')
  const label = `<title>${escapeXml(tip)}</title>`
  if (!isArriving || !ctx.isAnimated) {
    return `<g data-worker="${escapeXml(view.id)}" class="worker">${label}${person}${chair}${marks}</g>`
  }
  const later = (inner: string) => `<g opacity="0"><set attributeName="opacity" to="1" begin="${WALK_S}s" fill="freeze"/>${inner}</g>`
  const from = { x: DOOR.x - 18, y: DOOR.y - 42 }
  const aisle = { x: ox, y: DOOR.y - 50 }
  const to = { x: ox, y: seat.y + 24 - 42 }
  const legs = (rows: readonly string[], values: readonly number[]) =>
    `<g opacity="${values[0]}">${frames(ctx, 'opacity', values, [0, 0.5], 0.36)}${sprite(rows, palette, 0, 34)}</g>`
  const walker =
    `<g transform="translate(${from.x} ${from.y})">` +
    `<animateTransform attributeName="transform" type="translate" values="${from.x} ${from.y};${aisle.x} ${aisle.y};${to.x} ${to.y}" keyTimes="0;0.7;1" dur="${WALK_S}s" fill="freeze"/>` +
    `<set attributeName="opacity" to="0" begin="${WALK_S}s" fill="freeze"/>` +
    sprite(STAND_BACK, palette, 0, 0) + looks(view, palette, 0, 0, 'back') + legs(STEP_A, [1, 0]) + legs(STEP_B, [0, 1]) +
    '</g>'

  return `<g data-worker="${escapeXml(view.id)}" class="worker">${label}${later(person)}${chair}${later(marks)}${walker}</g>`
}

// The pieces <defs> holds, each drawn around its own origin.

/** An office chair; its back reaches up to `top`, behind the seat when the sitter faces the room. */
function officeChair(top: number, isBehind: boolean): string {
  const back =
    rect(61, top, 28, 84 - top, '#3d3d4d', ' rx="4"') + rect(63, top + 2, 4, 80 - top, '#52526a') + rect(84, top + 2, 3, 80 - top, '#2c2c39') +
    rect(65, top + 1, 20, 1, '#5a5a70') + rect(64, top + 9, 22, 1, '#33333f')
  const seat = rect(59, 80, 32, 7, '#34343f', ' rx="2"') + rect(59, 80, 32, 2, '#474756') + rect(59, 86, 32, 1, '#25252e')

  return (
    shadow(75, 97, 20, 3.5) +
    rect(61, 93, 28, 2, '#2a2a33') + rect(59, 95, 4, 3, '#17171d') + rect(73, 96, 4, 3, '#17171d') + rect(87, 95, 4, 3, '#17171d') +
    rect(73, 87, 4, 6, '#4a4a55') + rect(73, 87, 1, 6, '#6a6a78') +
    (isBehind ? back + seat : seat) +
    rect(55, 74, 5, 10, '#2e2e38') + rect(55, 74, 5, 2, '#4a4a58') + rect(90, 74, 5, 10, '#2e2e38') + rect(90, 74, 5, 2, '#4a4a58') +
    (isBehind ? '' : back)
  )
}

function defsOf(ctx: Ctx): string {
  const pieces: Record<string, () => string> = {
    desk: () =>
      shadow(75, 76, 64, 5) +
      rect(20, 58, 5, 18, '#5e3b25') + rect(20, 58, 2, 18, '#7a4e33') + rect(125, 58, 5, 18, '#5e3b25') + rect(125, 58, 2, 18, '#7a4e33') +
      rect(16, 30, 118, 22, '#c08f5e') + rect(16, 30, 118, 2, '#d2a272') +
      rect(24, 36, 30, 1, '#b3824f') + rect(70, 41, 40, 1, '#b3824f') + rect(30, 47, 22, 1, '#b3824f') + rect(100, 34, 26, 1, '#b3824f') +
      rect(16, 52, 118, 2, '#d8ab7c') + rect(16, 54, 118, 8, '#8d5d3d') + rect(16, 61, 118, 1, '#6b4329') +
      rect(20, 55, 30, 5, '#9a6747') + rect(32, 57, 6, 1, '#e0c08a') + rect(100, 55, 30, 5, '#9a6747') + rect(112, 57, 6, 1, '#e0c08a'),
    monitor: () =>
      rect(63, 38, 24, 3, '#2a2a33') + rect(63, 38, 24, 1, '#4a4a56') + rect(71, 32, 8, 6, '#33333d') + rect(71, 32, 2, 6, '#4a4a56') +
      rect(46, 0, 58, 32, '#24242c', ' rx="2"') + rect(47, 1, 56, 1, '#3e3e4a') + rect(47, 1, 1, 29, '#3a3a46') +
      rect(46, 29, 58, 3, '#2b2b34') + rect(74, 30, 3, 1, '#55556a'),
    glare: () => `<path d="M53 3 h14 l-11 26 h-7 z" fill="#ffffff" opacity="0.06"/>` + rect(49, 3, 52, 1, '#ffffff', ' opacity="0.05"'),
    kbd: () => {
      let keys = ''
      for (let row = 0; row < 3; row += 1) {
        for (let x = 56; x < 94; x += 4) {
          keys += rect(x, 47 + row * 2, 3, 1, '#6c6e7c')
        }
      }

      return (
        rect(54, 46, 42, 7, '#3a3b44') + rect(54, 46, 42, 1, '#55566a') + keys + rect(64, 51, 22, 1, '#7a7c8a') +
        rect(54, 52, 42, 1, '#24252c') +
        rect(102, 43, 16, 10, '#2c3e5c') + rect(102, 43, 16, 1, '#3d5276') +
        rect(108, 45, 5, 6, '#e9e9ee', ' rx="2"') + rect(108, 45, 5, 1, '#ffffff') + rect(110, 45, 1, 2, '#b9b9c4')
      )
    },
    keysOn: () =>
      [[62, 47, 0.4, 0], [66, 49, 0.55, 0.2], [84, 47, 0.47, 0.1], [80, 49, 0.6, 0.3], [70, 51, 0.9, 0.45]]
        .map(([x, y, dur, begin]) =>
          `<rect x="${x}" y="${y}" width="3" height="1" fill="#b6f0ff" opacity="0">${frames(ctx, 'opacity', [0, 0.9, 0], [0, 0.4, 0.6], dur ?? 0.5, begin ?? 0)}</rect>`)
        .join(''),
    chair: () => officeChair(66, false),
    chairHigh: () => officeChair(56, true),
    guest: () =>
      shadow(0, 33, 16, 3) +
      rect(-12, 24, 3, 9, '#4e2c1a') + rect(9, 24, 3, 9, '#4e2c1a') +
      rect(-14, 18, 28, 7, '#7a4026', ' rx="2"') + rect(-14, 18, 28, 2, '#94523a') +
      rect(-12, 4, 24, 16, '#6b3a24', ' rx="3"') + rect(-10, 6, 3, 12, '#87503a') + rect(8, 6, 3, 12, '#4f2a1a') +
      rect(-9, 5, 18, 1, '#8f5a40') + rect(-5, 9, 2, 2, '#4a2616') + rect(3, 9, 2, 2, '#4a2616') + rect(-1, 14, 2, 2, '#4a2616'),
    plant: () =>
      rect(116, 30, 12, 10, '#b5651d') + rect(115, 29, 14, 2, '#cf7a2e') + rect(124, 31, 4, 9, '#94511a') +
      rect(114, 20, 6, 8, '#2f7d32') + rect(118, 14, 6, 14, '#43a047') + rect(123, 18, 6, 10, '#2f7d32') +
      rect(120, 22, 6, 7, '#56b35a') + rect(119, 15, 2, 3, '#7cc97f') + rect(125, 20, 2, 3, '#7cc97f'),
    papers: () =>
      rect(22, 35, 18, 12, '#000', ' opacity="0.1"') + rect(21, 34, 18, 12, '#ececf2') + rect(23, 32, 18, 12, '#ffffff') +
      rect(26, 35, 11, 1, '#c9c9d4') + rect(26, 38, 9, 1, '#c9c9d4') + rect(26, 41, 11, 1, '#c9c9d4'),
    lamp: () =>
      `<path d="M26 26 l-8 22 h22 l-6 -22 z" fill="#fff6c4" opacity="0.18"/>` +
      rect(20, 44, 12, 3, '#2d2d38') + rect(25, 26, 2, 18, '#3a3a46') + rect(20, 20, 14, 6, '#d9a21b') + rect(20, 20, 14, 1, '#f0c04a') +
      rect(22, 26, 10, 1, '#fff2b0'),
    photo: () => rect(118, 26, 11, 13, '#5a3825') + rect(120, 28, 7, 9, '#9fd3f5') + rect(120, 33, 7, 4, '#6aa84f') + rect(122, 29, 2, 2, '#ffe066'),
    mug: () => {
      const steam = (x: number, begin: number) =>
        `<rect x="${x}" y="36" width="2" height="3" fill="#ffffff" opacity="0">` +
        frames(ctx, 'opacity', [0, 0.8, 0.4, 0], [0, 0.25, 0.6, 0.9], 2, begin) +
        frames(ctx, 'y', [36, 33, 30, 27], [0, 0.25, 0.6, 0.9], 2, begin) +
        '</rect>'

      return rect(120, 40, 7, 7, '#ffffff') + rect(120, 40, 7, 1, '#6b3e1e') + rect(127, 42, 2, 3, '#e6e6e6') + rect(125, 41, 2, 6, '#e3e3e3') + steam(121, 0) + steam(124, 1)
    },
  }
  let out = patterns()
  for (const id of ctx.need) {
    const piece = id.startsWith('code') ? () => codeScreen(ctx, Number(id.slice(4))) : pieces[id]
    if (piece !== undefined) {
      out += `<g id="bo-${id}">${piece()}</g>`
    }
  }

  return `<defs>${out}</defs>`
}

// Code that types itself on a working screen: tokens of colored pixels, one
// character at a time, scrolling when the screen is full.

const CODE_INK = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#d6deeb', '#89ddff', '#ffcb6b']
const COMMENT_INK = '#5c7085'
const SCREEN_BG = '#111a24'
const CODE_LINES = 9
const SHOWN_LINES = 5
const CODE_VARIANTS = 3

type CodeLine = { indent: number; tokens: { len: number; ink: string }[] }

function random(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function codeLines(variant: number): CodeLine[] {
  const next = random(hash(`code:${variant}`))
  const lines: CodeLine[] = []
  let indent = 0
  for (let i = 0; i < CODE_LINES; i += 1) {
    const room = 21 - indent * 2
    if (i > 0 && next() < 0.1) {
      lines.push({ indent, tokens: [] })
      continue
    }
    if (next() < 0.14) {
      lines.push({ indent, tokens: [{ len: Math.min(room, 6 + Math.floor(next() * 10)), ink: COMMENT_INK }] })
      continue
    }
    const tokens = [{ len: 2 + Math.floor(next() * 5), ink: CODE_INK[0] ?? '#c792ea' }]
    let used = tokens[0]?.len ?? 0
    while (used < room - 3 && tokens.length < 4) {
      const len = Math.min(room - used - 1, 1 + Math.floor(next() * 7))
      tokens.push({ len, ink: CODE_INK[1 + Math.floor(next() * (CODE_INK.length - 1))] ?? '#82aaff' })
      used += len + 1
      if (next() < 0.25) {
        break
      }
    }
    lines.push({ indent, tokens })
    indent = next() < 0.4 && indent < 3 ? indent + 1 : next() < 0.35 && indent > 0 ? indent - 1 : indent
  }

  return lines
}

/** A screen's content, 52 x 26 around its own origin. */
function codeScreen(ctx: Ctx, variant: number): string {
  const lines = codeLines(variant)
  const charS = 0.085 + variant * 0.02
  const pause = 0.45
  const starts: number[] = []
  let t = 0.5
  for (const line of lines) {
    starts.push(t)
    t += chars(line) * charS + pause
  }
  const dur = t + 1.8
  const lineY = (i: number) => 6 + i * 4
  let content = ''
  lines.forEach((line, i) => {
    content += ctx.isAnimated
      ? `<rect x="2" y="${lineY(i)}" width="3" height="2" fill="#3b5068" opacity="0">${frames(ctx, 'opacity', [0, 1], [0, (starts[i] ?? 0) / dur], dur)}</rect>`
      : rect(2, lineY(i), 3, 2, '#3b5068')
    let x = 8 + line.indent * 4
    for (const token of line.tokens) {
      content += rect(x, lineY(i), token.len * 2, 2, token.ink)
      x += token.len * 2 + 2
    }
  })
  let covers = ''
  let scroll = ''
  if (ctx.isAnimated) {
    lines.forEach((line, i) => {
      const start = starts[i] ?? 0
      const from = 8 + line.indent * 4
      const steps = Array.from({ length: chars(line) + 1 }, (_, k) => from + k * 2)
      const times = steps.map((_, k) => (start + k * charS) / dur)
      const end = (start + chars(line) * charS + pause) / dur
      const isLast = i === lines.length - 1
      covers +=
        '<g>' +
        `<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="6;${steps.join(';')}" keyTimes="0;${keyTimes(times)}" ${timing(dur, 0)}/>` +
        rect(0, lineY(i), 60, 2, SCREEN_BG) +
        `<rect y="${lineY(i)}" width="2" height="2" fill="#e6edf3" opacity="0">` +
        frames(ctx, 'opacity', isLast ? [0, 1] : [0, 1, 0], isLast ? [0, start / dur] : [0, start / dur, end], dur) +
        '</rect></g>'
    })
    const scrolled = starts.slice(SHOWN_LINES).map((start, k) => ({ start, by: (k + 1) * 4 }))
    scroll = moves(ctx, ['0 0', ...scrolled.map(one => `0 ${-one.by}`)], [0, ...scrolled.map(one => one.start / dur)], dur)
  }

  return (
    `<clipPath id="bo-code-clip-${variant}"><rect x="0" y="4" width="52" height="22"/></clipPath>` +
    rect(0, 0, 52, 26, SCREEN_BG) +
    rect(0, 0, 52, 4, '#0b1119') + rect(2, 1, 2, 2, '#ff5f56') + rect(5, 1, 2, 2, '#ffbd2e') + rect(8, 1, 2, 2, '#27c93f') +
    rect(13, 1, 15, 3, '#16212e') + rect(15, 2, 9, 1, '#5c7085') +
    rect(0, 4, 6, 22, '#0d1520') +
    `<g clip-path="url(#bo-code-clip-${variant})"><g>${scroll}${content}${covers}</g></g>`
  )
}

function chars(line: CodeLine): number {
  return line.tokens.reduce((sum, token) => sum + token.len, 0) + Math.max(0, line.tokens.length - 1)
}

// A desk, its screen and the one who sits there.

function screen(ctx: Ctx, x: number, y: number, view: WorkerView | undefined): string {
  const sx = x + 49
  const sy = y + 3
  const glow = (color: string, opacity: number) =>
    `<ellipse cx="${x + 75}" cy="${y + 42}" rx="34" ry="8" fill="${color}" opacity="${opacity}"/>`
  const mood: Mood | 'leer' = view?.mood ?? 'leer'
  switch (mood) {
    case 'arbeitet':
      return use(ctx, `code${hash(view?.id ?? '') % CODE_VARIANTS}`, sx, sy) + `<ellipse cx="${x + 75}" cy="${y + 44}" rx="36" ry="9" fill="url(#bo-glow)"/>`
    case 'fertig': {
      const pr = view?.pr
      const check = (cx: number) =>
        `<polyline points="${cx - 9},${sy + 13} ${cx - 3},${sy + 19} ${cx + 9},${sy + 7}" fill="none" stroke="#5cd65c" stroke-width="3"/>`

      return (
        rect(sx, sy, 52, 26, '#0f2a1a') + rect(sx, sy, 52, 4, '#0b2014') + rect(sx + 2, sy + 1, 2, 2, '#27c93f') +
        (pr === undefined
          ? check(sx + 26)
          : check(sx + 13) +
            text(sx + 37, sy + 15, pr, pr.length > 5 ? 6.5 : 8, '#c8f7c8', ' text-anchor="middle" font-weight="bold"') +
            text(sx + 37, sy + 22, 'mergen', 5.5, '#7fd38f', ' text-anchor="middle"')) +
        glow('#5cd65c', 0.08)
      )
    }
    case 'neu':
      return (
        rect(sx, sy, 52, 26, '#16161c') + text(sx + 4, sy + 10, '>', 7, '#9e9e9e') +
        `<rect x="${sx + 10}" y="${sy + 5}" width="3" height="6" fill="#cfcfcf">${frames(ctx, 'opacity', [1, 0], [0, 0.5], 1.1)}</rect>`
      )
    case 'haengt':
      return (
        rect(sx, sy, 52, 26, '#24140f') +
        rect(sx + 8, sy + 6, 8, 2, '#c9a227') + rect(sx + 8, sy + 18, 8, 2, '#c9a227') +
        `<path d="M${sx + 9} ${sy + 8} h6 l-3 5 z M${sx + 9} ${sy + 18} h6 l-3 -5 z" fill="#e8c36a"/>` +
        rect(sx + 21, sy + 12, 24, 3, '#4a3a33') + rect(sx + 21, sy + 12, 8, 3, '#e8a33c') +
        `<g>${frames(ctx, 'opacity', [1, 0.2], [0, 0.5], 1.6)}${text(sx + 33, sy + 22, '…', 7, '#e8a33c', ' text-anchor="middle"')}</g>`
      )
    case 'fehler':
      return (
        `<rect x="${sx}" y="${sy}" width="52" height="26" fill="#b71c1c">${frames(ctx, 'fill', ['#b71c1c', '#8e1313'], [0, 0.5], 0.9)}</rect>` +
        `<path d="M${sx + 26} ${sy + 4} l11 19 h-22 z" fill="#ffd54f"/>` +
        text(sx + 26, sy + 21, '!', 12, '#3a0000', ' text-anchor="middle" font-weight="bold"') +
        glow('#ff3b3b', 0.12)
      )
    case 'frage':
    case 'freigabe':
      return rect(sx, sy, 52, 26, '#2a2410') + text(sx + 26, sy + 16, '→ Chef', 9, '#ffd54f', ' text-anchor="middle" font-weight="bold"')
    case 'weg':
    case 'leer':
      return rect(sx, sy, 52, 26, '#07080b')
  }
}

function desk(ctx: Ctx, x: number, y: number, view: WorkerView | undefined, decor: number): string {
  const extras = [['plant'], ['papers', 'mug'], ['lamp', 'plant'], ['papers', 'photo']][decor % 4] ?? []

  return (
    use(ctx, 'desk', x, y) +
    extras.map(id => use(ctx, id, x, y)).join('') +
    use(ctx, 'monitor', x, y) +
    screen(ctx, x, y, view) +
    use(ctx, 'glare', x, y) +
    use(ctx, 'kbd', x, y)
  )
}

function worker(ctx: Ctx, x: number, y: number, view: WorkerView): string {
  const palette = paletteOf(view)
  const ox = x + 57
  const back = y + 37
  const front = y + 46
  const seed = hash(view.id)
  switch (view.mood) {
    case 'arbeitet': {
      const hand = (hx: number, dur: number, begin: number) =>
        `<g>${moves(ctx, ['0 0', '0 -2', '0 0'], [0, 0.35, 0.7], dur, begin)}${sprite(HAND, palette, hx, back + 10)}</g>`

      return (
        (ctx.isAnimated ? use(ctx, 'keysOn', x, y) : '') +
        `<g>${moves(ctx, ['0 0', '0 1', '0 0'], [0, 0.46, 0.54], 3.4 + (seed % 5) / 5)}` +
        sprite(BACK_TYPING, palette, ox, back) + looks(view, palette, ox, back, 'back') + '</g>' +
        hand(ox + 2, 0.34, 0) + hand(ox + 30, 0.3, 0.17) +
        use(ctx, 'chair', x, y)
      )
    }
    case 'haengt':
      return (
        `<g>${moves(ctx, ['0 0', '0 1'], [0, 0.5], 2.6)}` +
        sprite(BACK_SLEEP, palette, ox, back) + looks(view, palette, ox, back + 4, 'back', false) +
        '</g>' +
        use(ctx, 'chair', x, y) +
        zzz(ctx, ox + 30, back + 4)
      )
    case 'fehler':
      return (
        `<g>${moves(ctx, ['0 0', '1 0', '-1 0', '0 0'], [0, 0.08, 0.16, 0.24], 2.2)}` +
        sprite(BACK_PANIC, palette, ox, back) + '</g>' +
        use(ctx, 'chair', x, y) +
        bubble(ctx, ox + 30, back - 18, '!', '#ff6b6b', '#ffffff')
      )
    case 'fertig':
      return use(ctx, 'chairHigh', x, y) + seatedFront(ctx, view, palette, ox, front, true)
    case 'neu':
      return use(ctx, 'chairHigh', x, y) + seatedFront(ctx, view, palette, ox, front, false)
    case 'frage':
    case 'freigabe':
    case 'weg':
      return use(ctx, 'chair', x + 8, y + 3)
  }
}

/** Turned round to the room: blinking, and with a coffee that goes to the mouth now and then. */
function seatedFront(ctx: Ctx, view: WorkerView, palette: Palette, ox: number, oy: number, hasCoffee: boolean): string {
  const seed = hash(view.id)
  const sipS = 6 + (seed % 4) * 0.7
  const begin = -((seed % 9) * 0.6)
  const eyes = (open: readonly number[], times: readonly number[]) =>
    `<g opacity="${open[0]}">${frames(ctx, 'opacity', open, times, hasCoffee ? sipS : 4.3, hasCoffee ? begin : 0)}` +
    rect(ox + 12, oy + 10, 2, 4, palette.S ?? '#f2c9a0') + rect(ox + 22, oy + 10, 2, 4, palette.S ?? '#f2c9a0') +
    rect(ox + 12, oy + 12, 2, 1, palette.E ?? '#231d26') + rect(ox + 22, oy + 12, 2, 1, palette.E ?? '#231d26') +
    '</g>'
  // a glint in each eye
  const body =
    sprite(hasCoffee ? FRONT_MUG : FRONT_SIT, palette, ox, oy) +
    rect(ox + 13, oy + 10, 1, 1, '#ffffff') + rect(ox + 23, oy + 10, 1, 1, '#ffffff') +
    looks(view, palette, ox, oy, 'front')
  if (!hasCoffee) {
    return body + (ctx.isAnimated ? eyes([0, 1, 0], [0, 0.94, 0.98]) : '')
  }
  const mug = (mx: number, my: number) =>
    rect(mx, my, 6, 7, '#ffffff') + rect(mx, my, 6, 1, '#6b3e1e') + rect(mx + 4, my + 1, 2, 6, '#e1e1e6') + rect(mx + 6, my + 2, 2, 3, '#e1e1e6')
  const hand = (hx: number, hy: number) => rect(hx, hy, 5, 3, palette.S ?? '#f2c9a0') + rect(hx, hy + 2, 5, 1, palette.s ?? '#d9b08a')
  const sleeve = (sx: number, sy: number, w: number, h: number) => rect(sx, sy, w, h, palette.T ?? '#4a7fd6') + rect(sx + w - 1, sy, 1, h, palette.D ?? '#33598f')
  const steam = (dx: number, delay: number) =>
    `<rect x="${ox + 29 + dx}" y="${oy + 22}" width="2" height="3" fill="#ffffff" opacity="0">` +
    frames(ctx, 'opacity', [0, 0.8, 0.4, 0], [0, 0.25, 0.6, 0.9], 2, delay) +
    frames(ctx, 'y', [oy + 22, oy + 19, oy + 16, oy + 13], [0, 0.25, 0.6, 0.9], 2, delay) +
    '</rect>'
  const pose = (values: readonly number[], times: readonly number[], inner: string) =>
    ctx.isAnimated ? `<g opacity="${values[0]}">${frames(ctx, 'opacity', values, times, sipS, begin)}${inner}</g>` : values[0] === 1 ? inner : ''
  // rest: the mug on the lap; mid: on its way; up: at the mouth, eyes closed
  const rest = pose([1, 0, 1], [0, 0.55, 0.9], mug(ox + 28, oy + 25) + hand(ox + 27, oy + 31) + steam(0, 0) + steam(3, 1))
  const mid = pose([0, 1, 0, 1, 0], [0, 0.55, 0.6, 0.85, 0.9], sleeve(ox + 28, oy + 22, 4, 8) + mug(ox + 23, oy + 18) + hand(ox + 22, oy + 24))
  const up = pose([0, 1, 0], [0, 0.6, 0.85], sleeve(ox + 26, oy + 18, 4, 10) + sleeve(ox + 22, oy + 16, 5, 4) + mug(ox + 17, oy + 12) + hand(ox + 17, oy + 18))

  return body + (ctx.isAnimated ? eyes([0, 1, 0, 1, 0], [0, 0.6, 0.85, 0.95, 0.98]) : '') + rest + mid + up
}

function zzz(ctx: Ctx, x: number, y: number): string {
  if (!ctx.isAnimated) {
    return text(x, y, 'z', 10, '#5b8def', ' font-weight="bold"')
  }
  const one = (label: string, begin: string, size: number) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="bold" fill="#5b8def" stroke="#ffffff" stroke-width="0.6" paint-order="stroke" opacity="0">${label}` +
    `<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${begin}" ${LOOP}/>` +
    `<animate attributeName="y" values="${y};${y - 14};${y - 20}" dur="2.4s" begin="${begin}" ${LOOP}/>` +
    `<animate attributeName="x" values="${x};${x + 4};${x + 8}" dur="2.4s" begin="${begin}" ${LOOP}/></text>`

  return one('z', '0s', 9) + one('Z', '1.2s', 12)
}

function interns(ctx: Ctx, x: number, y: number, view: WorkerView): string {
  const agents: readonly AgentRecord[] = view.agents
  if (agents.length === 0) {
    return ''
  }
  const palette = {
    ...paletteOf({ ...view, shirt: lighten(view.shirt, 0.55) }),
    H: view.hair === '#e2b65a' ? '#5a3825' : '#e2b65a',
    h: view.hair === '#e2b65a' ? '#7d5638' : '#f0d58f',
    G: view.hair === '#e2b65a' ? '#3a2416' : '#b38a3a',
  }
  const spots: readonly Point[] = [
    { x: x + 1, y: y + 60 },
    { x: x + 125, y: y + 60 },
  ]
  let out = ''
  agents.slice(0, spots.length).forEach((agent, i) => {
    const at = spots[i]
    if (at === undefined) {
      return
    }
    const isRunning = agent.status === 'running' || agent.status === 'pending'
    out +=
      `<g><title>${escapeXml(`Agent: ${agent.description || agent.type} (${agent.status})`)}</title>` +
      shadow(at.x + 12, at.y + 36, 11, 2.5) +
      sprite(INTERN, palette, at.x, at.y) +
      (isRunning ? dots(ctx, at.x + 7, at.y - 6) : '') +
      '</g>'
  })
  if (agents.length > spots.length) {
    out +=
      `<circle cx="${x + 141}" cy="${y + 54}" r="8" fill="#ffffff" stroke="#222" stroke-width="1"/>` +
      text(x + 141, y + 57, `+${agents.length - spots.length}`, 8, '#222', ' text-anchor="middle" font-weight="bold"')
  }

  return out
}

function dots(ctx: Ctx, x: number, y: number): string {
  return [0, 4, 8]
    .map(
      (dx, i) =>
        `<rect x="${x + dx}" y="${y}" width="2" height="2" fill="#333">` +
        `${ctx.isAnimated ? `<animate attributeName="opacity" values="0.2;1;0.2" dur="0.9s" begin="${i * 0.3}s" ${LOOP}/>` : ''}</rect>`,
    )
    .join('')
}

function nameTag(x: number, y: number, view: WorkerView | undefined): string {
  if (view === undefined) {
    return text(x + 75, y + 122, 'frei', 9, '#7a6448', ' text-anchor="middle"')
  }
  const color = MOOD_COLOR[view.mood]
  const name = view.isSelf ? `${view.name} (hier)` : view.name
  const line = view.mood === 'fertig' && view.pr !== undefined ? `${view.pr} bereit · ${view.project}` : `${view.project} · ${moodLabel(view)}`

  return (
    `<g${view.mood === 'weg' ? ' opacity="0.55"' : ''}>` +
    rect(x + 18, y + 110, 118, 26, '#000', ' opacity="0.13" rx="4"') +
    `<rect x="${x + 16}" y="${y + 108}" width="118" height="26" rx="4" fill="#fffdf6" stroke="#cdbf9f" stroke-width="1"/>` +
    rect(x + 18, y + 109, 114, 1, '#ffffff') +
    `<circle cx="${x + 26}" cy="${y + 117}" r="4.5" fill="${darken(color, 0.25)}"/><circle cx="${x + 26}" cy="${y + 117}" r="3.5" fill="${color}"/>` +
    rect(x + 24, y + 115, 2, 1, '#ffffff', ' opacity="0.6"') +
    text(x + 34, y + 120, clip(name, 15), 10, '#222', ' font-weight="bold"') +
    text(x + 26, y + 130, clip(line, 26), 7, '#555') +
    '</g>'
  )
}

function tooltip(view: WorkerView): string {
  const lines = [
    `${view.name} · ${view.project}`,
    `${moodLabel(view)} (seit ${view.minutesInMood} Min.)`,
    view.task === '' ? '' : `Auftrag: ${clip(view.task, 100)}`,
    view.activity === '' ? '' : `Gerade: ${view.activity}`,
    view.question === undefined ? '' : `Frage: ${clip(view.question, 100)}`,
    view.agents.length === 0 ? '' : `Agents: ${view.agents.length}`,
  ]

  return `<title>${escapeXml(lines.filter(line => line !== '').join('\n'))}</title>`
}

function flights(office: OfficeView, at: ReadonlyMap<string, Point>, ctx: Ctx): string {
  let out = ''
  for (const message of office.messages) {
    const from = at.get(message.fromId)
    const to = message.toId === undefined ? undefined : at.get(message.toId)
    if (from === undefined || to === undefined || from === to) {
      continue
    }
    const path = `M${from.x} ${from.y} L${to.x} ${to.y}`
    out +=
      `<g><title>${escapeXml(message.text)}</title>` +
      `<path d="${path}" fill="none" stroke="#ffcc33" stroke-width="2" stroke-dasharray="5 5" opacity="0.9">` +
      (ctx.isAnimated ? `<animate attributeName="stroke-dashoffset" values="20;0" dur="0.8s" ${LOOP}/>` : '') +
      '</path>' +
      (ctx.isAnimated ? `<g>${envelope(-5, -4)}<animateMotion path="${path}" dur="2.2s" ${LOOP}/></g>` : '') +
      '</g>'
  }

  return out
}

/**
 * The whole office as one SVG document. `arriving` names visitors that just
 * came into the boss office: they walk in from the door before they sit.
 * Past `limit` characters it drops the animation; the engine's pane needs
 * that, a page does not.
 */
export function drawOffice(
  office: OfficeView,
  isAnimated = true,
  arriving: readonly string[] = [],
  limit = SOURCE_LIMIT,
): string {
  const ctx: Ctx = { isAnimated, need: new Set() }
  const all = office.workers
  const atDesks = all.slice(0, MAX_DESKS)
  const visitors = all.filter(view => view.mood === 'frage' || view.mood === 'freigabe')
  const slots = Math.max(COLS, Math.ceil(atDesks.length / COLS) * COLS)
  const height = TOP_H + (slots / COLS) * CELL_H + 6
  const at = new Map<string, Point>([['chef', { x: 470, y: 70 }]])

  let desks = ''
  for (let i = 0; i < slots; i += 1) {
    const origin = deskOrigin(i)
    const view = atDesks[i] as WorkerView | undefined
    desks += view === undefined ? '' : `<g data-worker="${escapeXml(view.id)}" class="worker">${tooltip(view)}`
    desks += desk(ctx, origin.x, origin.y, view, hash(view?.id ?? `desk${i}`))
    if (view !== undefined) {
      desks += worker(ctx, origin.x, origin.y, view) + interns(ctx, origin.x, origin.y, view)
      if (view.hasMail) {
        desks += bounce(ctx, envelope(origin.x + 28, origin.y + 38), 0.8)
      }
      at.set(view.id, { x: origin.x + 75, y: origin.y + 60 })
    } else {
      desks += use(ctx, 'chair', origin.x, origin.y)
    }
    desks += nameTag(origin.x, origin.y, view)
    desks += view === undefined ? '' : '</g>'
  }
  visitors.slice(0, MAX_VISITORS).forEach((view, slot) => {
    const seat = guestSeat(slot)
    at.set(view.id, { x: seat.x, y: seat.y - 10 })
  })
  const more =
    all.length > MAX_DESKS
      ? text(WIDTH - 8, height - 10, `+${all.length - MAX_DESKS} weitere`, 11, '#3a2a14', ' text-anchor="end" font-weight="bold"')
      : ''

  const body =
    background(ctx, height, office) + bossOffice(ctx, office, visitors, new Set(arriving)) + desks + flights(office, at, ctx) + more
  const svg = compact(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
      `viewBox="0 0 ${WIDTH} ${height}" shape-rendering="crispEdges" ` +
      `font-family="ui-monospace, Menlo, Consolas, monospace">${defsOf(ctx)}${body}</svg>`,
  )

  if (svg.length > limit && isAnimated) {
    return drawOffice({ ...office, workers: office.workers.map(view => ({ ...view, agents: [] })), messages: [] }, false)
  }

  return svg
}

const PLAIN_RECT = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"\/>/g
const RECT_RUN = new RegExp(`(?:${PLAIN_RECT.source}){2,}`, 'g')

type Box = { x: number; y: number; w: number; h: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Merges each run of plain sibling rects into a few paths, one per color,
 * without changing the picture: a rect joins an earlier path of its color
 * only when nothing drawn in between overlaps it.
 */
export function compact(svg: string): string {
  return svg.replace(RECT_RUN, run => {
    const paths: { fill: string; d: string; boxes: Box[] }[] = []
    for (const found of run.matchAll(PLAIN_RECT)) {
      const [, x = '0', y = '0', w = '0', h = '0', fill = ''] = found
      const box = { x: Number(x), y: Number(y), w: Number(w), h: Number(h) }
      let target: (typeof paths)[number] | undefined
      for (let i = paths.length - 1; i >= 0; i -= 1) {
        const path = paths[i]
        if (path === undefined) {
          continue
        }
        if (path.fill === fill) {
          target = path
          break
        }
        if (path.boxes.some(other => overlaps(other, box))) {
          break
        }
      }
      if (target === undefined) {
        target = { fill, d: '', boxes: [] }
        paths.push(target)
      }
      target.boxes.push(box)
      target.d += `M${x} ${y}h${w}v${h}h-${w}z`
    }

    return paths.map(path => `<path fill="${path.fill}" d="${path.d}"/>`).join('')
  })
}

/** A sentence for readers that cannot see the drawing. */
export function describeOffice(office: OfficeView): string {
  if (office.workers.length === 0) {
    return 'Das Büro ist leer.'
  }
  const parts = office.workers.map(view => `${view.name} (${view.project}) ${moodLabel(view)}`)

  return `Büro mit ${office.workers.length} Mitarbeitern: ${parts.join('; ')}.`
}
