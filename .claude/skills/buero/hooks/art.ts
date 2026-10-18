// Draws the office as one pixel-art SVG. Pure: an OfficeView in, markup out.

import type { AgentRecord, Mood, OfficeView, WorkerView } from '../types'
import { MOOD_COLOR, MOOD_LABEL, clip, hash } from './model'

export const WIDTH = 600
const WALL_H = 44
const TOP_H = 196
const CELL_W = 150
const CELL_H = 128
const COLS = 4
const PX = 3
const MAX_DESKS = 24
const MAX_VISITORS = 6
/** The engine refuses an Svg source past 131072 characters. */
const SOURCE_LIMIT = 125_000

type Palette = Record<string, string>
type Point = { x: number; y: number }

const STAND = [
  '..HHHH..',
  '.HHHHHH.',
  '.HSSSSH.',
  '.SESSES.',
  '.SSSSSS.',
  '..SMMS..',
  '.TTTTTT.',
  'TTTTTTTT',
  'TTTTTTTT',
  'SPPPPPPS',
  '.PP..PP.',
  '.PP..PP.',
  '.KK..KK.',
]

const SEAT_BACK = [
  '..HHHH..',
  '.HHHHHH.',
  '.HHHHHH.',
  '.HHHHHH.',
  '.SHHHHS.',
  '..HHHH..',
  '.TTTTTT.',
  'TTTTTTTT',
  'TTTTTTTT',
  'TTTTTTTT',
]

const SEAT_FRONT = [
  '..HHHH..',
  '.HHHHHH.',
  '.HSSSSH.',
  '.SESSES.',
  '.SSSSSS.',
  '..SMMS..',
  '.TTTTTT.',
  'TTTTTTTT',
  'TTTTTTTT',
  'TTTTTTTT',
  'PPPPPPPP',
]

const BOSS = [
  '..HHHH..',
  '.HHHHHH.',
  '.HSSSSH.',
  '.SGGGGS.',
  '.SSSSSS.',
  '..SMMS..',
  '.TTWWTT.',
  'TTTRRTTT',
  'TTTRRTTT',
  'TTTTTTTT',
]

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function paletteOf(worker: Pick<WorkerView, 'shirt' | 'hair' | 'skin'>): Palette {
  return {
    H: worker.hair,
    S: worker.skin,
    E: '#222',
    M: '#b0604a',
    T: worker.shirt,
    P: '#3b3b58',
    K: '#222',
    G: '#111',
    W: '#fff',
    R: '#c0392b',
  }
}

/** One rect per run of a color in a row, so a sprite stays a few dozen rects. */
export function sprite(rows: readonly string[], palette: Palette, x: number, y: number, px = PX): string {
  let out = ''
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const ch = row.charAt(c)
      let end = c + 1
      while (end < row.length && row[end] === ch) {
        end += 1
      }
      const fill = palette[ch]
      if (ch !== '.' && fill !== undefined) {
        out += rect(x + c * px, y + r * px, (end - c) * px, px, fill)
      }
      c = end
    }
  })

  return out
}

function rect(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`
}

function text(x: number, y: number, body: string, size: number, fill: string, extra = ''): string {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${extra}>${escapeXml(body)}</text>`
}

