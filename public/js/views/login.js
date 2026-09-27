// Anmeldung: Gruppencode → Profil wählen (ggf. PIN) oder neues Profil anlegen.
// Die allererste Person richtet die Gruppe ohne Code ein.

import { request } from '../api.js';
import { avatar } from '../components.js';
import { MEMBER_COLORS, MEMBER_EMOJIS } from '../lib/constants.js';
import { html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { setState, setToken, store } from '../store.js';
import { busy } from '../ui.js';
import { colorPicker, emojiPicker, pickerHandlers } from '../sheets/profile.js';
import { router } from '../lib/router.js';

const L = {
  step: 'code',
  code: '',
  members: [],
  memberId: null,
  error: null,
  emoji: MEMBER_EMOJIS[0],
  color: MEMBER_COLORS[0],
};

let onLoggedIn = () => {};
export const setLoginCallback = (fn) => {
  onLoggedIn = fn;
};

const root = () => document.getElementById('root');

function go(step, patch = {}) {
  Object.assign(L, { error: null }, patch, { step });
  renderLogin();
}

function codeFromLink() {
  const match = router.current().match(/code=([A-Za-z0-9-]+)/);
  return match ? match[1].toUpperCase() : '';
}

const errorHtml = () => (L.error ? html`<div class="form-error">${icon('triangle-alert', { size: 16 })} ${L.error}</div>` : '');
const errorBox = () => html`<div data-error>${errorHtml()}</div>`;

function stepCode() {
  return html`
    <form class="stack" data-submit="login-code" novalidate>
      <label class="field">
        <span class="field__label" style="justify-content:center">Gruppencode</span>
        <input class="input input--code" name="code" maxlength="32" autocomplete="off" autocapitalize="characters"
          spellcheck="false" placeholder="XXXXXX" value="${L.code}" autofocus />
      </label>
      ${errorBox()}
      <button type="submit" class="btn btn--primary btn--block" data-submit-btn>Weiter ${icon('arrow-right', { size: 18 })}</button>
      <p class="small faint" style="text-align:center">Den Code findet jedes Mitglied im Profil unter „Gruppe“.</p>
    </form>`;
}

function stepPick() {
  return html`
    <div class="stack">
      <p class="strong" style="text-align:center">Wer bist du?</p>
      <div class="member-grid">
        ${L.members.map(
          (m) => html`
            <button type="button" class="member-opt" data-click="login-pick" data-member="${m.id}">
              ${avatar(m, { size: 'lg', online: false })}
              <span>${m.name}</span>
              ${m.hasPin ? html`<span class="tiny faint">${icon('lock', { size: 12, className: 'inline' })} PIN</span>` : ''}
            </button>`,
        )}
        <button type="button" class="member-opt member-opt--new" data-click="login-new">
          <span class="avatar avatar--lg">${icon('plus')}</span>
          <span>Neues Profil</span>
        </button>
      </div>
      ${errorBox()}
      <button type="button" class="btn btn--ghost" data-click="login-back" data-step="code">${icon('chevron-left', { size: 18 })} Anderer Code</button>
    </div>`;
}

function stepPin() {
  const m = L.members.find((x) => x.id === L.memberId);
  return html`
    <form class="stack" data-submit="login-pin" novalidate>
      <div style="display:grid;place-items:center;gap:8px">
        ${avatar(m, { size: 'xl', online: false })}
        <span class="strong">${m?.name}</span>
      </div>
      <label class="field">
        <span class="field__label" style="justify-content:center">PIN</span>
        <input class="input input--code" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8"
          autocomplete="current-password" autofocus />
      </label>
      ${errorBox()}
      <button type="submit" class="btn btn--primary btn--block" data-submit-btn>Anmelden</button>
      <button type="button" class="btn btn--ghost" data-click="login-back" data-step="pick">${icon('chevron-left', { size: 18 })} Zurück</button>
    </form>`;
}

function stepNew() {
  const setup = store.meta?.setup;
  return html`
    <form class="stack" style="gap:16px" data-submit="login-register" novalidate>
      ${setup ? html`<div class="hint-box">${icon('sparkles')}<div>Du bist die erste Person hier und richtest die Gruppe ein. Danach findest du im Profil den Code zum Einladen.</div></div>` : ''}
      <div style="display:grid;place-items:center" data-preview>${avatar({ id: '', emoji: L.emoji, color: L.color }, { size: 'xl', online: false })}</div>
      <label class="field">
        <span class="field__label">Dein Name</span>
        <input class="input" name="name" maxlength="30" autocomplete="nickname" required placeholder="z. B. Vincent" autofocus />
      </label>
      <div class="field"><span class="field__label">Emoji</span>${emojiPicker(L.emoji)}</div>
      <div class="field"><span class="field__label">Farbe</span>${colorPicker(L.color)}</div>
      <label class="field">
        <span class="field__label">PIN <span class="faint">optional, 4–8 Ziffern</span></span>
        <input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"
          placeholder="Schützt dein Profil auf fremden Geräten" />
      </label>
      ${errorBox()}
      <button type="submit" class="btn btn--primary btn--block" data-submit-btn>${icon('check')} ${setup ? 'Gruppe einrichten' : 'Profil erstellen'}</button>
      ${setup ? '' : html`<button type="button" class="btn btn--ghost" data-click="login-back" data-step="pick">${icon('chevron-left', { size: 18 })} Zurück</button>`}
    </form>`;
}

export function renderLogin() {
  if (store.meta?.setup && L.step !== 'new') L.step = 'new';
  if (L.step === 'code' && !L.code) L.code = codeFromLink();
  const steps = { code: stepCode, pick: stepPick, pin: stepPin, new: stepNew };
  root().innerHTML = html`
    <main class="login">
      <div class="login__card glass">
        <div class="login__logo">${icon('cannabis', { size: 40 })}</div>
        <h1 class="login__title">Else Live</h1>
        <p class="login__sub">${store.meta?.setup ? 'Willkommen! Lass uns eure Gruppe einrichten.' : 'Eure gemeinsame Übersicht – live.'}</p>
        ${steps[L.step]()}
      </div>
      <p class="legal-note">Private Übersicht für eure Gruppe – nur für den persönlichen Gebrauch.</p>
    </main>`;
  root().querySelector('[autofocus]')?.focus();
}

async function finish(data) {
  setToken(data.token);
  L.step = 'code';
  L.error = null;
  if (store.meta) store.meta.setup = false;
  setState(data.state);
  onLoggedIn();
}

/** Fehler anzeigen, ohne das Formular neu zu zeichnen (Eingaben bleiben stehen). */
function fail(err) {
  L.error = err.message;
  const slot = root().querySelector('[data-error]');
  if (slot) slot.innerHTML = errorHtml();
  else renderLogin();
}

const submitBtn = (form) => form.querySelector('[data-submit-btn]');

export const loginHandlers = {
  async 'login-code'(form) {
    const code = new FormData(form).get('code').trim().toUpperCase();
    if (!code) return fail(new Error('Bitte den Gruppencode eingeben.'));
    await busy(submitBtn(form), async () => {
      try {
        const { members } = await request('POST', '/api/auth/members', { code });
        go(members.length ? 'pick' : 'new', { code, members });
      } catch (err) {
        L.code = code;
        fail(err);
      }
    });
  },

  async 'login-pick'(el) {
    const m = L.members.find((x) => x.id === el.dataset.member);
    if (!m) return;
    if (m.hasPin) return go('pin', { memberId: m.id });
    await busy(el, async () => {
      try {
        await finish(await request('POST', '/api/auth/login', { code: L.code, memberId: m.id }));
      } catch (err) {
        fail(err);
      }
    });
  },

  async 'login-pin'(form) {
    const pin = new FormData(form).get('pin');
    await busy(submitBtn(form), async () => {
      try {
        await finish(await request('POST', '/api/auth/login', { code: L.code, memberId: L.memberId, pin }));
      } catch (err) {
        fail(err);
      }
    });
  },

  'login-new'() {
    go('new');
  },

  'login-back'(el) {
    go(el.dataset.step);
  },

  ...pickerHandlers(L, root),

  async 'login-register'(form) {
    const data = Object.fromEntries(new FormData(form));
    if (!data.name?.trim()) return fail(new Error('Bitte gib deinen Namen ein.'));
    await busy(submitBtn(form), async () => {
      try {
        await finish(
          await request('POST', '/api/auth/register', {
            code: L.code,
            name: data.name,
            emoji: L.emoji,
            color: L.color,
            pin: data.pin || undefined,
          }),
        );
      } catch (err) {
        fail(err);
      }
    });
  },
};
