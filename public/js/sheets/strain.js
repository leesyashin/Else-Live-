// Sorten: anlegen/bearbeiten, Detailansicht mit Verlauf, Nachfüllen/Korrigieren.

import { act } from '../api.js';
import { TYPE_LABELS, avatar, levelStatus, nameOf, stockMeter } from '../components.js';
import { pressed } from '../lib/constants.js';
import { dayLabel, fmtG, fmtNum, fmtPct, fmtTime, html, inputNum, parseNum, thcMg } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { me, member, members, store, strain } from '../store.js';
import { busy, confirmDialog, openSheet, toast } from '../ui.js';

const valueOr = (v) => (v === null || v === undefined ? '' : inputNum(v));

export function openStrainForm(existing = null) {
  const st = { type: existing?.type ?? null };

  const sheet = openSheet({
    render: () => ({
      title: existing ? 'Sorte bearbeiten' : 'Neue Sorte',
      subtitle: existing ? existing.name : 'Erscheint sofort im Bestand aller.',
      body: html`
        <form id="strain-form" class="stack" style="gap:16px" data-submit="save" novalidate>
          <label class="field">
            <span class="field__label">Name</span>
            <input class="input" name="name" required maxlength="60" autocomplete="off"
              placeholder="z. B. Amnesia Haze / Pedanios 22/1" value="${existing?.name ?? ''}" />
          </label>

          <div class="field">
            <span class="field__label">Typ</span>
            <div class="segmented" role="group" aria-label="Typ">
              ${['sativa', 'indica', 'hybrid'].map(
                (t) => html`<button type="button" class="segmented__opt" data-click="type" data-value="${t}" aria-pressed="${pressed(st.type === t)}">
                  <span class="type-dot" data-type="${t}"></span>${TYPE_LABELS[t]}</button>`,
              )}
              <button type="button" class="segmented__opt" data-click="type" data-value="" aria-pressed="${pressed(st.type === null)}">–</button>
            </div>
          </div>

          <div class="grid-2">
            <label class="field">
              <span class="field__label">THC-Gehalt</span>
              <span class="input-suffix">
                <input class="input" name="thc" inputmode="decimal" autocomplete="off" placeholder="22" value="${valueOr(existing?.thc)}" />
                <span class="input-suffix__text">%</span>
              </span>
            </label>
            <label class="field">
              <span class="field__label">CBD-Gehalt</span>
              <span class="input-suffix">
                <input class="input" name="cbd" inputmode="decimal" autocomplete="off" placeholder="&lt; 1" value="${valueOr(existing?.cbd)}" />
                <span class="input-suffix__text">%</span>
              </span>
            </label>
          </div>

          ${existing ? '' : html`
            <label class="field">
              <span class="field__label">Menge <span class="faint">z. B. 10 oder 2,5</span></span>
              <span class="input-suffix">
                <input class="input" name="grams" inputmode="decimal" required autocomplete="off" placeholder="10" />
                <span class="input-suffix__text">g</span>
              </span>
            </label>`}

          <label class="field">
            <span class="field__label">Hersteller / Apotheke <span class="faint">optional</span></span>
            <input class="input" name="producer" maxlength="60" autocomplete="off" value="${existing?.producer ?? ''}" />
          </label>

          <label class="field">
            <span class="field__label">Gehört zu</span>
            <select class="select" name="ownerId">
              ${members().map(
                (m) => html`<option value="${m.id}" ${(existing ? existing.ownerId : me().id) === m.id ? 'selected' : ''}>${m.emoji} ${m.name}${m.id === me().id ? ' (du)' : ''}</option>`,
              )}
              <option value="" ${existing && !existing.ownerId ? 'selected' : ''}>Keine Angabe</option>
            </select>
            <span class="field__hint">Wer die Sorte bezogen hat – hilft beim Überblick.</span>
          </label>

          <label class="field">
            <span class="field__label">Notiz <span class="faint">optional</span></span>
            <textarea class="textarea" name="notes" rows="2" maxlength="500" placeholder="Wirkung, Geschmack, Terpene …">${existing?.notes ?? ''}</textarea>
          </label>
        </form>`,
      foot: html`
        <button type="button" class="btn btn--glass" data-sheet-close>Abbrechen</button>
        <button type="submit" form="strain-form" class="btn btn--primary grow" data-submit-btn>${icon('check')} Speichern</button>`,
    }),
    handlers: {
      type(el) {
        st.type = el.dataset.value || null;
        sheet.el.querySelectorAll('[data-click="type"]').forEach((b) => b.setAttribute('aria-pressed', pressed(b === el)));
      },
      async save(form) {
        const data = Object.fromEntries(new FormData(form));
        const payload = {
          name: data.name,
          type: st.type,
          thc: data.thc,
          cbd: data.cbd,
          producer: data.producer,
          ownerId: data.ownerId || null,
          notes: data.notes,
        };
        if (!existing) payload.grams = data.grams;
        await busy(sheet.el.querySelector('[data-submit-btn]'), async () => {
          if (existing) await act('PATCH', `/api/strains/${existing.id}`, payload);
          else await act('POST', '/api/strains', payload);
          sheet.close();
          toast({ title: existing ? 'Gespeichert' : `${payload.name.trim()} ist im Bestand`, tone: 'success' });
        });
      },
    },
  });
  return sheet;
}