function lighten(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function bounce(inner: string, dur = '1s'): string {
  return (
    `<g>${inner}<animateTransform attributeName="transform" type="translate" ` +
    `values="0 0;0 -3;0 0" dur="${dur}" repeatCount="indefinite"/></g>`
  )
}

function bubble(x: number, y: number, label: string, fill: string, color: string, isAnimated: boolean): string {
  const w = Math.max(16, label.length * 7 + 8)
  const inner =
    `<rect x="${x}" y="${y}" width="${w}" height="15" rx="3" fill="${fill}" stroke="#222" stroke-width="1"/>` +
    `<path d="M${x + 6} ${y + 15} l4 5 l3 -5 z" fill="${fill}" stroke="#222" stroke-width="1"/>` +
    rect(x + 5, y + 14, 9, 2, fill) +
    text(x + w / 2, y + 11, label, 11, color, ' font-weight="bold" text-anchor="middle"')

  return isAnimated ? bounce(inner) : `<g>${inner}</g>`
}

function envelope(x: number, y: number): string {
  return (
    rect(x, y, 10, 7, '#fff', ' stroke="#b8860b" stroke-width="1"') +
    `<path d="M${x} ${y} l5 4 l5 -4" fill="none" stroke="#b8860b" stroke-width="1"/>`
  )
}

function deskOrigin(index: number): Point {
  return { x: (index % COLS) * CELL_W, y: TOP_H + Math.floor(index / COLS) * CELL_H }
}

function visitorOrigin(slot: number): Point {
  return { x: 318 + slot * 46, y: 132 }
}

function background(height: number, office: OfficeView): string {
  const floor: string[] = []
  for (let row = 0; TOP_H + row * 16 < height; row += 1) {
    const y = TOP_H + row * 16
    floor.push(rect(0, y + 15, WIDTH, 1, '#b48f63'))
    for (let x = row % 2 === 0 ? 70 : 150; x < WIDTH; x += 160) {
      floor.push(rect(x, y, 1, 15, '#b48f63'))
    }
  }
  const tiles: string[] = []
  for (let row = 0; WALL_H + row * 16 < TOP_H; row += 1) {
    for (let x = row % 2 === 0 ? 0 : 16; x < 296; x += 32) {
      tiles.push(rect(x, WALL_H + row * 16, 16, 16, '#d4ccbb'))
    }
  }

  return (
    rect(0, 0, WIDTH, height, '#c9a67a') +
    floor.join('') +
    // kitchen floor and wall
    rect(0, WALL_H, 296, TOP_H - WALL_H, '#e4ddcf') +
    tiles.join('') +
    rect(0, 0, 296, WALL_H, '#efe8da') +
    rect(0, WALL_H - 4, 296, 4, '#b9ab92') +
    officeWindow(22) +
    officeWindow(112) +
    noticeBoard(office.messages.length) +
    kitchen()
  )
}

function officeWindow(x: number): string {
  return (
    rect(x, 7, 62, 28, '#ffffff') +
    rect(x + 3, 10, 56, 22, '#9fd3f5') +
    rect(x + 30, 10, 2, 22, '#ffffff') +
    rect(x + 3, 20, 56, 2, '#ffffff') +
    rect(x + 8, 24, 14, 4, '#ffffff', ' opacity="0.7"')
  )
}

function noticeBoard(count: number): string {
  const label = count === 0 ? 'keine Post' : `Post: ${count}`

  return (
    `<g><title>${escapeXml(`Nachrichten der letzten 90 Sekunden: ${count}`)}</title>` +
    rect(200, 6, 84, 31, '#a0784e') +
    rect(203, 9, 78, 25, '#d9b98c') +
    rect(207, 12, 16, 12, '#fffbe6') +
    rect(226, 13, 14, 10, '#ffe08a') +
    text(242, 30, label, 9, '#3a2a14', ' text-anchor="middle" font-weight="bold"') +
    '</g>'
  )
}

function kitchen(): string {
  return (
    // counter with coffee machine
    rect(8, 80, 118, 16, '#9a8f80') +
    rect(8, 76, 118, 4, '#c2b8a8') +
    rect(18, 50, 26, 26, '#4a4a4a') +
    rect(22, 54, 18, 8, '#2a2a2a') +
    rect(37, 66, 3, 3, '#e53935') +
    rect(27, 68, 8, 8, '#ffffff') +
    rect(60, 66, 8, 10, '#ffffff') +
    rect(68, 68, 2, 5, '#ffffff') +
    // water cooler
    rect(140, 52, 18, 14, '#8fd0ff', ' opacity="0.85"') +
    rect(138, 66, 22, 28, '#e8e8e8') +
    rect(145, 72, 8, 4, '#3d8bfd') +
    // couch and table
    rect(170, 134, 112, 12, '#8e5b3a') +
    rect(170, 146, 112, 22, '#a86c45') +
    rect(166, 140, 8, 30, '#7a4a2e') +
    rect(278, 140, 8, 30, '#7a4a2e') +
    rect(200, 112, 48, 6, '#6d4630') +
    rect(220, 118, 8, 14, '#6d4630') +
    // plant
    rect(254, 92, 18, 18, '#3e8e41') +
    rect(258, 86, 10, 10, '#56b35a') +
    rect(256, 110, 14, 14, '#b5651d') +
    text(14, 186, 'Küche', 10, '#7a6a52', ' font-weight="bold"')
  )
}

function bossOffice(office: OfficeView, visitors: readonly WorkerView[]): string {
  const minutes = office.clockMinutes
  const hourAngle = ((minutes / 60) % 12) * 30
  const minuteAngle = (minutes % 60) * 6
  let out =
    rect(296, 0, WIDTH - 296, WALL_H, '#ddd2c0') +
    rect(296, WALL_H - 4, WIDTH - 296, 4, '#a89a80') +
    rect(302, WALL_H, WIDTH - 302, TOP_H - WALL_H - 4, '#5d6d8c') +
    // brass sign
    rect(318, 10, 104, 22, '#c9a227') +
    rect(321, 13, 98, 16, '#e0bd45') +
    text(370, 26, 'CHEFBÜRO', 12, '#3a2a00', ' text-anchor="middle" font-weight="bold"') +
    // wall clock
    `<circle cx="566" cy="22" r="13" fill="#ffffff" stroke="#555" stroke-width="2"/>` +
    `<line x1="566" y1="22" x2="566" y2="15" stroke="#222" stroke-width="2" transform="rotate(${hourAngle} 566 22)"/>` +
    `<line x1="566" y1="22" x2="566" y2="12" stroke="#222" stroke-width="1" transform="rotate(${minuteAngle} 566 22)"/>` +
    // glass walls with a door at the bottom
    rect(296, WALL_H, 6, TOP_H - WALL_H, '#bfe3f2', ' opacity="0.9"') +
    rect(296, TOP_H - 4, 34, 4, '#bfe3f2') +
    rect(384, TOP_H - 4, WIDTH - 384, 4, '#bfe3f2') +
    // plant
    rect(572, 140, 18, 18, '#3e8e41') +
    rect(576, 134, 10, 10, '#56b35a') +
    rect(574, 158, 14, 14, '#b5651d') +
    // the boss: you
    rect(480, 50, 40, 34, '#3b2a20') +
    sprite(BOSS, { ...paletteOf({ shirt: '#2f3640', hair: '#3a2a1a', skin: '#f2c9a0' }) }, 488, 54) +
    rect(430, 80, 140, 26, '#6b3e26') +
    rect(430, 106, 140, 8, '#4e2c1a') +
    rect(440, 66, 30, 16, '#2d2d38') +
    rect(443, 69, 24, 10, '#5b8def') +
    rect(482, 98, 36, 10, '#c9a227') +
    text(500, 106, 'DU', 8, '#3a2a00', ' text-anchor="middle" font-weight="bold"')

  visitors.slice(0, MAX_VISITORS).forEach((worker, slot) => {
    const at = visitorOrigin(slot)
    const isPermission = worker.mood === 'freigabe'
    const tip = `${worker.name} · ${worker.project} – ${MOOD_LABEL[worker.mood]}${
      worker.question === undefined ? '' : `: ${worker.question}`
    }`
    out +=
      `<g data-worker="${escapeXml(worker.id)}" class="worker"><title>${escapeXml(tip)}</title>` +
      sprite(STAND, paletteOf(worker), at.x, at.y) +
      bubble(at.x - 2, at.y - 22, isPermission ? 'OK?' : '?', isPermission ? '#ffe066' : '#ffb84d', '#222', true) +
      text(at.x + 12, at.y + 50, clip(worker.name, 7), 8, '#ffffff', ' text-anchor="middle" font-weight="bold"') +
      '</g>'
  })
  if (visitors.length > MAX_VISITORS) {
    out += text(586, 186, `+${visitors.length - MAX_VISITORS}`, 10, '#ffffff', ' text-anchor="end" font-weight="bold"')
  }

  return out
}

function screen(x: number, y: number, mood: Mood | 'leer'): string {
  // the screen's inner area: 44 x 26 at (x, y)
  switch (mood) {
    case 'arbeitet':
      return (
        rect(x, y, 44, 26, '#10202c') +
        codeLine(x + 4, y + 5, '#4caf50', '2.4s') +
        codeLine(x + 4, y + 11, '#64b5f6', '1.7s') +
        codeLine(x + 4, y + 17, '#ffd54f', '3.1s')
      )
    case 'fertig':
      return (
        rect(x, y, 44, 26, '#12301a') +
        `<polyline points="${x + 12},${y + 13} ${x + 19},${y + 20} ${x + 32},${y + 6}" fill="none" stroke="#5cd65c" stroke-width="3"/>`
      )
    case 'neu':
      return (
        rect(x, y, 44, 26, '#1f1f24') +
        `<rect x="${x + 5}" y="${y + 6}" width="3" height="7" fill="#cfcfcf">` +
        '<animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite"/></rect>'
      )
    case 'haengt':
      return rect(x, y, 44, 26, '#2b1414') + rect(x + 6, y + 11, 32, 4, '#555') + rect(x + 6, y + 11, 11, 4, '#e53935')
    case 'fehler':
      return rect(x, y, 44, 26, '#b71c1c') + text(x + 22, y + 21, '!', 20, '#ffffff', ' text-anchor="middle" font-weight="bold"')
    case 'frage':
    case 'freigabe':
      return rect(x, y, 44, 26, '#2a2a10') + text(x + 22, y + 17, '→ Chef', 9, '#ffd54f', ' text-anchor="middle"')
    case 'weg':
    case 'leer':
      return rect(x, y, 44, 26, '#050505')
  }
}

function codeLine(x: number, y: number, color: string, dur: string): string {
  return (
    `<rect x="${x}" y="${y}" width="20" height="3" fill="${color}">` +
    `<animate attributeName="width" values="4;34;4" dur="${dur}" repeatCount="indefinite"/></rect>`
  )
}

function desk(x: number, y: number, mood: Mood | 'leer', decor: number): string {
  return (
    // desk top, front edge and legs
    rect(x + 18, y + 30, 114, 24, '#b5835a') +
    rect(x + 18, y + 54, 114, 8, '#8a5a3c') +
    rect(x + 22, y + 62, 4, 10, '#6d4630') +
    rect(x + 124, y + 62, 4, 10, '#6d4630') +
    // monitor
    rect(x + 50, y + 2, 50, 34, '#2d2d38') +
    screen(x + 53, y + 5, mood) +
    rect(x + 71, y + 36, 8, 6, '#2d2d38') +
    rect(x + 64, y + 41, 22, 3, '#2d2d38') +
    // keyboard
    rect(x + 56, y + 45, 38, 5, '#e6e6e6') +
    // a plant or a stack of paper on some desks
    (decor % 3 === 0
      ? rect(x + 112, y + 20, 12, 10, '#3e8e41') + rect(x + 113, y + 30, 10, 8, '#b5651d')
      : decor % 3 === 1
        ? rect(x + 24, y + 34, 16, 12, '#ffffff') + rect(x + 26, y + 32, 16, 12, '#f4f4f4')
        : '')
  )
}

function chair(x: number, y: number, isEmpty: boolean): string {
  const backTop = isEmpty ? y + 60 : y + 68

  return (
    `<rect x="${x + 59}" y="${backTop}" width="32" height="${y + 88 - backTop}" rx="4" fill="#4a4a5a"/>` +
    rect(x + 73, y + 88, 4, 6, '#333') +
    rect(x + 62, y + 94, 26, 3, '#333')
  )
}

function worker(x: number, y: number, view: WorkerView): string {
  const palette = paletteOf(view)
  const sx = x + 63
  const sy = y + 44
  switch (view.mood) {
    case 'arbeitet':
      return (
        sprite(SEAT_BACK, palette, sx, sy) +
        arm(sx - 3, sy + 21, view.shirt, '0s') +
        arm(sx + 24, sy + 21, view.shirt, '0.18s') +
        chair(x, y, false)
      )
    case 'haengt':
      return (
        `<g transform="translate(0 5)">${sprite(SEAT_BACK.slice(0, 6), palette, sx, sy)}</g>` +
        sprite(SEAT_BACK.slice(6), palette, sx, sy + 18) +
        chair(x, y, false) +
        zzz(sx + 26, sy + 4)
      )
    case 'fehler':
      return (
        sprite(SEAT_BACK, palette, sx, sy) +
        chair(x, y, false) +
        bubble(sx + 3, sy - 22, '!', '#ff6b6b', '#ffffff', true)
      )
    case 'fertig':
      return (
        chair(x, y, false) +
        sprite(SEAT_FRONT, palette, sx, sy) +
        mug(sx + 15, sy + 22)
      )
    case 'neu':
      return chair(x, y, false) + sprite(SEAT_FRONT, palette, sx, sy)
    case 'frage':
    case 'freigabe':
    case 'weg':
      return chair(x, y, true)
  }
}

function arm(x: number, y: number, color: string, begin: string): string {
  return (
    `<rect x="${x}" y="${y}" width="3" height="7" fill="${color}">` +
    `<animate attributeName="y" values="${y};${y - 2};${y}" dur="0.36s" begin="${begin}" repeatCount="indefinite"/></rect>`
  )
}

function mug(x: number, y: number): string {
  const steam = (dx: number, begin: string) =>
    `<rect x="${x + dx}" y="${y - 6}" width="2" height="4" fill="#dddddd" opacity="0">` +
    `<animate attributeName="opacity" values="0;0.9;0" dur="1.6s" begin="${begin}" repeatCount="indefinite"/>` +
    `<animate attributeName="y" values="${y - 4};${y - 10};${y - 4}" dur="1.6s" begin="${begin}" repeatCount="indefinite"/></rect>`

  return rect(x, y, 7, 7, '#ffffff') + rect(x + 7, y + 2, 2, 3, '#ffffff') + steam(1, '0s') + steam(4, '0.8s')
}

function zzz(x: number, y: number): string {
  const one = (label: string, begin: string, size: number) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-weight="bold" fill="#5b8def" opacity="0">${label}` +
    `<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${begin}" repeatCount="indefinite"/>` +
    `<animate attributeName="y" values="${y};${y - 14};${y - 20}" dur="2.4s" begin="${begin}" repeatCount="indefinite"/></text>`

  return one('z', '0s', 9) + one('Z', '1.2s', 12)
}

function interns(x: number, y: number, view: WorkerView): string {
  const agents: readonly AgentRecord[] = view.agents
  if (agents.length === 0) {
    return ''
  }
  const palette = {
    ...paletteOf(view),
    T: lighten(view.shirt, 0.55),
    H: view.hair === '#e2b65a' ? '#5a3825' : '#e2b65a',
  }
  const spots: readonly Point[] = [
    { x: x + 1, y: y + 62 },
    { x: x + 133, y: y + 62 },
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
      sprite(STAND, palette, at.x, at.y, 2) +
      (isRunning ? dots(at.x + 2, at.y - 5) : '') +
      '</g>'
  })
  if (agents.length > spots.length) {
    out +=
      `<circle cx="${x + 141}" cy="${y + 56}" r="8" fill="#ffffff" stroke="#222" stroke-width="1"/>` +
      text(x + 141, y + 59, `+${agents.length - spots.length}`, 8, '#222', ' text-anchor="middle" font-weight="bold"')
  }

  return out
}

