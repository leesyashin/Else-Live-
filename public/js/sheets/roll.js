// „Joint gerollt“ – das Eintragsmenü. Beim Absenden wird der Bestand abgezogen
// und (optional) die ganze Gruppe per Push benachrichtigt.

import { act } from '../api.js';
import { emptyState, nameOf } from '../components.js';
import { JOINT_QUICK_GRAMS, pressed } from '../lib/constants.js';
import { fmtEur, fmtG, fmtNum, fmtPct, html, inputNum, parseNum, thcMg } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { activeStrains, prefs, requestById, settings, strain } from '../store.js';
import { busy, openSheet, toast } from '../ui.js';
import { openStrainForm } from './strain.js';
import { router } from '../lib/router.js';

const STEP = 0.05;
const MAX_ROWS = 4;

export function openRollSheet({ requestId = null } = {}) {
  const req = requestId ? requestById(requestId) : null;
  const available = () => activeStrains().filter((s) => s.grams > 0);
  const valid = (id) => (available().some((s) => s.id === id) ? id : null);
  const last = prefs.get('roll', {});
  const tobaccos = settings().tobaccos ?? [];
  const filters = settings().filters ?? [];

  const st = {
    rows: [
      {
        strainId: valid(req?.strainId) ?? valid(last.strainId) ?? available()[0]?.id ?? '',
        gramsText: inputNum(req?.grams ?? last.grams ?? 0.5),
      },
    ],
    tobacco: last.tobacco === null || tobaccos.includes(last.tobacco) ? last.tobacco : tobaccos[0] ?? null,
    carbonFilter: last.carbonFilter ?? true,
    filterBrand: filters.includes(last.filterBrand) ? last.filterBrand : filters[0] ?? null,
    note: '',
    notify: true,
  };

  /** Gramm je Sorte über alle Zeilen (falls eine Sorte doppelt gewählt ist). */
  function usage() {
    const used = new Map();
    for (const row of st.rows) {
      const g = parseNum(row.gramsText);
      if (Number.isFinite(g)) used.set(row.strainId, (used.get(row.strainId) || 0) + g);
    }
    return used;
  }

  function summary() {
    const used = usage();
    let grams = 0;
    let mg = 0;
    let cost = null;
    let ok = st.rows.length > 0;
    for (const row of st.rows) {
      const g = parseNum(row.gramsText);
      const s = strain(row.strainId);
      if (!s || !Number.isFinite(g) || g <= 0) {
        ok = false;
        continue;
      }
      grams += g;
      mg += thcMg(g, s.thc);
      if (s.pricePerGram != null) cost = (cost ?? 0) + g * s.pricePerGram;
    }
    for (const [id, g] of used) {
      const s = strain(id);
      if (s && g > s.grams + 0.0005) ok = false;
    }
    return { grams, mg, cost, ok };
  }

  const summaryText = (sum) =>
    [sum.mg > 0 ? `≈ ${fmtNum(Math.round(sum.mg))} mg THC` : 'THC unbekannt', sum.cost != null ? `≈ ${fmtEur(sum.cost)}` : null]
      .filter(Boolean)
      .join(' · ');

  function afterText(row) {
    const s = strain(row.strainId);
    const g = parseNum(row.gramsText);
    if (!s) return html`<span class="faint">Bitte eine Sorte wählen</span>`;
    if (!Number.isFinite(g) || g <= 0) return html`<span class="faint">Bitte eine Menge eingeben</span>`;
    const rest = s.grams - (usage().get(s.id) ?? g);
    if (rest < -0.0005) {
      return html`<span style="color:var(--danger)">${icon('triangle-alert', { size: 14, className: 'inline' })} Nur noch ${fmtG(s.grams)} ${s.name} da</span>`;
    }
    const low = rest <= (settings().lowStockGrams ?? 2);
    return html`<span class="${low ? '' : 'faint'}" style="${low ? 'color:var(--warn)' : ''}">Danach noch ${fmtG(Math.max(0, rest))} ${s.name}${low ? ' – wird knapp' : ''}</span>`;
  }

  function rowHtml(row, i) {
    const g = parseNum(row.gramsText);
    return html`
      <div class="card card--tight stack" style="gap:12px;background:rgba(0,0,0,0.16);border:1px solid var(--stroke)">
        <div class="row">
          <select class="select grow" data-change="strain" data-row="${i}" aria-label="Sorte">
            ${available().map(
              (s) => html`<option value="${s.id}" ${s.id === row.strainId ? 'selected' : ''}>${s.name} · ${fmtG(s.grams)} da${s.thc != null ? ` · ${fmtPct(s.thc)} THC` : ''}</option>`,
            )}
          </select>
          ${st.rows.length > 1 ? html`<button type="button" class="icon-btn" data-click="remove-row" data-row="${i}" aria-label="Sorte entfernen">${icon('trash-2', { size: 18 })}</button>` : ''}
        </div>
        <div class="stepper">
          <button type="button" class="stepper__btn" data-click="step" data-row="${i}" data-delta="-1" aria-label="${fmtNum(STEP)} g weniger">${icon('minus')}</button>
          <div class="input-suffix grow">
            <input class="input num" inputmode="decimal" autocomplete="off" enterkeyhint="done"
              data-input="grams" data-row="${i}" value="${row.gramsText}" aria-label="Menge in Gramm" />
            <span class="input-suffix__text">g</span>
          </div>
          <button type="button" class="stepper__btn" data-click="step" data-row="${i}" data-delta="1" aria-label="${fmtNum(STEP)} g mehr">${icon('plus')}</button>
        </div>
        <div class="chip-select chip-select--quick" data-quick="${i}">
          ${JOINT_QUICK_GRAMS.map(
            (q) => html`<button type="button" class="chip-option" data-click="quick" data-row="${i}" data-value="${q}" aria-pressed="${pressed(Math.abs(g - q) < 0.0005)}">${fmtNum(q)} g</button>`,
          )}
        </div>
        <div class="tiny" data-after="${i}">${afterText(row)}</div>
      </div>`;
  }

  const chip = (action, value, label, active) => html`
    <button type="button" class="chip-option" data-click="${action}" data-value="${value}" aria-pressed="${pressed(active)}">
      ${active ? icon('check', { size: 16, className: 'check' }) : ''}${label}
    </button>`;

  function render() {
    const requester = req ? nameOf(req.fromId) : null;
    if (!available().length) {
      return {
        title: 'Joint rollen',
        body: emptyState({
          iconName: 'package',
          title: 'Kein Bestand vorhanden',
          text: 'Leg zuerst eine Sorte mit Menge an – dann kannst du Joints eintragen.',
          action: html`<button type="button" class="btn btn--primary" data-click="new-strain">${icon('plus')} Sorte anlegen</button>`,
        }),
      };
    }
    const sum = summary();
    return {
      title: 'Joint rollen',
      subtitle: 'Sorte und Menge werden automatisch vom Bestand abgezogen.',
      body: html`
        ${req ? html`
          <div class="hint-box" style="margin-bottom:18px">${icon('hand-heart')}
            <div>Für die Anfrage von <strong>${requester}</strong>${req.message ? html` – „${req.message}“` : ''}.
            ${requester} bekommt automatisch Platz #2 in der Rotation.</div>
          </div>` : ''}
        <form id="roll-form" data-submit="submit" novalidate>
          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('cannabis')} Sorte & Menge</h3>
            ${st.rows.map(rowHtml)}
            ${st.rows.length < MAX_ROWS ? html`
              <button type="button" class="btn btn--ghost btn--sm" data-click="add-row" style="align-self:flex-start">
                ${icon('circle-plus', { size: 16 })} Weitere Sorte mischen
              </button>` : ''}
          </section>

          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('leaf')} Tabak</h3>
            <div class="chip-select">
              ${chip('tobacco', '', 'Pur, ohne Tabak', st.tobacco === null)}
              ${tobaccos.map((t) => chip('tobacco', t, t, st.tobacco === t))}
            </div>
          </section>

          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('carbon-filter')} Filter</h3>
            <label class="switch-row">
              <span class="switch-row__text">
                <span class="strong" style="display:block">Aktivkohlefilter</span>
                <span class="tiny faint">${st.carbonFilter ? 'Welcher Filter wurde benutzt?' : 'Ohne – normaler Tip'}</span>
              </span>
              <span class="switch">
                <input type="checkbox" data-change="toggle-filter" ${st.carbonFilter ? 'checked' : ''} aria-label="Aktivkohlefilter benutzt" />
                <span class="switch__track"></span>
              </span>
            </label>
            ${st.carbonFilter ? html`
              <div class="chip-select">
                ${filters.map((f) => chip('filter', f, f, st.filterBrand === f))}
                ${chip('filter', '', 'Andere / egal', st.filterBrand === null)}
              </div>` : ''}
          </section>

          <section class="sheet-section">
            <h3 class="sheet-section__title">${icon('pencil')} Notiz & Benachrichtigung</h3>
            <textarea class="textarea" data-input="note" rows="2" maxlength="280"
              placeholder="Optional, z. B. „für nach dem Essen“">${st.note}</textarea>
            <label class="switch-row">
              <span class="switch-row__text">
                <span class="strong" style="display:block">Gruppe benachrichtigen</span>
                <span class="tiny faint">Push an alle, damit sie sich in die Rotation eintragen können</span>
              </span>
              <span class="switch">
                <input type="checkbox" data-change="toggle-notify" ${st.notify ? 'checked' : ''} aria-label="Gruppe benachrichtigen" />
                <span class="switch__track"></span>
              </span>
            </label>
          </section>
        </form>`,
      foot: html`
        <div class="grow">
          <div class="strong num" data-summary="grams" style="font-size:18px">${fmtG(sum.grams)}</div>
          <div class="tiny faint" data-summary="thc">${summaryText(sum)}</div>
        </div>
        <button type="submit" form="roll-form" class="btn btn--primary" data-submit-btn ${sum.ok ? '' : 'disabled'}>
          ${icon('joint')} Joint eintragen
        </button>`,
    };
  }

  /** Beim Tippen nur die abhängigen Teile aktualisieren (Fokus bleibt im Feld). */
  function refreshLive() {
    const root = sheet.el;
    st.rows.forEach((row, i) => {
      const after = root.querySelector(`[data-after="${i}"]`);
      if (after) after.innerHTML = afterText(row);
      const g = parseNum(row.gramsText);
      root.querySelectorAll(`[data-quick="${i}"] [data-value]`).forEach((b) => {
        b.setAttribute('aria-pressed', pressed(Math.abs(g - Number(b.dataset.value)) < 0.0005));
      });
    });
    const sum = summary();
    const grams = root.querySelector('[data-summary="grams"]');
    const thc = root.querySelector('[data-summary="thc"]');
    const submit = root.querySelector('[data-submit-btn]');
    if (grams) grams.textContent = fmtG(sum.grams);
    if (thc) thc.textContent = summaryText(sum);
    if (submit) submit.disabled = !sum.ok;
  }

  const rowOf = (el) => st.rows[Number(el.dataset.row)];

  const sheet = openSheet({
    render,
    handlers: {
      strain(el) {
        rowOf(el).strainId = el.value;
        refreshLive();
      },
      grams(el) {
        rowOf(el).gramsText = el.value;
        refreshLive();
      },
      step(el) {
        const row = rowOf(el);
        const current = parseNum(row.gramsText);
        const next = Math.max(STEP, Math.round(((Number.isFinite(current) ? current : 0) + STEP * Number(el.dataset.delta)) * 100) / 100);
        row.gramsText = inputNum(next);
        const input = sheet.el.querySelector(`[data-input="grams"][data-row="${el.dataset.row}"]`);
        if (input) input.value = row.gramsText;
        refreshLive();
      },
      quick(el) {
        const row = rowOf(el);
        row.gramsText = inputNum(Number(el.dataset.value));
        const input = sheet.el.querySelector(`[data-input="grams"][data-row="${el.dataset.row}"]`);
        if (input) input.value = row.gramsText;
        refreshLive();
      },
      'add-row'() {
        const used = new Set(st.rows.map((r) => r.strainId));
        const next = available().find((s) => !used.has(s.id)) ?? available()[0];
        st.rows.push({ strainId: next?.id ?? '', gramsText: inputNum(0.2) });
        sheet.update();
      },
      'remove-row'(el) {
        st.rows.splice(Number(el.dataset.row), 1);
        sheet.update();
      },
      tobacco(el) {
        st.tobacco = el.dataset.value || null;
        sheet.update();
      },
      filter(el) {
        st.filterBrand = el.dataset.value || null;
        sheet.update();
      },
      'toggle-filter'(el) {
        st.carbonFilter = el.checked;
        sheet.update();
      },
      'toggle-notify'(el) {
        st.notify = el.checked;
      },
      note(el) {
        st.note = el.value;
      },
      'new-strain'() {
        sheet.close();
        openStrainForm();
      },
      async submit() {
        const button = sheet.el.querySelector('[data-submit-btn]');
        await busy(button, async () => {
          const joint = await act('POST', '/api/joints', {
            components: st.rows.map((r) => ({ strainId: r.strainId, grams: parseNum(r.gramsText) })),
            tobacco: st.tobacco,
            carbonFilter: st.carbonFilter,
            filterBrand: st.carbonFilter ? st.filterBrand : null,
            note: st.note,
            notify: st.notify,
            requestId,
          });
          prefs.set('roll', {
            strainId: st.rows[0].strainId,
            grams: parseNum(st.rows[0].gramsText),
            tobacco: st.tobacco,
            carbonFilter: st.carbonFilter,
            filterBrand: st.filterBrand,
          });
          sheet.close();
          toast({
            title: 'Joint eingetragen 🌿',
            body: `${fmtG(joint.grams)} vom Bestand abgezogen${st.notify ? ', die Gruppe weiß Bescheid.' : '.'}`,
            tone: 'success',
            timeout: 8000,
            action: {
              label: 'Rückgängig',
              async onClick() {
                await act('DELETE', `/api/joints/${joint.id}`);
                toast({ title: 'Rückgängig gemacht', body: 'Die Menge ist wieder im Bestand.' });
              },
            },
          });
          const here = router.current();
          if (!here || here === '#/' || here === '#') window.scrollTo({ top: 0, behavior: 'smooth' });
          else router.go('#/');
        });
      },
    },
  });
  return sheet;
}
