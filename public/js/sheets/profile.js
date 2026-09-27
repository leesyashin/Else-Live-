// Profil bearbeiten (Name, Emoji, Farbe, PIN) und Gruppennamen ändern.

import { act } from '../api.js';
import { avatar } from '../components.js';
import { MEMBER_COLORS, MEMBER_EMOJIS, pressed } from '../lib/constants.js';
import { html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { me, settings } from '../store.js';
import { busy, openSheet, toast } from '../ui.js';

export function emojiPicker(selected) {
  return html`
    <div class="emoji-grid" role="group" aria-label="Emoji">
      ${MEMBER_EMOJIS.map((e) => html`<button type="button" class="emoji-opt" data-click="emoji" data-value="${e}" aria-pressed="${pressed(e === selected)}">${e}</button>`)}
    </div>`;
}

export function colorPicker(selected) {
  return html`
    <div class="color-grid" role="group" aria-label="Farbe">
      ${MEMBER_COLORS.map((c) => html`<button type="button" class="color-opt" style="--c:${c}" data-click="color" data-value="${c}" aria-pressed="${pressed(c === selected)}" aria-label="Farbe ${c}"></button>`)}
    </div>`;
}

/** Gemeinsame Logik für Emoji-/Farbwahl mit Live-Vorschau. */
export function pickerHandlers(st, root) {
  const refresh = () => {
    const preview = root().querySelector('[data-preview]');
    if (preview) preview.innerHTML = avatar({ id: '', emoji: st.emoji, color: st.color }, { size: 'xl', online: false });
  };
  const press = (action, el) =>
    root().querySelectorAll(`[data-click="${action}"]`).forEach((b) => b.setAttribute('aria-pressed', pressed(b === el)));
  return {
    emoji(el) {
      st.emoji = el.dataset.value;
      press('emoji', el);
      refresh();
    },
    color(el) {
      st.color = el.dataset.value;
      press('color', el);
      refresh();
    },
  };
}

export function openProfileEdit() {
  const current = me();
  const st = { emoji: current.emoji, color: current.color, removePin: false };

  const sheet = openSheet({
    render: () => ({
      title: 'Profil bearbeiten',
      body: html`
        <form id="profile-form" class="stack" style="gap:18px" data-submit="save" novalidate>
          <div style="display:grid;place-items:center" data-preview>${avatar({ ...current, emoji: st.emoji, color: st.color }, { size: 'xl', online: false })}</div>
          <label class="field">
            <span class="field__label">Name</span>
            <input class="input" name="name" required maxlength="30" autocomplete="nickname" value="${current.name}" />
          </label>
          <div class="field"><span class="field__label">Emoji</span>${emojiPicker(st.emoji)}</div>
          <div class="field"><span class="field__label">Farbe</span>${colorPicker(st.color)}</div>
          <label class="field">
            <span class="field__label">${current.hasPin ? 'Neue PIN' : 'PIN festlegen'} <span class="faint">optional, 4–8 Ziffern</span></span>
            <input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"
              placeholder="${current.hasPin ? 'Leer lassen = PIN bleibt' : 'Ohne PIN kann jede:r mit Gruppencode dein Profil öffnen'}" />
          </label>
          ${current.hasPin ? html`
            <label class="switch-row">
              <span class="switch-row__text">
                <span class="strong" style="display:block">PIN entfernen</span>
                <span class="tiny faint">Dann reicht der Gruppencode, um dein Profil zu öffnen</span>
              </span>
              <span class="switch"><input type="checkbox" data-change="remove-pin" /><span class="switch__track"></span></span>
            </label>` : ''}
        </form>`,
      foot: html`
        <button type="button" class="btn btn--glass" data-sheet-close>Abbrechen</button>
        <button type="submit" form="profile-form" class="btn btn--primary grow" data-submit-btn>${icon('check')} Speichern</button>`,
    }),
    handlers: {
      ...pickerHandlers(st, () => sheet.el),
      'remove-pin'(el) {
        st.removePin = el.checked;
      },
      async save(form) {
        const data = Object.fromEntries(new FormData(form));
        const payload = { name: data.name, emoji: st.emoji, color: st.color };
        if (st.removePin) payload.pin = null;
        else if (data.pin) payload.pin = data.pin;
        await busy(sheet.el.querySelector('[data-submit-btn]'), async () => {
          await act('PATCH', '/api/me', payload);
          sheet.close();
          toast({ title: 'Profil gespeichert', tone: 'success' });
        });
      },
    },
  });
  return sheet;
}

export function openGroupNameEdit() {
  const sheet = openSheet({
    render: () => ({
      title: 'Gruppenname',
      body: html`
        <form id="group-form" data-submit="save" novalidate>
          <label class="field">
            <span class="field__label">Name eurer Gruppe</span>
            <input class="input" name="groupName" required maxlength="40" value="${settings().groupName}" />
          </label>
        </form>`,
      foot: html`
        <button type="button" class="btn btn--glass" data-sheet-close>Abbrechen</button>
        <button type="submit" form="group-form" class="btn btn--primary grow" data-submit-btn>${icon('check')} Speichern</button>`,
    }),
    handlers: {
      async save(form) {
        const { groupName } = Object.fromEntries(new FormData(form));
        await busy(sheet.el.querySelector('[data-submit-btn]'), async () => {
          await act('PATCH', '/api/settings', { groupName });
          sheet.close();
        });
      },
    },
  });
  return sheet;
}