function dots(x: number, y: number): string {
  return [0, 4, 8]
    .map(
      (dx, i) =>
        `<rect x="${x + dx}" y="${y}" width="2" height="2" fill="#333">` +
        `<animate attributeName="opacity" values="0.2;1;0.2" dur="0.9s" begin="${i * 0.3}s" repeatCount="indefinite"/></rect>`,
    )
    .join('')
}

function nameTag(x: number, y: number, view: WorkerView | undefined): string {
  if (view === undefined) {
    return text(x + 75, y + 116, 'frei', 9, '#7a6448', ' text-anchor="middle"')
  }
  const color = MOOD_COLOR[view.mood]
  const name = view.isSelf ? `${view.name} (hier)` : view.name

  return (
    `<g${view.mood === 'weg' ? ' opacity="0.55"' : ''}>` +
    `<rect x="${x + 16}" y="${y + 100}" width="118" height="26" rx="4" fill="#fffdf6" stroke="#cdbf9f" stroke-width="1"/>` +
    `<circle cx="${x + 26}" cy="${y + 109}" r="4" fill="${color}"/>` +
    text(x + 34, y + 112, clip(name, 15), 10, '#222', ' font-weight="bold"') +
    text(x + 26, y + 123, clip(`${view.project} · ${MOOD_LABEL[view.mood]}`, 24), 7, '#555') +
    '</g>'
  )
}

