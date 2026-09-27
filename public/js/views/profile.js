// Profil: eigenes Profil, Push-Benachrichtigungen, Gruppe und Auswahllisten.

import { act, request } from '../api.js';
import { avatar } from '../components.js';
import { fmtG, html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { emit, isOnline, me, members, settings } from '../store.js';
import { busy, confirmDialog, toast } from '../ui.js';
import { disablePush, enablePush, isIos, pushStatus } from '../push.js';
import { openGroupNameEdit, openProfileEdit } from '../sheets/profile.js';

let push = { status: 'loading', checked: false };

async function checkPush() {
  push = { status: await pushStatus().catch(() => 'unsupported'), checked: true };
  emit();
}

function switchRow(key, title, text, checked) {
  return html`
    <label class="switch-row">
      <span class="switch-row__text">
        <span class="strong" style="display:block">${title}</span>
        <span class="tiny faint">${text}</span>
      </span>
      <span class="switch">
        <input type="checkbox" data-change="notify-pref" data-key="${key}" ${checked ? 'checked' : ''} aria-label="${title}" />
        <span class="switch__track"></span>
      </span>
    </label>`;
}

function pushCard() {
  const m = me();
  const status = push.status;
  let main;
  if (status === 'loading') {
    main = html`<p class="small faint">Prüfe Push-Status …</p>`;
  } else if (status === 'on') {
    main = html`
      <div class="row">
        <span class="status status--ready">${icon('bell-ring')} Aktiv auf diesem Gerät</span>
        <span class="grow"></span>
        <button type="button" class="btn btn--glass btn--sm" data-click="push-test">${icon('send', { size: 16 })} Test</button>
        <button type="button" class="btn btn--ghost btn--sm" data-click="push-disable">Aus</button>
      </div>`;
  } else if (status === 'off') {
    main = html`
      <p class="small muted">Bekomme eine Nachricht, wenn jemand rollt, dich anfragt oder du in der Rotation dran bist.</p>
      <button type="button" class="btn btn--primary" data-click="push-enable">${icon('bell', { size: 18 })} Push aktivieren</button>`;
  } else if (status === 'denied') {
    main = html`<div class="hint-box">${icon('bell-off')}<div>Benachrichtigungen sind für diese Seite blockiert. Erlaube sie in den Browser- bzw. Systemeinstellungen und lade neu.</div></div>`;
  } else if (status === 'ios-install') {
    main = html`<div class="hint-box">${icon('smartphone')}<div><strong>iPhone/iPad:</strong> Tippe in Safari auf „Teilen“ → „Zum Home-Bildschirm“ und öffne Else Live dann über das neue App-Symbol. Dort kannst du Push aktivieren (ab iOS 16.4).</div></div>`;
  } else {
    main = html`<div class="hint-box">${icon('info')}<div>${window.isSecureContext
      ? 'Dieser Browser unterstützt keine Push-Nachrichten. Neue Ereignisse siehst du trotzdem live in der App.'
      : 'Push-Nachrichten brauchen eine HTTPS-Verbindung (oder localhost). Neue Ereignisse siehst du trotzdem live in der App.'}</div></div>`;
  }

  return html`
    <section class="card glass stack">
      <div class="row"><h2 class="strong grow">${icon('bell', { size: 18, className: 'inline' })} Benachrichtigungen</h2></div>
      ${main}
      <div class="stack" style="gap:8px">
        ${switchRow('joints', 'Neue Joints', 'Wenn jemand einen Joint gerollt hat', m.notify?.joints !== false)}
        ${switchRow('requests', 'Anfragen', 'Wenn dich jemand bittet zu rollen – und Antworten auf deine Anfragen', m.notify?.requests !== false)}
        ${switchRow('rotation', 'Rotation', '„Du bist dran“, angezündet, neue Plätze bei deinen Joints', m.notify?.rotation !== false)}
      </div>
    </section>`;
}

function listEditor(key, title, hint, items) {
  return html`
    <div class="stack" style="gap:10px">
      <div>
        <div class="strong">${title}</div>
        <div class="tiny faint">${hint}</div>
      </div>
      <div class="tag-list">
        ${items.length
          ? items.map((item) => html`
              <span class="tag">${item}
                <button type="button" class="tag__remove" data-click="list-remove" data-list="${key}" data-value="${item}" aria-label="${item} entfernen">${icon('x')}</button>
              </span>`)
          : html`<span class="small faint">Noch keine Einträge</span>`}
      </div>
      <form class="inline-add" data-submit="list-add" data-list="${key}">
        <input class="input" name="value" maxlength="40" autocomplete="off" placeholder="Hinzufügen …" aria-label="${title} hinzufügen" />
        <button type="submit" class="icon-btn" aria-label="Hinzufügen">${icon('plus')}</button>
      </form>
    </div>`;
}

function stepperRow(action, title, text, value) {
  return html`
    <div class="row">
      <div class="grow">
        <div class="strong">${title}</div>
        <div class="tiny faint">${text}</div>
      </div>
      <button type="button" class="icon-btn" data-click="${action}" data-delta="-1" aria-label="Weniger">${icon('minus', { size: 18 })}</button>
      <span class="strong num" style="min-width:52px;text-align:center">${value}</span>
      <button type="button" class="icon-btn" data-click="${action}" data-delta="1" aria-label="Mehr">${icon('plus', { size: 18 })}</button>
    </div>`;
}

export function profileView() {
  if (!push.checked) checkPush();
  const m = me();
  const s = settings();
  const all = members();

  return html`
    <div class="stack stack--lg">
      <header class="page-head"><h1 class="page-title">Profil</h1></header>

      <section class="card glass profile-card">
        ${avatar(m, { size: 'xl', online: false })}
        <div class="grow">
          <div class="strong" style="font-size:20px">${m.name}</div>
          <div class="small muted">${m.hasPin ? html`${icon('lock', { size: 13, className: 'inline' })} Mit PIN geschützt` : 'Ohne PIN'}</div>
        </div>
        <button type="button" class="icon-btn" data-click="edit-profile" aria-label="Profil bearbeiten">${icon('pencil', { size: 18 })}</button>
      </section>

      ${pushCard()}

      <section class="card glass stack">
        <div class="row">
          <h2 class="strong grow">${icon('users', { size: 18, className: 'inline' })} ${s.groupName}</h2>
          <button type="button" class="btn btn--ghost btn--sm" data-click="edit-group">${icon('pencil', { size: 15 })} Name</button>
        </div>
        <div class="stack" style="gap:8px">
          <span class="small muted">Gruppencode zum Einladen</span>
          <div class="group-code">
            <span class="group-code__value">${s.inviteCode}</span>
            <button type="button" class="icon-btn" data-click="copy-invite" aria-label="Einladungslink kopieren">${icon('copy', { size: 18 })}</button>
            <button type="button" class="icon-btn" data-click="regen-code" aria-label="Neuen Code erzeugen">${icon('refresh-cw', { size: 18 })}</button>
          </div>
          <span class="tiny faint">Wer den Code kennt, kann der Gruppe beitreten. Neuer Code = alter Code ungültig (bestehende Anmeldungen bleiben).</span>
        </div>
        <div class="list">
          ${all.map((x) => html`
            <div class="list__item">
              ${avatar(x, { size: 'sm' })}
              <span class="grow strong ellipsis">${x.name}${x.id === m.id ? html` <span class="faint">(du)</span>` : ''}</span>
              <span class="tiny ${isOnline(x.id) ? '' : 'faint'}" style="${isOnline(x.id) ? 'color:var(--accent)' : ''}">${isOnline(x.id) ? 'online' : 'offline'}</span>
            </div>`)}
        </div>
      </section>

      <section class="card glass stack stack--lg">
        <h2 class="strong">${icon('settings', { size: 18, className: 'inline' })} Listen & Regeln</h2>
        ${listEditor('tobaccos', 'Tabak', 'Auswahl beim Joint-Eintrag („Pur“ gibt es immer)', s.tobaccos ?? [])}
        ${listEditor('filters', 'Aktivkohlefilter', 'Marken/Größen, die ihr benutzt', s.filters ?? [])}
        ${stepperRow('rotation-size', 'Plätze in der Rotation', 'Platz 1 hat immer, wer gerollt hat', s.rotationSize)}
        ${stepperRow('low-stock', 'Warnschwelle Bestand', 'Ab hier gilt eine Sorte als „wird knapp“', fmtG(s.lowStockGrams))}
      </section>

      <button type="button" class="btn btn--glass btn--block" data-click="logout">${icon('log-out', { size: 18 })} Abmelden</button>
      <p class="tiny faint" style="text-align:center">Else Live · Prototyp · nur für den privaten Gebrauch in eurer Gruppe</p>
    </div>`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Zum Kopieren:', text);
    return false;
  }
}

