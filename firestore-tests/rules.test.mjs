// Tests fuer firestore.rules gegen den lokalen Firestore-Emulator.
// Ausfuehren: npm run test:rules
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-dabubble-rules';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let env;

// --- Beteiligte ---------------------------------------------------------------
// A, B, C, D = registrierte User; D ist Demo-User. "guest" = anonymer Login.
const guest = () =>
  env.authenticatedContext('guest', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const user = (uid) =>
  env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();

const message = (id, senderId, extra = {}) => ({
  id,
  senderId,
  text: 'Hallo',
  timestamp: Date.now(),
  reactions: [],
  ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

/** Ausgangsdaten, ohne Rules geschrieben. */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const profile = (id, isDemo = false) => ({
      id,
      name: id,
      email: `${id}@test.de`,
      avatarUrl: '',
      onlineStatus: 'online',
      ...(isDemo ? { isDemo: true } : {}),
    });
    await setDoc(doc(db, 'users/A'), profile('A'));
    await setDoc(doc(db, 'users/B'), profile('B'));
    await setDoc(doc(db, 'users/D'), profile('D', true));

    const channel = (id, name, memberIds, createdBy, guestVisible = false) => ({
      id, name, description: '', memberIds, createdBy, createdAt: 1, guestVisible,
    });
    await setDoc(doc(db, 'channels/demo'), channel('demo', 'Entwicklerteam', ['D'], 'D', true));
    await setDoc(doc(db, 'channels/office'), channel('office', 'Office-Team', ['B'], 'B'));
    await setDoc(doc(db, 'channels/private'), channel('private', 'Geheim', ['B', 'C'], 'B'));
    await setDoc(doc(db, 'channels/demo/messages/m1'), message('m1', 'D', { channelId: 'demo' }));
    await setDoc(doc(db, 'channels/private/messages/m1'), message('m1', 'B', { channelId: 'private' }));

    await setDoc(doc(db, 'directChats/bc'), { id: 'bc', memberIds: ['B', 'C'], createdAt: 1 });
    await setDoc(doc(db, 'directChats/bc/messages/m1'), message('m1', 'B', { dmId: 'bc' }));
  });
});

// --- Die drei vorgegebenen Faelle ----------------------------------------------

describe('Vorgegebene Faelle', () => {
  test('Gast liest guestVisible-Channel: erlaubt', async () => {
    await assertSucceeds(getDoc(doc(guest(), 'channels/demo')));
  });

  test('Gast liest privaten Channel: verboten', async () => {
    await assertFails(getDoc(doc(guest(), 'channels/private')));
  });

  test('User A liest DM von B+C: verboten', async () => {
    await assertFails(getDoc(doc(user('A'), 'directChats/bc')));
    await assertFails(getDocs(collection(user('A'), 'directChats/bc/messages')));
  });
});

// --- Channels -------------------------------------------------------------------

describe('Channels lesen', () => {
  test('Nicht eingeloggt: nichts', async () => {
    await assertFails(getDoc(doc(nobody(), 'channels/demo')));
  });

  test('Mitglied liest privaten Channel und dessen Nachrichten', async () => {
    await assertSucceeds(getDoc(doc(user('B'), 'channels/private')));
    await assertSucceeds(getDocs(collection(user('B'), 'channels/private/messages')));
  });

  test('Nicht-Mitglied liest privaten Channel/Nachrichten nicht', async () => {
    await assertFails(getDoc(doc(user('A'), 'channels/private')));
    await assertFails(getDocs(collection(user('A'), 'channels/private/messages')));
  });

  test('Office-Team fuer alle registrierten, nicht fuer Gaeste', async () => {
    await assertSucceeds(getDoc(doc(user('A'), 'channels/office')));
    await assertFails(getDoc(doc(guest(), 'channels/office')));
  });

  test('Die drei Sichtbarkeits-Abfragen des ChannelService sind erlaubt', async () => {
    const channels = collection(user('A'), 'channels');
    await assertSucceeds(getDocs(query(channels, where('guestVisible', '==', true))));
    await assertSucceeds(getDocs(query(channels, where('memberIds', 'array-contains', 'A'))));
    await assertSucceeds(getDocs(query(channels, where('name', '==', 'Office-Team'))));
  });

  test('Gast-Abfrage nur auf guestVisible erlaubt, ungefiltert verboten', async () => {
    const channels = collection(guest(), 'channels');
    await assertSucceeds(getDocs(query(channels, where('guestVisible', '==', true))));
    await assertFails(getDocs(channels));
  });

  test('Ungefilterte Abfrage aller Channels ist auch fuer registrierte verboten', async () => {
    await assertFails(getDocs(collection(user('A'), 'channels')));
  });
});

