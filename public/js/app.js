// Einstieg: Start, Routing, Rendern und globale Aktionen.

import { connectLive, disconnectLive, refresh, request, setUnauthorizedHandler } from './api.js';
import { jointHandlers, requestHandlers } from './actions.js';
import { avatar } from './components.js';
import { html } from './lib/html.js';
import { icon } from './lib/icons.js';
import { currentSubscription, registerServiceWorker, syncSubscription } from './push.js';
import { activeJoints, incomingRequests, jointWithMyTurn, me, setToken, store, subscribe } from './store.js';
import { closeAllSheets, confirmDialog, delegate, refreshLiveSheets, toast } from './ui.js';
import { openJointDetail } from './sheets/joint.js';
import { openRollSheet } from './sheets/roll.js';
import { dashboardHandlers, dashboardView } from './views/dashboard.js';
import { jointsHandlers, jointsView } from './views/joints.js';
import { loginHandlers, renderLogin, setLoginCallback } from './views/login.js';
import { profileHandlers, profileView, resetPushCheck } from './views/profile.js';
import { requestsHandlers, requestsView } from './views/requests.js';
import { stockHandlers, stockView } from './views/stock.js';
import { router } from './lib/router.js';

const ROUTES = {
  '': { view: dashboardView, title: 'Übersicht' },
  bestand: { view: stockView, title: 'Bestand' },
  joints: { view: jointsView, title: 'Joints' },
  anfragen: { view: requestsView, title: 'Anfragen' },
  profil: { view: profileView, title: 'Profil' },
};

