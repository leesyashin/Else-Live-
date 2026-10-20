import { expect, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import { mergeVerdict } from '../hooks/dienst'
import type { DienstCtx } from '../hooks/dienst'
import { START, START_EVENT, listOf, mockStore, mockWorld, said, session } from './welt'

test('the Chef vom Dienst carries out commands from the page and hands the rest to its model', async ($, on) => {
  const files = new Map<string, string>()
  const clock = mockWorld(on, files, 'cse_01CVD')
  const db = mockStore(on)
  const cvd = session('session_01CVD', { tags: ['buero:rolle=cvd'] })
  const other = session('session_01OTHER')
  const calls: string[] = []
  const prompts: string[] = []
  on('mcp.call', ($, e) => {
    calls.push(`${e.tool} ${JSON.stringify(e.args)}`)
    switch (e.tool) {
      case 'list_sessions':
        return listOf([cvd, other])
      case 'get_session':
        return said(JSON.stringify({ ccr: cvd }))
      default:
        return said('ok')
    }
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('tool.call', { tool: 'ArtifactComments' }, () => ({ result: 'Durable wake subscription registered' }))
  on('tool.call', { tool: 'PushNotification' }, () => ({ result: 'not sent' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '4711\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  db.put('kommandos/k-1', { text: 'Hol jemanden für die Login-Seite', createdAt: START, state: 'neu', von: 'chef' })
  db.put('kommandos/k-2', { text: 'Pausieren', createdAt: START + 1, state: 'neu', von: 'chef', aktion: { typ: 'pausieren', session: 'session_01OTHER' } })

  await $.session.start(START_EVENT)
  await clock.advance(5000)
  // the office is watched for comments, the structured command is carried out, the other goes to the model
  expect(calls.some(one => one.startsWith('interrupt_session') && one.includes('session_01OTHER'))).toBe(true)
  expect(db.get('kommandos/k-2')?.state).toBe('erledigt')
  expect(db.get('kommandos/k-2')?.result).toContain('pausiert')
  expect(db.get('kommandos/k-1')?.state).toBe('angenommen')
  expect(prompts.some(text => text.includes('[Büro] Kommando k-1 vom Chef') && text.includes('Hol jemanden'))).toBe(true)

  // the model closes the command itself
  const closed = await $.tool.call({ tool: 'mcp__buero__kommando', aktion: 'erledigt', id: 'k-1', ergebnis: 'Session gestartet.' } as never)
  expect(JSON.stringify(closed)).toContain('erledigt')
  expect(db.get('kommandos/k-1')?.state).toBe('erledigt')
  expect(db.get('kommandos/k-1')?.result).toBe('Session gestartet.')

  // a command the model does not close is closed with what it answered
  db.put('kommandos/k-3', { text: 'Was macht Ella?', createdAt: START + 2, state: 'neu', von: 'chef' })
  await clock.advance(15_000)
  expect(db.get('kommandos/k-3')?.state).toBe('angenommen')
  await $.turn.start({ text: prompts.at(-1) ?? '', turnId: 't1' })
  await $.turn.complete({ reason: 'answer', answer: 'Ella baut gerade die Karte.', durationMs: 10, isAborted: false, turnId: 't1' })
  await clock.advance(1000)
  expect(db.get('kommandos/k-3')?.state).toBe('erledigt')
  expect(db.get('kommandos/k-3')?.result).toBe('Ella baut gerade die Karte.')

  // a Sofort command named in a prompt is taken before the round would hand it over again
  db.put('kommandos/k-4', { text: 'Stopp Anton', createdAt: START + 3, state: 'neu', von: 'chef' })
  await $.prompt.submit({ text: 'Kommentar auf der Büro-Seite, Kommando k-4: Stopp Anton', wait: false, origin: { kind: 'composer' } } as never)
  expect(db.get('kommandos/k-4')?.state).toBe('angenommen')
  const before = prompts.length
  await clock.advance(15_000)
  expect(prompts.slice(before).some(text => text.includes('k-4'))).toBe(false)
})

test('orders are created, handed to a new session, taken, handed over and ruled', async ($, on) => {
  const files = new Map<string, string>()
  const clock = mockWorld(on, files, 'cse_01W')
  const db = mockStore(on)
  const cvd = session('session_01CVD', { tags: ['buero:rolle=cvd'] })
  const me = session('session_01W')
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  on('mcp.call', ($, e) => {
    calls.push({ tool: e.tool, args: e.args as Record<string, unknown> })
    switch (e.tool) {
      case 'list_sessions':
        return listOf([cvd, me])
      case 'get_session':
        return said(JSON.stringify({ ccr: me }))
      case 'create_session':
        return said(`Created session:\n${JSON.stringify({ ccr: { id: 'session_01NEW', title: String(e.args.title) } })}`)
      default:
        return said('ok')
    }
  })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  // the Chef vom Dienst keeps the office
  db.put('leitung/bote', { holder: 'cse_01CVD', until: START + 10 * 60_000, seen: {}, pinned: 'cse_01CVD', cvdHeartbeat: START })

  await $.session.start(START_EVENT)
  await clock.advance(5000)
  const made = await $.tool.call({ tool: 'mcp__buero__auftrag', aktion: 'anlegen', titel: 'Login-Seite', text: 'Ziel: Login.', repo: 'leesyashin/asker', abnahme: ['Tests grün'] } as never)
  expect(JSON.stringify(made)).toContain('Auftrag a1 angelegt')
  expect(db.get('auftraege/a1')?.state).toBe('offen')
  expect(db.get('leitung/zaehler')?.auftraege).toBe(1)
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__buero__auftrag', aktion: 'anlegen', titel: 'Ohne Abnahme', text: 'x' } as never))).toContain('Abnahmekriterium')

  // a colleague for the order: a new session with the order as its prompt
  const fetched = await $.tool.call({ tool: 'mcp__buero__kollegen_holen', auftrag: 'a1', hinweis: 'Fang mit dem Formular an.' } as never)
  expect(JSON.stringify(fetched)).toContain('session_01NEW')
  const created = calls.find(one => one.tool === 'create_session')?.args ?? {}
  expect(created.tags).toEqual(['buero:auftrag=a1', 'buero:eltern=session_01W'])
  expect(created.title).toBe('Auftrag 1: Login-Seite')
  expect(created.source_url).toBe('https://github.com/leesyashin/asker')
  expect(created.outcome_branch).toBe('claude/auftrag-1-login-seite')
  expect(created.model).toBe('claude-opus-5-5')
  expect(String(created.prompt)).toContain('mcp__buero__auftrag aktion=annehmen id=a1')
  expect(String(created.prompt)).toContain('Fang mit dem Formular an.')
  expect(String(created.prompt)).toContain('Session session_01CVD')
  expect(db.get('auftraege/a1')?.state).toBe('vergeben')
  expect(db.get('auftraege/a1')?.owner).toBe('session_01NEW')

  // the session itself takes an order of its own repository, reports its state and hands it over
  const second = await $.tool.call({ tool: 'mcp__buero__auftrag', aktion: 'anlegen', titel: 'Warenkorb', text: 'Ziel: Warenkorb.', abnahme: ['Kasse rechnet'] } as never)
  expect(JSON.stringify(second)).toContain('Auftrag a2 angelegt')
  expect(db.get('auftraege/a2')?.repo).toBe('leesyashin/Else-Live-')
  await $.tool.call({ tool: 'mcp__buero__auftrag', aktion: 'annehmen', id: 'a2' } as never)
  expect(db.get('auftraege/a2')?.state).toBe('in_arbeit')
  expect(db.get('auftraege/a2')?.owner).toBe('session_01W')
  await $.tool.call({ tool: 'mcp__buero__stand', text: 'Modell fertig', fortschritt: '2/5' } as never)
  await clock.advance(20_000)
  expect(db.get('sessions/01W')?.stand?.text).toBe('Modell fertig')
  expect(db.get('sessions/01W')?.auftrag).toBe('a2')
  const given = await $.tool.call({ tool: 'mcp__buero__abgeben', an: 'cvd', stand: 'Modell fertig', offen: 'Kasse', naechster: 'Kasse bauen' } as never)
  expect(JSON.stringify(given)).toContain('Chef vom Dienst weiß Bescheid')
  expect(db.get('auftraege/a2')?.state).toBe('offen')
  expect(db.get('auftraege/a2')?.uebergabe?.stand).toBe('Modell fertig')
  expect(calls.some(one => one.tool === 'send_message' && one.args.session_id === 'session_01CVD' && String(one.args.message).includes('abgegeben'))).toBe(true)

  // rules, the shelf, a meeting, a word to the CvD, an answer on the page
  await $.tool.call({ tool: 'mcp__buero__regel', aktion: 'setzen', repo: 'leesyashin/asker', autoMerge: 'gruen', pruefbefehle: ['npm run check'] } as never)
  expect(db.get('regeln/leesyashin_asker')?.autoMerge).toBe('gruen')
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__buero__regel', aktion: 'zeigen', repo: 'leesyashin/asker' } as never))).toContain('bei grüner CI')
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__buero__ablegen', aktion: 'ablegen', art: 'link', titel: 'Figma', url: 'https://example.org/figma', tags: ['Design'] } as never))).toContain('Abgelegt als x-')
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__buero__ablegen', aktion: 'zeigen', tags: ['design'] } as never))).toContain('Figma')
  const opened = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__besprechung', aktion: 'eroeffnen', thema: 'Menü', frage: 'A oder B?', teilnehmer: ['alle'] } as never))
  const bid = /b-[a-z0-9]+/.exec(opened)?.[0] ?? ''
  expect(bid).not.toBe('')
  expect(calls.some(one => one.tool === 'send_message' && String(one.args.message).includes(`Besprechung ${bid}`))).toBe(true)
  await $.tool.call({ tool: 'mcp__buero__besprechung', aktion: 'beitragen', id: bid, these: 'B', empfehlung: 'B nehmen' } as never)
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__buero__besprechung', aktion: 'zeigen', id: bid } as never))).toContain('These: B')
  expect(JSON.stringify(await $.tool.call({ tool: 'mcp__buero__cvd', text: 'Brauche einen Prüfer.' } as never))).toContain('An den Chef vom Dienst')
  db.put('post/p1', { to: 'session_01W', text: 'Wie weit?', createdAt: clock.now(), state: 'neu' })
  await clock.advance(15_000)
  expect(db.get('post/p1')?.state).toBe('zugestellt')
  await $.tool.call({ tool: 'mcp__buero__antwort', text: 'Modell fertig, Kasse fehlt.' } as never)
  expect(db.get('post/p1')?.reply).toBe('Modell fertig, Kasse fehlt.')
})

test('a merge from an order session follows the repository rule', async (engine, on) => {
  const $ = engine as unknown as EngineInterface
  const db = mockStore(on)
  const ctx: DienstCtx = {
    cloudSelf: () => 'cse_01W',
    self: () => undefined,
    change: () => undefined,
    records: () => [],
    idOfSelf: () => 'session_01W',
    rolle: () => undefined,
    auftragTag: () => 'a1',
    setAuftragTag: () => undefined,
    cvdId: () => undefined,
    repo: () => undefined,
    note: () => undefined,
    arrive: () => undefined,
    isBusy: () => false,
    stuckMs: () => 5 * 60_000,
    lastPost: () => undefined,
  }
  expect(await mergeVerdict($, ctx, { owner: 'leesyashin', repo: 'asker' }, START)).toContain('erlaubt keinen Merge')
  db.put('regeln/leesyashin_shop', { autoMerge: 'gruen' })
  expect(await mergeVerdict($, ctx, { owner: 'leesyashin', repo: 'shop' }, START)).toBeUndefined()
  expect(await mergeVerdict($, { ...ctx, auftragTag: () => undefined }, { owner: 'leesyashin', repo: 'asker' }, START)).toBeUndefined()
  expect(await mergeVerdict($, { ...ctx, rolle: () => 'cvd' }, { owner: 'leesyashin', repo: 'asker' }, START)).toBeUndefined()
})

test('the round reports stuck and failed colleagues, unaccepted and reviewable orders, and keeps the readiness', async ($, on) => {
  const files = new Map<string, string>()
  const clock = mockWorld(on, files, 'cse_01CVD')
  const db = mockStore(on)
  const cvd = session('session_01CVD', { tags: ['buero:rolle=cvd'] })
  const stuck = session('session_01STUCK', { title: 'Warenkorb', updated_at: '2026-10-20T11:40:00Z', tags: ['buero:auftrag=a2'] })
  const failed = session('session_01FAIL', { title: 'Kasse', status_bucket: 'SESSION_STATUS_BUCKET_FAILED' })
  const waiting = session('session_01ASK', { title: 'Login', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', post_turn_summary: { needs_action: 'Welche Farbe?' } })
  const prompts: string[] = []
  const pushed: string[] = []
  let sleeps = 0
  on('mcp.call', ($, e) => (e.tool === 'list_sessions' ? listOf([cvd, stuck, failed, waiting]) : e.tool === 'get_session' ? said(JSON.stringify({ ccr: cvd })) : said('ok')))
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('tool.call', { tool: 'ArtifactComments' }, () => ({ result: 'ok' }))
  on('tool.call', { tool: 'PushNotification' }, ($, e) => {
    pushed.push(String((e as unknown as { message: string }).message))

    return { result: 'sent' }
  })
  on('process.run', () => {
    sleeps += 1

    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  db.put('auftraege/a1', { id: 'a1', nr: 1, titel: 'Login-Seite', text: 'x', repo: 'leesyashin/asker', state: 'vergeben', owner: 'session_01GONE', createdBy: 'chef', createdAt: START - 30 * 60_000, updatedAt: START - 12 * 60_000, abnahme: ['ok'], prio: 'normal', verlauf: [] })
  db.put('auftraege/a3', { id: 'a3', nr: 3, titel: 'Menü', text: 'x', repo: 'leesyashin/asker', state: 'review', owner: 'session_01STUCK', pr: 'PR #9', createdBy: 'chef', createdAt: START - 30 * 60_000, updatedAt: START - 60_000, abnahme: ['ok'], prio: 'normal', verlauf: [] })
  db.put('regeln/leesyashin_asker', { autoMerge: 'gruen' })
  // a command taken a while ago that never reached a turn
  db.put('kommandos/k-old', { text: 'Was macht Ella?', createdAt: START - 40 * 60_000, updatedAt: START - 20 * 60_000, state: 'angenommen', von: 'chef' })

  await $.session.start(START_EVENT)
  await clock.advance(5000)
  const round = prompts.find(text => text.startsWith('[Büro] Störungen und Meldungen vom Rundgang')) ?? ''
  expect(round).toContain('session_01STUCK')
  expect(round).toContain('hängt')
  expect(round).toContain('session_01FAIL')
  expect(round).toContain('fehlgeschlagen')
  expect(round).toContain('Auftrag a1 (Login-Seite) ist seit')
  expect(round).toContain('Auftrag a3 (Menü) ist bereit zum Review: PR #9')
  expect(round).toContain('bei grüner CI mergen')
  expect(pushed.some(text => text.includes('wartet auf dich') && text.includes('Welche Farbe?'))).toBe(true)
  expect(prompts.some(text => text.includes('[Büro] Kommando k-old vom Chef'))).toBe(true)
  // without the background pause the model is told to start it again
  expect(sleeps).toBe(1)
  expect(prompts.some(text => text.includes('Wachhalter läuft nicht'))).toBe(true)
  // the same disturbance is not reported again within half an hour
  const before = prompts.length
  await clock.advance(5 * 60_000)
  expect(prompts.slice(before).some(text => text.includes('session_01STUCK'))).toBe(false)
})
