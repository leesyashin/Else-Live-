import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

let instance;
let server;
let base;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'else-live-test-'));
  instance = await createApp({ dataDir, log: { error() {}, warn() {} } });
  server = instance.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await instance.close();
  server.close();
  await rm(dataDir, { recursive: true, force: true });
});

async function call(method, url, { token, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

describe('API', () => {
  let vincent;
  let lisa;

  it('erste Person richtet die Gruppe ohne Code ein', async () => {
    assert.equal((await call('GET', '/api/meta')).data.setup, true);
    const res = await call('POST', '/api/auth/register', { body: { name: 'Vincent' } });
    assert.equal(res.status, 200);
    vincent = res.data.token;
    assert.equal((await call('GET', '/api/meta')).data.setup, false);
  });

  it('weitere Personen brauchen den Gruppencode', async () => {
    const wrong = await call('POST', '/api/auth/register', { body: { name: 'Lisa', code: 'FALSCH' } });
    assert.equal(wrong.status, 403);
    const res = await call('POST', '/api/auth/register', { body: { name: 'Lisa', code: instance.inviteCode, pin: '1234' } });
    assert.equal(res.status, 200);
    lisa = res.data.token;
  });

  it('PIN wird beim Login geprüft', async () => {
    const { data } = await call('POST', '/api/auth/members', { body: { code: instance.inviteCode } });
    const lisaMember = data.members.find((m) => m.name === 'Lisa');
    assert.equal(lisaMember.hasPin, true);
    assert.equal((await call('POST', '/api/auth/login', { body: { code: instance.inviteCode, memberId: lisaMember.id, pin: '0000' } })).status, 403);
    assert.equal((await call('POST', '/api/auth/login', { body: { code: instance.inviteCode, memberId: lisaMember.id, pin: '1234' } })).status, 200);
  });

  it('ohne Anmeldung gibt es keine Daten', async () => {
    assert.equal((await call('GET', '/api/state')).status, 401);
    assert.equal((await call('GET', '/api/state', { token: 'quatsch' })).status, 401);
  });

  it('Sorte anlegen, Joint rollen, Rotation – der Bestand stimmt', async () => {
    const strain = await call('POST', '/api/strains', { token: vincent, body: { name: 'Amnesia', thc: '22', grams: '5' } });
    assert.equal(strain.status, 200);
    const strainId = strain.data.result.id;

    const joint = await call('POST', '/api/joints', {
      token: vincent,
      body: { components: [{ strainId, grams: '0,75' }], tobacco: 'Pueblo', carbonFilter: true, filterBrand: 'Purize Xtra Slim' },
    });
    assert.equal(joint.status, 200);
    assert.equal(joint.data.state.strains[0].grams, 4.25);

    const claim = await call('POST', `/api/joints/${joint.data.result.id}/rotation`, { token: lisa, body: { position: 2 } });
    assert.equal(claim.status, 200);
    assert.deepEqual(claim.data.result.rotation.map((r) => r.position), [1, 2]);

    const tooMuch = await call('POST', '/api/joints', { token: vincent, body: { components: [{ strainId, grams: 10 }] } });
    assert.equal(tooMuch.status, 409);
    assert.match(tooMuch.data.error, /Nicht genug/);
  });

  it('unbekannte Endpunkte liefern JSON-404', async () => {
    const res = await call('GET', '/api/gibtsnicht', { token: vincent });
    assert.equal(res.status, 404);
  });
});
