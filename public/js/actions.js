// Aktionen rund um Joints und Anfragen – genutzt von Ansichten und Sheets.

import { act } from './api.js';
import { nameOf } from './components.js';
import { busy, confirmDialog, toast } from './ui.js';
import { openJointDetail } from './sheets/joint.js';
import { openRollSheet } from './sheets/roll.js';

const jointUrl = (el, suffix = '') => `/api/joints/${el.dataset.joint}${suffix}`;

export const jointHandlers = {
  'open-joint': (el) => openJointDetail(el.dataset.joint),

  async 'claim-slot'(el) {
    const position = Number(el.dataset.position);
    await busy(el, () => act('POST', jointUrl(el, '/rotation'), { position }));
    toast({ title: `Du bist #${position} in der Rotation`, body: 'Du bekommst Bescheid, wenn du dran bist.', tone: 'success' });
  },

  async 'leave-slot'(el) {
    await busy(el, () => act('DELETE', jointUrl(el, `/rotation/${el.dataset.position}`)));
    toast({ title: 'Ausgetragen', body: `Platz #${el.dataset.position} ist wieder frei.` });
  },

  async 'light-joint'(el) {
    await busy(el, () => act('POST', jointUrl(el, '/light')));
    toast({ title: '🔥 Angezündet', body: 'Alle in der Rotation wissen Bescheid.', tone: 'success' });
  },

  async 'pass-joint'(el) {
    const joint = await busy(el, () => act('POST', jointUrl(el, '/pass')));
    if (!joint) return;
    if (joint.status === 'done') {
      toast({ title: 'Runde beendet', body: 'Der Joint ist als aufgeraucht markiert.', tone: 'success' });
    } else {
      const next = joint.rotation.find((r) => r.position === joint.turn);
      toast({ title: `Weiter an ${nameOf(next?.memberId)}`, body: `#${joint.turn} ist jetzt dran.`, tone: 'success' });
    }
  },

  async 'finish-joint'(el) {
    await busy(el, () => act('POST', jointUrl(el, '/finish')));
    toast({ title: 'Als aufgeraucht markiert', tone: 'success' });
  },

  async 'delete-joint'(el) {
    const ok = await confirmDialog({
      title: 'Eintrag löschen?',
      message: 'Der Joint wird entfernt und die Menge wird zurück in den Bestand gebucht. Nutze das für Fehleinträge.',
      confirmLabel: 'Löschen & zurückbuchen',
      danger: true,
    });
    if (!ok) return;
    await act('DELETE', jointUrl(el));
    toast({ title: 'Gelöscht', body: 'Die Menge ist wieder im Bestand.', tone: 'success' });
  },
};

const requestUrl = (el, suffix) => `/api/requests/${el.dataset.request}/${suffix}`;

export const requestHandlers = {
  'fulfil-request': (el) => openRollSheet({ requestId: el.dataset.request }),

  async 'accept-request'(el) {
    await busy(el, () => act('POST', requestUrl(el, 'accept')));
    toast({ title: 'Zugesagt 👍', body: 'Trag den Joint ein, sobald er gerollt ist.', tone: 'success' });
  },

  async 'decline-request'(el) {
    await busy(el, () => act('POST', requestUrl(el, 'decline')));
    toast({ title: 'Abgelehnt', body: 'Die anfragende Person bekommt Bescheid.' });
  },

  async 'cancel-request'(el) {
    await busy(el, () => act('POST', requestUrl(el, 'cancel')));
    toast({ title: 'Anfrage zurückgezogen' });
  },
};
