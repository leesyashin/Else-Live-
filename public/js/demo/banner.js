// Demo: Leiste über der App – Person wechseln und Vorschau zurücksetzen.

import { avatar } from '../components.js';
import { html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { router } from '../lib/router.js';
import { store, subscribe } from '../store.js';
import { closeAllSheets, toast } from '../ui.js';
import { demo } from './api.js';

const bar = document.createElement('div');
bar.className = 'demo-bar';
document.body.insertBefore(bar, document.getElementById('root'));

function render() {
  const current = store.state ? demo.meId() : null;
  bar.innerHTML = html`
    <div class="demo-bar__inner">
      <span class="demo-bar__tag">Vorschau</span>
      <span class="demo-bar__label">Ansicht als</span>
      <div class="demo-bar__people" role="group" aria-label="Person wechseln">
        ${demo.members().map(
          (m) => html`<button type="button" class="demo-person" data-demo-person="${m.id}" aria-pressed="${String(m.id === current)}">
            ${avatar(m, { size: 'xs', online: false })}<span>${m.name}</span></button>`,
        )}
      </div>
      <button type="button" class="demo-bar__reset" data-demo-reset>${icon('rotate-ccw', { size: 14 })} Neu starten</button>
    </div>`;
}

bar.addEventListener('click', (event) => {
  const person = event.target.closest('[data-demo-person]');
  if (person) {
    if (person.dataset.demoPerson === demo.meId() && store.state) return;
    closeAllSheets();
    demo.switchTo(person.dataset.demoPerson);
    toast({ title: `Du bist jetzt ${store.state.me.name} ${store.state.me.emoji}`, body: 'So sieht die App für diese Person aus.' });
    return;
  }
  if (event.target.closest('[data-demo-reset]')) {
    closeAllSheets();
    demo.reset();
    router.go('#/');
    toast({ title: 'Vorschau neu gestartet', body: 'Alle Beispieldaten sind wieder wie am Anfang.' });
  }
});

subscribe(render);
demo.onChange(render);
render();

setTimeout(() => {
  if (!store.state) return;
  toast({
    title: `Willkommen, ${store.state.me.name}!`,
    body: 'Das ist eine Vorschau mit Beispieldaten. Die anderen reagieren auf das, was du tust.',
    timeout: 7000,
  });
}, 700);