// ---------------------------------------------------------------------------

const LOG_REASONS = {
  initial: 'Angelegt',
  restock: 'Nachgefüllt',
  joint: 'Joint gerollt',
  'joint-undo': 'Joint gelöscht',
  correction: 'Korrektur',
};

export function openStrainDetail(id) {
  return openSheet({
    live: true,
    render() {
      const s = strain(id);
      if (!s) return null;
      const owner = member(s.ownerId);
      const log = (store.state.stockLog ?? []).filter((l) => l.strainId === id).reverse().slice(0, 40);
      const mg = thcMg(s.grams, s.thc);
      return {
        title: s.name,
        subtitle: [s.type ? TYPE_LABELS[s.type] : null, s.producer || null, s.archived ? 'Archiviert' : null].filter(Boolean).join(' · ') || 'Sorte',
        body: html`
          <div class="stack" style="gap:16px">
            <div class="big-figures">
              <div class="figure">
                <div class="figure__label">Bestand</div>
                <div class="figure__value">${fmtG(s.grams)}</div>
              </div>
              <div class="figure">
                <div class="figure__label">THC</div>
                <div class="figure__value">${fmtPct(s.thc)}</div>
              </div>
              <div class="figure">
                <div class="figure__label">CBD</div>
                <div class="figure__value">${fmtPct(s.cbd)}</div>
              </div>
            </div>
            <div class="stack" style="gap:8px">
              ${stockMeter(s, { large: true })}
              <div class="row small muted">
                <span class="grow">${s.refillLevel > 0 ? `${fmtNum(Math.round((s.grams / s.refillLevel) * 100))} % von ${fmtG(s.refillLevel)} (letzte Füllung)` : 'Noch nichts eingetragen'}</span>
                ${levelStatus(s)}
              </div>
              ${mg > 0 ? html`<div class="small faint">≈ ${fmtNum(Math.round(mg))} mg THC im Bestand</div>` : ''}
            </div>
            ${owner ? html`<div class="row small">${avatar(owner, { size: 'sm' })}<span>${owner.id === me().id ? html`Gehört <strong>dir</strong>` : html`Gehört zu <strong>${owner.name}</strong>`}</span></div>` : ''}
            ${s.notes ? html`<div class="bubble">${s.notes}</div>` : ''}
            ${s.archived ? html`<div class="hint-box">${icon('archive')}<div>Diese Sorte ist archiviert. Nachfüllen holt sie zurück in den Bestand.</div></div>` : ''}
            <div class="grid-2">
              <button type="button" class="btn btn--primary" data-click="restock">${icon('plus')} Nachfüllen</button>
              <button type="button" class="btn btn--glass" data-click="correct">${icon('scale')} Korrigieren</button>
              <button type="button" class="btn btn--glass" data-click="edit">${icon('pencil')} Bearbeiten</button>
              ${s.archived ? '' : html`<button type="button" class="btn btn--danger" data-click="remove">${icon('archive')} Entfernen</button>`}
            </div>
          </div>
          <section class="sheet-section" style="margin-top:26px">
            <h3 class="sheet-section__title">${icon('history')} Verlauf</h3>
            ${log.length ? html`
              <div class="log-list">
                ${log.map((l) => html`
                  <div class="log-item">
                    ${avatar(member(l.memberId), { size: 'sm', online: false })}
                    <div class="grow">
                      <div class="small strong">${LOG_REASONS[l.reason] ?? l.reason}${l.note ? html` <span class="faint">· ${l.note}</span>` : ''}</div>
                      <div class="tiny faint">${nameOf(l.memberId)} · ${dayLabel(l.at)}, ${fmtTime(l.at)}</div>
                    </div>
                    <div class="log-item__delta num" data-sign="${l.delta > 0 ? 'plus' : 'minus'}">${l.delta > 0 ? '+' : '−'}${fmtG(Math.abs(l.delta))}</div>
                  </div>`)}
              </div>` : html`<p class="small faint">Noch keine Buchungen.</p>`}
          </section>`,
      };
    },
    handlers: {
      restock: () => openStockChange(id, 'add'),
      correct: () => openStockChange(id, 'set'),
      edit: () => openStrainForm(strain(id)),
      async remove() {
        const s = strain(id);
        const ok = await confirmDialog({
          title: `${s.name} entfernen?`,
          message: 'Wurde die Sorte schon für Joints benutzt, wird sie nur archiviert – die Historie bleibt erhalten.',
          confirmLabel: 'Entfernen',
          danger: true,
        });
        if (!ok) return;
        const result = await act('DELETE', `/api/strains/${id}`);
        toast({ title: result.deleted ? `${s.name} gelöscht` : `${s.name} archiviert`, tone: 'success' });
      },
    },
  });
}