describe('Channels schreiben', () => {
  const newChannel = (createdBy, memberIds) => ({
    id: 'neu', name: 'Neu', description: '', memberIds, createdBy, createdAt: 1, guestVisible: false,
  });

  test('Registrierter User legt Channel als Ersteller und Mitglied an', async () => {
    await assertSucceeds(setDoc(doc(user('A'), 'channels/neu'), newChannel('A', ['A'])));
  });

  test('Gast darf keinen Channel anlegen', async () => {
    await assertFails(setDoc(doc(guest(), 'channels/neu'), newChannel('guest', ['guest'])));
  });

  test('Channel im Namen eines anderen anlegen: verboten', async () => {
    await assertFails(setDoc(doc(user('A'), 'channels/neu'), newChannel('B', ['A', 'B'])));
  });

  test('Nur der Ersteller aendert den Namen', async () => {
    await assertSucceeds(updateDoc(doc(user('B'), 'channels/private'), { name: 'Neu' }));
    // Eigener Wert: denselben Namen nochmal zu setzen ist keine Aenderung und waere erlaubt.
    await assertFails(updateDoc(doc(user('C'), 'channels/private'), { name: 'Von C' }));
  });

  test('Mitglied fuegt Mitglied hinzu, Nicht-Mitglied nicht', async () => {
    await assertSucceeds(
      updateDoc(doc(user('C'), 'channels/private'), { memberIds: arrayUnion('A') }),
    );
    await assertFails(
      updateDoc(doc(user('A'), 'channels/office'), { memberIds: arrayUnion('A') }),
    );
  });

  test('Channel mit guestVisible: true anlegen: verboten', async () => {
    await assertFails(
      setDoc(doc(user('A'), 'channels/neu'), { ...newChannel('A', ['A']), guestVisible: true }),
    );
  });

  test('Channel namens "Office-Team" anlegen oder dahin umbenennen: verboten', async () => {
    await assertFails(
      setDoc(doc(user('A'), 'channels/neu'), { ...newChannel('A', ['A']), name: 'Office-Team' }),
    );
    await assertFails(updateDoc(doc(user('B'), 'channels/private'), { name: 'Office-Team' }));
  });

  test('Office-Team selbst bleibt fuer Mitglieder bearbeitbar', async () => {
    await assertSucceeds(
      updateDoc(doc(user('B'), 'channels/office'), { memberIds: arrayUnion('A') }),
    );
  });

  test('Geschuetzte Felder (createdBy, guestVisible) bleiben unveraenderlich', async () => {
    await assertFails(updateDoc(doc(user('B'), 'channels/private'), { createdBy: 'C' }));
    await assertFails(updateDoc(doc(user('B'), 'channels/private'), { guestVisible: true }));
  });
});

// --- Nachrichten, Reactions, Threads -------------------------------------------

