// Tests fuer database.rules.json (Realtime Database, nur /status) gegen den Emulator.
// Ausfuehren: npm run test:rules (startet Firestore- und Database-Emulator)
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, set } from 'firebase/database';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let env;

const user = (uid) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).database();
const guest = () =>
  env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).database();
const nobody = () => env.unauthenticatedContext().database();
const status = (state) => ({ state, lastChanged: Date.now() });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dabubble-rules',
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9000 },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
});

describe('Realtime Database: /status', () => {
  test('Eigenen Status setzen: online und offline', async () => {
    await assertSucceeds(set(ref(user('A'), 'status/A'), status('online')));
    await assertSucceeds(set(ref(user('A'), 'status/A'), status('offline')));
  });

  test('Fremden Status setzen: verboten', async () => {
    await assertFails(set(ref(user('A'), 'status/B'), status('online')));
    await assertFails(set(ref(nobody(), 'status/A'), status('online')));
  });

  test('Nur gueltige Werte, keine zusaetzlichen Felder', async () => {
    const own = ref(user('A'), 'status/A');
    await assertFails(set(own, status('schlafen')));
    await assertFails(set(own, { state: 'online' }));
    await assertFails(set(own, { state: 'online', lastChanged: 'jetzt' }));
    await assertFails(set(own, { ...status('online'), extra: true }));
  });

  test('Eigenen Eintrag entfernen (Aufraeumen)', async () => {
    await assertSucceeds(set(ref(user('A'), 'status/A'), status('online')));
    await assertSucceeds(remove(ref(user('A'), 'status/A')));
  });

  test('Lesen: registrierte ja, Gaeste und nicht eingeloggt nein', async () => {
    await assertSucceeds(get(ref(user('B'), 'status')));
    await assertFails(get(ref(guest(), 'status')));
    await assertFails(get(ref(nobody(), 'status')));
  });
});
