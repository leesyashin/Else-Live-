import { expect, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import { OFFICE_URL } from '../hooks/db'
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
  const contexts: string[] = []
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
    contexts.push((e.context ?? []).join('\n'))

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
  // the comment for a command the round already took tells the model so, instead of running it twice
  await $.prompt.submit({ text: 'Kommentar auf der Büro-Seite, Kommando k-4: Stopp Anton', wait: false, origin: { kind: 'composer' } } as never)
  expect(contexts.at(-1)).toContain('Kommando k-4 ist schon in Bearbeitung')
  // a command that arrives while the model works waits for an idle model
  await $.turn.start({ text: 'arbeite', turnId: 't2' })
  db.put('kommandos/k-5', { text: 'Was macht Max?', createdAt: START + 4, state: 'neu', von: 'chef' })
  await clock.advance(15_000)
  expect(db.get('kommandos/k-5')?.state).toBe('neu')
  await $.turn.complete({ reason: 'answer', answer: 'fertig', durationMs: 10, isAborted: false, turnId: 't2' })
  await clock.advance(15_000)
  expect(db.get('kommandos/k-5')?.state).toBe('angenommen')
  expect(prompts.some(text => text.includes('[Büro] Kommando k-5 vom Chef'))).toBe(true)
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
  // a review order whose owner is gone gets a continuation: it is handed to the new session, not left as it was
  db.put('auftraege/a1', { ...(db.get('auftraege/a1') ?? {}), state: 'review', pr: 'PR #4' })
  const again = await $.tool.call({ tool: 'mcp__buero__kollegen_holen', auftrag: 'a1' } as never)
  expect(JSON.stringify(again)).toContain('session_01NEW')
  expect(db.get('auftraege/a1')?.state).toBe('vergeben')
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
  const cvd = session('session_01CVD', { tags: ['buero:rolle=cvd', 'buero:vorgaenger=session_01OLD'] })
  const stuck = session('session_01STUCK', { title: 'Warenkorb', updated_at: '2026-10-20T11:40:00Z', tags: ['buero:auftrag=a2'] })
  const failed = session('session_01FAIL', { title: 'Kasse', status_bucket: 'SESSION_STATUS_BUCKET_FAILED' })
  const waiting = session('session_01ASK', { title: 'Login', status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', post_turn_summary: { needs_action: 'Welche Farbe?' } })
  const prompts: string[] = []
  const pushed: string[] = []
  const sent: string[] = []
  const cloud: string[] = []
  let sleeps = 0
  on('mcp.call', ($, e) => {
    if (e.tool === 'list_sessions') {
      return listOf([cvd, stuck, failed, waiting])
    }
    if (e.tool === 'get_session') {
      return said(JSON.stringify({ ccr: cvd }))
    }
    if (e.tool === 'send_message') {
      sent.push(`${String(e.args.session_id)}: ${String(e.args.message)}`)
    }
    if (['list_triggers', 'delete_trigger', 'create_trigger', 'archive_session', 'create_session'].includes(e.tool)) {
      cloud.push(`${e.tool} ${JSON.stringify(e.args)}`)
    }
    if (e.tool === 'list_triggers') {
      // the predecessor's wake-up task is still bound to it
      return said(JSON.stringify({ triggers: [{ id: 'trig_old', name: 'Chef vom Dienst wach halten', persistent_session_id: 'session_01OLD', enabled: true }] }))
    }
    if (e.tool === 'create_trigger') {
      return said(JSON.stringify({ trigger: { id: 'trig_new' } }))
    }
    if (e.tool === 'create_session') {
      return said(JSON.stringify({ id: 'session_01NEXT', title: String(e.args.title) }))
    }
    if (e.tool === 'pull_request_read') {
      // PR #9 has conflicts with main, PR #10 is green and clean
      const isDirty = e.args.pullNumber === 9
      if (e.args.method === 'get') {
        return said(JSON.stringify({ number: e.args.pullNumber, state: 'open', mergeable: !isDirty, mergeable_state: isDirty ? 'dirty' : 'clean', draft: !isDirty, head: { sha: `sha${String(e.args.pullNumber)}` } }))
      }

      return said(JSON.stringify({ total_count: 1, check_runs: [{ name: 'bauen', status: 'completed', conclusion: 'success' }] }))
    }

    return said('ok')
  })
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })
  on('tool.call', { tool: 'ArtifactComments' }, () => ({ result: 'ok' }))
  on('tool.call', { tool: 'mcp__claude-code-remote__send_message' }, () => ({ result: 'ok' }))
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
  db.put('auftraege/a4', { id: 'a4', nr: 4, titel: 'Suche', text: 'x', repo: 'leesyashin/asker', state: 'review', owner: 'session_01ASK', pr: 'PR #10', createdBy: 'chef', createdAt: START - 30 * 60_000, updatedAt: START - 60_000, abnahme: ['ok'], prio: 'normal', verlauf: [] })
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
  expect(round).toContain('bei grün und konfliktfrei sofort mergen')
  expect(round).toContain('Die PR-Wache meldet dir')
  // the pull request watch: the owner of a conflicting PR hears it at once, a green and clean one is reported as mergeable
  expect(round).toContain('PR #9 (Auftrag a3, leesyashin/asker) hat Konflikte mit main')
  expect(sent.some(text => text.startsWith('session_01STUCK: ') && text.includes('PR #9') && text.includes('Konflikte mit main') && text.includes('aktion=review id=a3 pr=9'))).toBe(true)
  expect(round).toContain('PR #10 (Auftrag a4, leesyashin/asker) ist grün und konfliktfrei. Er ist noch ein Draft')
  expect(round).toContain('sofort mergen (merge_pull_request')
  // a successor's first duties: bind the wake-up task to itself and archive the predecessor
  expect(cloud.filter(one => one.startsWith('delete_trigger'))).toEqual(['delete_trigger {"trigger_id":"trig_old"}'])
  expect(cloud.some(one => one.startsWith('create_trigger') && one.includes('"persistent_session_id":"session_01CVD"') && one.includes('Chef vom Dienst wach halten'))).toBe(true)
  expect(cloud.filter(one => one.startsWith('archive_session'))).toEqual(['archive_session {"session_id":"session_01OLD"}'])
  expect(pushed.some(text => text.includes('wartet auf dich') && text.includes('Welche Farbe?'))).toBe(true)
  expect(prompts.some(text => text.includes('[Büro] Kommando k-old vom Chef'))).toBe(true)
  // without the background pause the model is told to start it again
  expect(sleeps).toBe(1)
  expect(prompts.some(text => text.includes('Wachhalter läuft nicht'))).toBe(true)
  // the same disturbance is not reported again within half an hour
  const before = prompts.length
  await clock.advance(5 * 60_000)
  expect(prompts.slice(before).some(text => text.includes('session_01STUCK'))).toBe(false)
  // the Chef vom Dienst wakes colleagues for a living: the hourly limit does not hold him
  for (let i = 0; i < 7; i += 1) {
    const answer = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__nachricht', an: 'session_01STUCK', text: `Stand? (${i})` } as never))
    expect(answer).toContain('Gesendet an')
    expect(answer).not.toContain('Büro-Limit')
  }
  const direct = await $.tool.call({ tool: 'mcp__claude-code-remote__send_message', session_id: 'session_01STUCK', message: 'Merge main, bitte.', priority: 'now' } as never)
  expect(JSON.stringify(direct)).not.toContain('Büro-Limit')
  // on command the Chef vom Dienst starts his successor with the mod's prompt, then keeps the office no longer
  const handed = JSON.stringify(await $.tool.call({ tool: 'mcp__buero__kollegen_holen', auftrag: 'cvd' } as never))
  expect(handed).toContain('Neuer Chef vom Dienst gestartet: session_01NEXT')
  const made = cloud.find(one => one.startsWith('create_session')) ?? ''
  expect(made).toContain('"buero:rolle=cvd"')
  expect(made).toContain('"buero:vorgaenger=session_01CVD"')
  expect(made).toContain('Du bist der Chef vom Dienst')
  expect(made).toContain('ABLÖSUNG: Du löst Session session_01CVD ab')
  const rounds = prompts.length
  await clock.advance(6 * 60_000)
  expect(prompts.slice(rounds).filter(text => text.startsWith('[Büro] Störungen'))).toEqual([])
  const lease = db.get('leitung/bote') ?? {}
  expect(Number(lease.until)).toBeLessThan(clock.now())
  expect(lease.pinned).toBeUndefined()
})

