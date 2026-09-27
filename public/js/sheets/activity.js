// Alle Aktivitäten der Gruppe (aktualisiert sich live).

import { activityFeed } from '../components.js';
import { html } from '../lib/html.js';
import { store } from '../store.js';
import { openSheet } from '../ui.js';

export function openActivitySheet() {
  return openSheet({
    live: true,
    render() {
      const items = [...(store.state?.activity ?? [])].reverse();
      return {
        title: 'Aktivität',
        subtitle: 'Alles, was in der Gruppe passiert ist',
        body: items.length ? activityFeed(items) : html`<p class="small faint">Noch nichts passiert.</p>`,
      };
    },
  });
}