describe('Nachrichten', () => {
  test('Gast schreibt im guestVisible-Channel (Entscheidung: Gaeste duerfen mitmachen)', async () => {
    await assertSucceeds(
      setDoc(doc(guest(), 'channels/demo/messages/g1'), message('g1', 'guest', { channelId: 'demo' })),
    );
  });

  test('Gast schreibt nicht in privaten Channel', async () => {
    await assertFails(
      setDoc(
        doc(guest(), 'channels/private/messages/g1'),
        message('g1', 'guest', { channelId: 'private' }),
      ),
    );
  });

  test('Nachricht mit fremder senderId: verboten', async () => {
    await assertFails(
      setDoc(doc(user('B'), 'channels/private/messages/x'), message('x', 'C', { channelId: 'private' })),
    );
  });

  test('Reaction setzen erlaubt, Text fremder Nachricht aendern verboten', async () => {
    const ref = doc(user('C'), 'channels/private/messages/m1');
    await assertSucceeds(
      updateDoc(ref, { reactions: arrayUnion({ emoji: '👍', userId: 'C', messageId: 'm1' }) }),
    );
    await assertFails(updateDoc(ref, { text: 'geaendert' }));
  });

  test('Nachricht bearbeiten: Absender aendert eigenen Text', async () => {
    await assertSucceeds(
      updateDoc(doc(user('B'), 'channels/private/messages/m1'), { text: 'bearbeitet' }),
    );
  });

  test('Nachricht bearbeiten: nur der Text, keine anderen Felder', async () => {
    const ref = doc(user('B'), 'channels/private/messages/m1');
    await assertFails(updateDoc(ref, { text: 'bearbeitet', senderId: 'C' }));
    await assertFails(updateDoc(ref, { text: 'bearbeitet', timestamp: 1 }));
    await assertFails(updateDoc(ref, { text: 42 }));
  });

  test('Nachricht bearbeiten: Gast aendert eigene Nachricht im guestVisible-Channel', async () => {
    const db = guest();
    const ref = doc(db, 'channels/demo/messages/g1');
    await assertSucceeds(setDoc(ref, message('g1', 'guest', { channelId: 'demo' })));
    await assertSucceeds(updateDoc(ref, { text: 'bearbeitet' }));
    await assertFails(updateDoc(doc(db, 'channels/demo/messages/m1'), { text: 'fremd' }));
  });

  test('Thread-Antwort bearbeiten: eigene ja, fremde nein', async () => {
    const replyRef = 'channels/private/messages/m1/replies/r1';
    await assertSucceeds(
      setDoc(doc(user('C'), replyRef), message('r1', 'C', { channelId: 'private', threadId: 'm1' })),
    );
    await assertSucceeds(updateDoc(doc(user('C'), replyRef), { text: 'bearbeitet' }));
    await assertFails(updateDoc(doc(user('B'), replyRef), { text: 'von B' }));
  });

  test('Thread-Antwort + replyCount: Gast im guestVisible-Channel erlaubt', async () => {
    const db = guest();
    await assertSucceeds(
      setDoc(
        doc(db, 'channels/demo/messages/m1/replies/r1'),
        message('r1', 'guest', { channelId: 'demo', threadId: 'm1' }),
      ),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'channels/demo/messages/m1'), { replyCount: increment(1), lastReplyAt: 5 }),
    );
    await assertFails(updateDoc(doc(db, 'channels/demo/messages/m1'), { lastReplyAt: 'gestern' }));
  });

  test('Thread-Antwort mit falscher threadId: verboten', async () => {
    await assertFails(
      setDoc(
        doc(user('B'), 'channels/private/messages/m1/replies/r1'),
        message('r1', 'B', { channelId: 'private', threadId: 'anders' }),
      ),
    );
  });
});

// --- Direktchats ----------------------------------------------------------------