test('a write to the page reaches core: the model is asked, the mod is allowed only after that look', async ($, on) => {
  const files = new Map<string, string>()
  const clock = mockWorld(on, files, 'cse_01CVD')
  const db = mockStore(on)
  const cvd = session('session_01CVD', { tags: ['buero:rolle=cvd'] })
  const judged: string[] = []
  on('mcp.call', ($, e) => (e.tool === 'list_sessions' ? listOf([cvd]) : e.tool === 'get_session' ? said(JSON.stringify({ ccr: cvd })) : said('ok')))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', { tool: 'ArtifactComments' }, () => ({ result: 'ok' }))
  on('tool.call', { tool: 'PushNotification' }, () => ({ result: 'not sent' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '4711\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  // core beneath the mod: the tool's own check notes a pinned write here, and
  // the cloud refuses the write later when that note is missing
  on('tool.check', ($, e, next) => {
    judged.push(`${e.tool}:${String((e.input as { action?: unknown })?.action)}:${next.origin.plugin}`)

    return { decision: 'ask' as const }
  })
  db.put('kommandos/k-1', { text: 'Was macht Ella?', createdAt: START, state: 'neu', von: 'chef' })

  await $.session.start(START_EVENT)
  await clock.advance(5000)
  expect(db.get('kommandos/k-1')?.state).toBe('angenommen')
  const closed = await $.tool.call({ tool: 'mcp__buero__kommando', aktion: 'erledigt', id: 'k-1', ergebnis: 'Ella baut die Karte.' } as never)
  expect(JSON.stringify(closed)).toContain('erledigt')
  expect(db.get('kommandos/k-1')?.state).toBe('erledigt')
  // the test kit runs no check on a call and asks as the engine, so only this half
  // is checked here: a write the mod did not raise reaches core and keeps its ask.
  // That the mod's own writes get core's look before the allow was seen live in
  // the cloud (the Chef vom Dienst's kommando and antwort tools, 20.10.2026).
  const before = judged.length
  const verdict = await $.tool.check({ tool: 'ArtifactData', input: { url: OFFICE_URL, action: 'update', collection: 'kommandos', doc_id: 'k-1', if_version: 2 } })
  expect(judged.slice(before)).toEqual(['ArtifactData:update:engine'])
  expect(verdict.decision).toBe('ask')
})