function tooltip(view: WorkerView): string {
  const lines = [
    `${view.name} · ${view.project}`,
    `${MOOD_LABEL[view.mood]} (seit ${view.minutesInMood} Min.)`,
    view.task === '' ? '' : `Auftrag: ${clip(view.task, 100)}`,
    view.activity === '' ? '' : `Gerade: ${view.activity}`,
    view.question === undefined ? '' : `Frage: ${clip(view.question, 100)}`,
    view.agents.length === 0 ? '' : `Agents: ${view.agents.length}`,
  ]

  return `<title>${escapeXml(lines.filter(line => line !== '').join('\n'))}</title>`
}

function flights(office: OfficeView, at: ReadonlyMap<string, Point>): string {
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
      '<animate attributeName="stroke-dashoffset" values="20;0" dur="0.8s" repeatCount="indefinite"/></path>' +
      `<g>${envelope(-5, -4)}<animateMotion path="${path}" dur="2.2s" repeatCount="indefinite"/></g>` +
      '</g>'
  }

  return out
}

/** The whole office as one SVG document. */
export function drawOffice(office: OfficeView, isAnimated = true): string {
  const all = office.workers
  const atDesks = all.slice(0, MAX_DESKS)
  const visitors = all.filter(view => view.mood === 'frage' || view.mood === 'freigabe')
  const slots = Math.max(COLS, Math.ceil(atDesks.length / COLS) * COLS)
  const height = TOP_H + (slots / COLS) * CELL_H + 6
  const at = new Map<string, Point>([['chef', { x: 500, y: 92 }]])

  let desks = ''
  for (let i = 0; i < slots; i += 1) {
    const origin = deskOrigin(i)
    const view = atDesks[i] as WorkerView | undefined
    const mood = view?.mood ?? 'leer'
    desks += view === undefined ? '' : `<g data-worker="${escapeXml(view.id)}" class="worker">${tooltip(view)}`
    desks += desk(origin.x, origin.y, mood, hash(view?.id ?? `desk${i}`))
    if (view !== undefined) {
      desks += worker(origin.x, origin.y, view) + interns(origin.x, origin.y, view)
      if (view.hasMail) {
        desks += bounce(envelope(origin.x + 100, origin.y + 46), '0.8s')
      }
      at.set(view.id, { x: origin.x + 75, y: origin.y + 60 })
    } else {
      desks += chair(origin.x, origin.y, true)
    }
    desks += nameTag(origin.x, origin.y, view)
    desks += view === undefined ? '' : '</g>'
  }
  visitors.slice(0, MAX_VISITORS).forEach((view, slot) => {
    const origin = visitorOrigin(slot)
    at.set(view.id, { x: origin.x + 12, y: origin.y + 18 })
  })
  const more =
    all.length > MAX_DESKS
      ? text(WIDTH - 8, height - 10, `+${all.length - MAX_DESKS} weitere`, 11, '#3a2a14', ' text-anchor="end" font-weight="bold"')
      : ''

  const body =
    background(height, office) + bossOffice(office, visitors) + desks + flights(office, at) + more
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" ` +
    `viewBox="0 0 ${WIDTH} ${height}" shape-rendering="crispEdges" ` +
    `font-family="ui-monospace, Menlo, Consolas, monospace">${body}</svg>`

  if (svg.length > SOURCE_LIMIT && isAnimated) {
    return drawOffice({ ...office, workers: office.workers.map(view => ({ ...view, agents: [] })), messages: [] }, false)
  }

  return isAnimated ? svg : stripAnimation(svg)
}

function stripAnimation(svg: string): string {
  return svg.replace(/<animate[^>]*\/>/g, '').replace(/<animateTransform[^>]*\/>/g, '').replace(/<animateMotion[^>]*\/>/g, '')
}

/** A sentence for readers that cannot see the drawing. */
export function describeOffice(office: OfficeView): string {
  if (office.workers.length === 0) {
    return 'Das Büro ist leer.'
  }
  const parts = office.workers.map(view => `${view.name} (${view.project}) ${MOOD_LABEL[view.mood]}`)

  return `Büro mit ${office.workers.length} Mitarbeitern: ${parts.join('; ')}.`
}