export const profileHandlers = {
  'edit-profile': () => openProfileEdit(),
  'edit-group': () => openGroupNameEdit(),

  async 'push-enable'(el) {
    await busy(el, enablePush);
    await checkPush();
    toast({ title: 'Push ist aktiv 🔔', body: 'Du bekommst ab jetzt Nachrichten auf diesem Gerät.', tone: 'success' });
  },
  async 'push-disable'(el) {
    await busy(el, disablePush);
    await checkPush();
    toast({ title: 'Push deaktiviert' });
  },
  async 'push-test'(el) {
    const { devices } = await busy(el, () => request('POST', '/api/push/test'));
    toast({ title: 'Test gesendet', body: `An ${devices} ${devices === 1 ? 'Gerät' : 'Geräte'}. Kommt nichts an? Prüfe die Mitteilungs-Einstellungen${isIos() ? ' (und ob die App vom Home-Bildschirm geöffnet ist)' : ''}.` });
  },
  async 'notify-pref'(el) {
    const notify = { ...me().notify, [el.dataset.key]: el.checked };
    await act('PATCH', '/api/me', { notify });
  },

  async 'copy-invite'() {
    const code = settings().inviteCode;
    const link = `${location.origin}/#code=${encodeURIComponent(code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Else Live', text: `Komm in unsere Else-Live-Gruppe! Code: ${code}`, url: link });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    if (await copyText(link)) toast({ title: 'Einladungslink kopiert', body: link, tone: 'success' });
  },
  async 'regen-code'() {
    const ok = await confirmDialog({
      title: 'Neuen Gruppencode erzeugen?',
      message: 'Der alte Code funktioniert dann nicht mehr für neue Anmeldungen. Wer schon angemeldet ist, bleibt angemeldet.',
      confirmLabel: 'Neuer Code',
    });
    if (ok) await act('POST', '/api/settings/invite-code');
  },

  async 'list-add'(form) {
    const key = form.dataset.list;
    const input = form.elements.value;
    const value = input.value.trim();
    if (!value) return;
    await act('PATCH', '/api/settings', { [key]: [...(settings()[key] ?? []), value] });
    input.value = '';
    input.blur(); // Ansicht wird erst nach dem Verlassen des Feldes neu gezeichnet
  },
  async 'list-remove'(el) {
    const key = el.dataset.list;
    await act('PATCH', '/api/settings', { [key]: (settings()[key] ?? []).filter((x) => x !== el.dataset.value) });
  },
  async 'rotation-size'(el) {
    const next = Math.min(12, Math.max(2, settings().rotationSize + Number(el.dataset.delta)));
    if (next !== settings().rotationSize) await act('PATCH', '/api/settings', { rotationSize: next });
  },
  async 'low-stock'(el) {
    const next = Math.max(0, Math.round((settings().lowStockGrams + 0.5 * Number(el.dataset.delta)) * 10) / 10);
    await act('PATCH', '/api/settings', { lowStockGrams: next });
  },
};

export const resetPushCheck = () => {
  push = { status: 'loading', checked: false };
};
