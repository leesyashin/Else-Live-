// Anfrage stellen: „Rollst du mal wieder einen?“ – an eine Person oder an alle.

import { act } from '../api.js';
import { avatar } from '../components.js';
import { JOINT_QUICK_GRAMS, REQUEST_MESSAGES, pressed } from '../lib/constants.js';
import { fmtG, fmtNum, html, inputNum, parseNum } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { activeStrains, me, member, members } from '../store.js';
import { busy, openSheet, toast } from '../ui.js';

export function openRequestForm({ toId = null } = {}) {
  const others = members().filter((m) => m.id !== me().id);
  const st = { toId: toId ?? (others.length === 1 ? others[0].id : null) };

  const press = (action, el) =>
    sheet.el.querySelectorAll(`[data-click="${action}"]`).forEach((b) => b.setAttribute('aria-pressed', pressed(b === el)));

  const sheet = openSheet({
    render: () => ({
      title: 'Anfrage stellen',
      subtitle: 'Bitte jemanden, mal wieder einen zu rollen.',
      body: html`
        <form id="request-form" data-submit="send" novalidate>
          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('users')} An wen?</h3>
            ${others.length ? '' : html`<p class="small faint">Noch niemand sonst in der Gruppe – lade zuerst jemanden ein (Profil → Gruppencode).</p>`}
            <div class="chip-select">
              <button type="button" class="chip-option" data-click="to" data-value="" aria-pressed="${pressed(st.toId === null)}">${icon('users', { size: 16 })} Alle</button>
              ${others.map(
                (m) => html`<button type="button" class="chip-option" data-click="to" data-value="${m.id}" aria-pressed="${pressed(st.toId === m.id)}">
                  ${avatar(m, { size: 'xs' })} ${m.name}</button>`,
              )}
            </div>
          </section>

          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('leaf')} Wunsch <span style="text-transform:none;letter-spacing:0;font-weight:500">(optional)</span></h3>
            <select class="select" name="strainId" aria-label="Wunschsorte">
              <option value="">Sorte egal</option>
              ${activeStrains().filter((s) => s.grams > 0).map((s) => html`<option value="${s.id}">${s.name} · ${fmtG(s.grams)} da</option>`)}
            </select>
            <div class="chip-select chip-select--quick">
              ${JOINT_QUICK_GRAMS.map((q) => html`<button type="button" class="chip-option" data-click="grams" data-value="${q}" aria-pressed="false">${fmtNum(q)} g</button>`)}
            </div>
            <span class="input-suffix">
              <input class="input" name="grams" inputmode="decimal" autocomplete="off" placeholder="Menge egal" data-input="grams-typed" />
              <span class="input-suffix__text">g</span>
            </span>
          </section>

          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('send')} Nachricht</h3>
            <div class="chip-select">
              ${REQUEST_MESSAGES.map((m) => html`<button type="button" class="chip-option" data-click="message" data-value="${m}">${m}</button>`)}
            </div>
            <textarea class="textarea" name="message" rows="2" maxlength="280" placeholder="Optional – sonst gibt’s einen Standardtext"></textarea>
          </section>
        </form>`,
      foot: html`
        <button type="button" class="btn btn--glass" data-sheet-close>Abbrechen</button>
        <button type="submit" form="request-form" class="btn btn--primary grow" data-submit-btn>${icon('send')} Anfrage senden</button>`,
    }),
    handlers: {
      to(el) {
        st.toId = el.dataset.value || null;
        press('to', el);
      },
      grams(el) {
        sheet.el.querySelector('input[name="grams"]').value = inputNum(Number(el.dataset.value));
        press('grams', el);
      },
      'grams-typed'() {
        press('grams', null);
      },
      message(el) {
        const area = sheet.el.querySelector('textarea[name="message"]');
        area.value = el.dataset.value;
        press('message', el);
      },
      async send(form) {
        const data = Object.fromEntries(new FormData(form));
        const grams = parseNum(data.grams);
        await busy(sheet.el.querySelector('[data-submit-btn]'), async () => {
          await act('POST', '/api/requests', {
            toId: st.toId,
            strainId: data.strainId || null,
            grams: Number.isFinite(grams) ? grams : data.grams || null,
            message: data.message,
          });
          sheet.close();
          toast({
            title: 'Anfrage gesendet 🙏',
            body: st.toId ? `${member(st.toId)?.name} bekommt eine Push-Nachricht.` : 'Alle bekommen eine Push-Nachricht.',
            tone: 'success',
          });
        });
      },
    },
  });
  return sheet;
}