function parseRoute() {
  const [name = '', id = null] = router.current().replace(/^#\/?/, '').split(/[/?]/);
  return ROUTES[name] ? { name, id } : { name: '', id: null };
}

const root = document.getElementById('root');
let renderedRoute = null;
let pendingRender = false;

// ---------------------------------------------------------------------------
// Rendern

const LIVE_LABELS = { live: 'Live', connecting: 'Verbinde …', offline: 'Offline' };

function topbar() {
  return html`
    <a class="brand" href="#/" aria-label="Else Live – Übersicht">
      <span class="brand__mark">${icon('leaf', { size: 19 })}</span>
      <span class="brand__name">Else Live</span>
    </a>
    <span class="live-pill" data-status="${store.connection}" title="Verbindungsstatus">
      <span class="live-dot"></span>${LIVE_LABELS[store.connection]}
    </span>
    <span class="topbar__spacer"></span>
    <a href="#/profil" class="avatar-btn" aria-label="Profil">${avatar(me(), { online: false })}</a>`;
}

function nav(route) {
  const active = activeJoints().length;
  const incoming = incomingRequests().length;
  const item = (name, href, ic, label, badge = 0) => html`
    <a class="nav__item" href="${href}" ${route === name ? html`aria-current="page"` : ''}>
      ${icon(ic, { size: 22 })}<span>${label}</span>
      ${badge ? html`<span class="count-badge">${badge}</span>` : ''}
    </a>`;
  return html`
    ${item('', '#/', 'house', 'Übersicht')}
    ${item('bestand', '#/bestand', 'leaf', 'Bestand')}
    <button type="button" class="nav__fab" data-click="open-roll" aria-label="Joint gerollt eintragen">${icon('plus', { size: 28 })}</button>
    ${item('joints', '#/joints', 'cigarette', 'Joints', active)}
    ${item('anfragen', '#/anfragen', 'hand-heart', 'Anfragen', incoming)}`;
}

function focusedField(container) {
  const el = document.activeElement;
  return el && container.contains(el) && el.matches('input:not([type=checkbox]), textarea, select');
}

function render() {
  if (!store.state) {
    renderedRoute = null;
    renderLogin();
    return;
  }
  if (!root.querySelector('.app')) {
    root.innerHTML = `
      <div class="app">
        <header class="topbar" id="topbar"></header>
        <main class="view" id="view"></main>
      </div>
      <nav class="nav" id="nav" aria-label="Hauptnavigation"></nav>`;
  }

  const route = parseRoute();
  root.querySelector('#topbar').innerHTML = topbar();
  root.querySelector('#nav').innerHTML = nav(route.name);

  let view = root.querySelector('#view');
  // Nicht mitten ins Tippen hinein neu zeichnen – das passiert beim Verlassen des Feldes.
  if (renderedRoute === route.name && focusedField(view)) {
    pendingRender = true;
  } else {
    if (renderedRoute !== route.name) {
      const fresh = view.cloneNode(false);
      view.replaceWith(fresh);
      view = fresh;
      window.scrollTo(0, 0);
    }
    view.innerHTML = ROUTES[route.name].view(route);
    renderedRoute = route.name;
    pendingRender = false;
  }

  const turn = jointWithMyTurn();
  document.title = `${turn ? '🔥 ' : ''}${ROUTES[route.name].title} · Else Live`;
  refreshLiveSheets();
}

root.addEventListener('focusout', () => {
  if (pendingRender) setTimeout(() => !focusedField(root) && render(), 0);
});

// ---------------------------------------------------------------------------
// Sitzung

function startSession() {
  connectLive({
    onNotes(notes) {
      for (const note of notes) toast({ title: note.title, body: note.body, url: note.url });
    },
  });
  syncSubscription();
}

function endSessionLocally() {
  disconnectLive();
  setToken(null);
  store.state = null;
  resetPushCheck();
  closeAllSheets();
  render();
}

setUnauthorizedHandler(() => {
  endSessionLocally();
  toast({ title: 'Bitte melde dich neu an', body: 'Deine Anmeldung ist abgelaufen.', tone: 'error' });
});

setLoginCallback(() => {
  startSession();
  if (router.current().includes('code=')) router.replace('#/');
  render();
});

async function logout() {
  const ok = await confirmDialog({
    title: 'Abmelden?',
    message: 'Auf diesem Gerät kommen dann auch keine Push-Nachrichten mehr für dein Profil an.',
    confirmLabel: 'Abmelden',
  });
  if (!ok) return;
  const sub = await currentSubscription().catch(() => null);
  await request('POST', '/api/auth/logout', { endpoint: sub?.endpoint }).catch(() => {});
  await sub?.unsubscribe().catch(() => {});
  endSessionLocally();
}

// ---------------------------------------------------------------------------
// Routing & Deep-Links (z. B. aus einer Push-Nachricht: #/joints/<id>)

function handleDeepLink() {
  const route = parseRoute();
  if (store.state && route.name === 'joints' && route.id) {
    router.replace('#/joints');
    closeAllSheets();
    openJointDetail(route.id);
  }
}

router.onChange(() => {
  handleDeepLink();
  render();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !store.state) return;
  refresh().catch(() => {});
  if (store.connection !== 'live') startSession();
});

delegate(root, {
  ...loginHandlers,
  ...dashboardHandlers,
  ...stockHandlers,
  ...jointsHandlers,
  ...requestsHandlers,
  ...profileHandlers,
  ...jointHandlers,
  ...requestHandlers,
  'open-roll': () => openRollSheet(),
  reload: () => location.reload(),
  logout,
});

subscribe(render);

// ---------------------------------------------------------------------------
// Start

async function boot() {
  registerServiceWorker();
  try {
    store.meta = await request('GET', '/api/meta');
  } catch {
    root.innerHTML = html`
      <main class="login"><div class="login__card glass empty">
        <div class="empty__icon">${icon('triangle-alert', { size: 26 })}</div>
        <div class="empty__title">Server nicht erreichbar</div>
        <p class="empty__text">Prüfe deine Verbindung und lade die Seite neu.</p>
        <button type="button" class="btn btn--primary" data-click="reload">Neu laden</button>
      </div></main>`;
    return;
  }
  if (store.token) {
    try {
      await refresh();
    } catch (err) {
      if (err.status === 401) setToken(null);
    }
  }
  if (store.state) {
    startSession();
    handleDeepLink();
  }
  render();
}

boot();