describe('Direktchats', () => {
  test('Beteiligte lesen und schreiben', async () => {
    await assertSucceeds(getDoc(doc(user('B'), 'directChats/bc')));
    await assertSucceeds(
      setDoc(doc(user('C'), 'directChats/bc/messages/m2'), message('m2', 'C', { dmId: 'bc' })),
    );
  });

  test('Suche nach eigenen DMs (getOrCreateDirectChat) ist erlaubt', async () => {
    const chats = collection(user('B'), 'directChats');
    await assertSucceeds(getDocs(query(chats, where('memberIds', 'array-contains', 'B'))));
  });

  test('DM bearbeiten: Absender ja, anderes DM-Mitglied nein', async () => {
    await assertSucceeds(
      updateDoc(doc(user('B'), 'directChats/bc/messages/m1'), { text: 'bearbeitet' }),
    );
    await assertFails(updateDoc(doc(user('C'), 'directChats/bc/messages/m1'), { text: 'von C' }));
  });

  test('Fremder schreibt nicht in DM', async () => {
    await assertFails(
      setDoc(doc(user('A'), 'directChats/bc/messages/m2'), message('m2', 'A', { dmId: 'bc' })),
    );
  });

  test('DM anlegen: nur mit sich selbst als Mitglied und genau 2 IDs', async () => {
    await assertSucceeds(
      setDoc(doc(user('A'), 'directChats/ab'), { id: 'ab', memberIds: ['A', 'B'], createdAt: 1 }),
    );
    await assertFails(
      setDoc(doc(user('A'), 'directChats/bc2'), { id: 'bc2', memberIds: ['B', 'C'], createdAt: 1 }),
    );
    await assertFails(
      setDoc(doc(user('A'), 'directChats/abc'), {
        id: 'abc', memberIds: ['A', 'B', 'C'], createdAt: 1,
      }),
    );
  });

  test('Gast darf Demo-User per DM anschreiben', async () => {
    const db = guest();
    await assertSucceeds(
      setDoc(doc(db, 'directChats/gd'), { id: 'gd', memberIds: ['guest', 'D'], createdAt: 1 }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'directChats/gd/messages/m1'), message('m1', 'guest', { dmId: 'gd' })),
    );
  });
});

// --- Users ------------------------------------------------------------------------

describe('Users', () => {
  test('Gast liest nur Demo-User (auch per Abfrage)', async () => {
    const db = guest();
    await assertSucceeds(getDoc(doc(db, 'users/D')));
    await assertFails(getDoc(doc(db, 'users/A')));
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('isDemo', '==', true))));
    await assertFails(getDocs(collection(db, 'users')));
  });

  test('Registrierte lesen alle User', async () => {
    await assertSucceeds(getDocs(collection(user('A'), 'users')));
  });

  test('Gast legt kein users-Dokument an (Entscheidung 1)', async () => {
    await assertFails(
      setDoc(doc(guest(), 'users/guest'), {
        id: 'guest', name: 'Gast', email: '', avatarUrl: '', onlineStatus: 'online',
      }),
    );
  });

  test('Eigenes Profil anlegen: ohne isDemo ja, mit isDemo: true nein', async () => {
    const profile = { id: 'C', name: 'C', email: 'C@test.de', avatarUrl: '', onlineStatus: 'online' };
    await assertFails(setDoc(doc(user('C'), 'users/C'), { ...profile, isDemo: true }));
    await assertSucceeds(setDoc(doc(user('C'), 'users/C'), profile));
  });

  test('Status: eigene gueltige Werte ja, ungueltige nein, fremde nie', async () => {
    const own = doc(user('A'), 'users/A');
    await assertSucceeds(updateDoc(own, { onlineStatus: 'busy', chosenStatus: 'busy' }));
    await assertSucceeds(updateDoc(own, { onlineStatus: 'offline' }));
    await assertSucceeds(updateDoc(own, { onlineStatus: 'away', chosenStatus: 'away' }));
    await assertFails(updateDoc(own, { onlineStatus: 'schlafen' }));
    await assertFails(updateDoc(own, { chosenStatus: 42 }));
    await assertFails(updateDoc(doc(user('A'), 'users/B'), { onlineStatus: 'offline' }));
  });

  test('Eigenes Profil: Name aendern ja, isDemo setzen nein; fremdes Profil nie', async () => {
    await assertSucceeds(updateDoc(doc(user('A'), 'users/A'), { name: 'Neu' }));
    await assertFails(updateDoc(doc(user('A'), 'users/A'), { isDemo: true }));
    await assertFails(updateDoc(doc(user('A'), 'users/B'), { name: 'Neu' }));
  });
});