// ---------------------------------------------------------------------------

const RESTOCK_QUICK = [1, 2, 5, 10];

export function openStockChange(id, mode) {
  const s = strain(id);
  const adding = mode === 'add';

  function preview(value) {
    const n = parseNum(value);
    if (!Number.isFinite(n) || n < 0 || (adding && n === 0)) return 'Bitte eine Menge eingeben';
    const next = adding ? s.grams + n : n;
    return `Neuer Bestand: ${fmtG(Math.round(next * 1000) / 1000)}`;
  }

  const sheet = openSheet({
    render: () => ({
      title: adding ? `${s.name} nachfüllen` : `Bestand korrigieren`,
      subtitle: adding ? `Aktuell ${fmtG(s.grams)}` : `${s.name} · laut App ${fmtG(s.grams)}`,
      body: html`
        <form id="stock-form" class="stack" style="gap:16px" data-submit="save" novalidate>
          <label class="field">
            <span class="field__label">${adding ? 'Wie viel ist dazugekommen?' : 'Wie viel ist tatsächlich da?'}</span>
            <span class="input-suffix">
              <input class="input num" name="grams" inputmode="decimal" autocomplete="off" required data-input="preview"
                style="font-size:22px;font-weight:700" value="${adding ? '' : inputNum(s.grams)}" placeholder="0" />
              <span class="input-suffix__text">g</span>
            </span>
          </label>
          ${adding ? html`
            <div class="chip-select">
              ${RESTOCK_QUICK.map((q) => html`<button type="button" class="chip-option" data-click="quick" data-value="${q}">+${fmtNum(q)} g</button>`)}
            </div>` : ''}
          <div class="small muted" data-preview>${preview(adding ? '' : s.grams)}</div>
          <label class="field">
            <span class="field__label">Notiz <span class="faint">optional</span></span>
            <input class="input" name="note" maxlength="200" autocomplete="off"
              placeholder="${adding ? 'z. B. Rezept vom 12.09.' : 'z. B. nachgewogen'}" />
          </label>
        </form>`,
      foot: html`
        <button type="button" class="btn btn--glass" data-sheet-close>Abbrechen</button>
        <button type="submit" form="stock-form" class="btn btn--primary grow" data-submit-btn>${icon('check')} ${adding ? 'Nachfüllen' : 'Übernehmen'}</button>`,
    }),
    handlers: {
      preview(el) {
        sheet.el.querySelector('[data-preview]').textContent = preview(el.value);
      },
      quick(el) {
        const input = sheet.el.querySelector('input[name="grams"]');
        input.value = inputNum(Number(el.dataset.value));
        sheet.el.querySelector('[data-preview]').textContent = preview(input.value);
      },
      async save(form) {
        const data = Object.fromEntries(new FormData(form));
        await busy(sheet.el.querySelector('[data-submit-btn]'), async () => {
          await act('POST', `/api/strains/${id}/stock`, { action: mode, grams: data.grams, note: data.note });
          sheet.close();
          toast({ title: adding ? 'Nachgefüllt' : 'Bestand korrigiert', body: `${s.name}: ${fmtG(strain(id)?.grams ?? 0)}`, tone: 'success' });
        });
      },
    },
  });
  return sheet;
}
