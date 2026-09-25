// Smoke-Test der deployten firestore.rules gegen das ECHTE Firebase-Projekt.
// Ausfuehren: npm run test:rules:live
//
// Legt Wegwerf-Accounts (2x E-Mail/Passwort, 1x anonym) und Test-Dokumente mit
// Praefix "rulestest-" an und raeumt danach alles wieder ab:
// - Firestore-Dokumente per `firebase firestore:delete` (CLI-Login, umgeht die Rules,
//   die Client-Deletes verbieten)
// - Auth-Accounts per deleteUser() im jeweiligen Client
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInAnonymously,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  terminate,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { environment } from '../src/environments/environment.ts';

const config = environment.firebase;
const RUN = `rulestest-${Date.now()}`;
const ids = {
  privateChannel: `${RUN}-private`,
  dm: `${RUN}-dm`,
};

/** Top-Level-Dokumente, die am Ende rekursiv geloescht werden. */
const cleanupPaths = [];

/** @type {Record<string, { app: import('firebase/app').FirebaseApp, db: import('firebase/firestore').Firestore, uid: string }>} */
const clients = {};

async function makeClient(name, signIn) {
  const app = initializeApp(config, `${RUN}-${name}`);
  const auth = getAuth(app);
  const cred = await signIn(auth);
  clients[name] = { app, db: getFirestore(app), uid: cred.user.uid };
  return clients[name];
}

const ok = (promise) => promise;
async function denied(promise) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, 'permission-denied', `erwartet permission-denied, bekam ${err.code}: ${err.message}`);
    return true;
  });
}

const message = (id, senderId, extra = {}) => ({
  id,
  senderId,
  text: 'Rules-Livetest',
  timestamp: Date.now(),
  reactions: [],
  ...extra,
});

const channel = (id, createdBy, memberIds, guestVisible = false) => ({
  id,
  name: `[${RUN}]`,
  description: 'Automatischer Rules-Livetest, wird sofort geloescht',
  memberIds,
  createdBy,
  createdAt: Date.now(),
  guestVisible,
});

before(async () => {
  const pw = `Pw-${RUN}!`;
  await makeClient('A', (auth) => createUserWithEmailAndPassword(auth, `${RUN}-a@example.com`, pw));
  await makeClient('B', (auth) => createUserWithEmailAndPassword(auth, `${RUN}-b@example.com`, pw));
  await makeClient('guest', (auth) => signInAnonymously(auth));
  clients.nobody = { app: initializeApp(config, `${RUN}-nobody`) };
  clients.nobody.db = getFirestore(clients.nobody.app);
});

after(async () => {
  for (const path of cleanupPaths) {
    try {
      execSync(`firebase firestore:delete "${path}" --recursive --force`, { stdio: 'pipe' });
      console.log(`  aufgeraeumt: ${path}`);
    } catch (err) {
      console.error(`  AUFRAEUMEN FEHLGESCHLAGEN: ${path}\n${err.stderr ?? err}`);
    }
  }
  for (const [name, c] of Object.entries(clients)) {
    const user = getAuth(c.app).currentUser;
    if (user) {
      try {
        await deleteUser(user);
        console.log(`  Account geloescht: ${name} (${user.uid})`);
      } catch (err) {
        console.error(`  ACCOUNT NICHT GELOESCHT: ${name} (${user.uid}): ${err.code}`);
      }
    }
    await terminate(c.db);
    await deleteApp(c.app);
  }
});

describe('Live: Fixtures anlegen (als registrierter User A)', () => {
  test('A legt eigenes users-Dokument an, aber nicht mit isDemo: true', async () => {
    const { db, uid } = clients.A;
    cleanupPaths.push(`users/${uid}`);
    const profile = { id: uid, name: RUN, email: `${RUN}-a@example.com`, avatarUrl: '', onlineStatus: 'online' };
    await denied(setDoc(doc(db, 'users', uid), { ...profile, isDemo: true }));
    await ok(setDoc(doc(db, 'users', uid), profile));
  });

  test('A legt privaten Channel an', async () => {
    const { db, uid } = clients.A;
    cleanupPaths.push(`channels/${ids.privateChannel}`);
    await ok(setDoc(doc(db, 'channels', ids.privateChannel), channel(ids.privateChannel, uid, [uid])));
  });

  test('A legt keinen guestVisible- und keinen "Office-Team"-Channel an', async () => {
    const { db, uid } = clients.A;
    const id = `${RUN}-forbidden`;
    cleanupPaths.push(`channels/${id}`);
    await denied(setDoc(doc(db, 'channels', id), channel(id, uid, [uid], true)));
    await denied(setDoc(doc(db, 'channels', id), { ...channel(id, uid, [uid]), name: 'Office-Team' }));
    await denied(updateDoc(doc(db, 'channels', ids.privateChannel), { name: 'Office-Team' }));
  });

  test('A schreibt Nachricht in privaten Channel', async () => {
    const { db, uid } = clients.A;
    await ok(setDoc(
      doc(db, 'channels', ids.privateChannel, 'messages', 'm1'),
      message('m1', uid, { channelId: ids.privateChannel }),
    ));
  });

  test('A legt DM mit B an', async () => {
    cleanupPaths.push(`directChats/${ids.dm}`);
    await ok(setDoc(doc(clients.A.db, 'directChats', ids.dm), {
      id: ids.dm, memberIds: [clients.A.uid, clients.B.uid], createdAt: Date.now(),
    }));
  });
});

describe('Live: Channels', () => {
  test('Nicht eingeloggt liest nichts', async () => {
    await denied(getDoc(doc(clients.nobody.db, 'channels', ids.privateChannel)));
    await denied(getDocs(query(collection(clients.nobody.db, 'channels'), where('guestVisible', '==', true))));
  });

  test('Gast liest den privaten Channel nicht', async () => {
    await denied(getDoc(doc(clients.guest.db, 'channels', ids.privateChannel)));
  });

  test('Gast: gefilterte Abfrage erlaubt, ungefilterte verboten', async () => {
    const channels = collection(clients.guest.db, 'channels');
    await ok(getDocs(query(channels, where('guestVisible', '==', true))));
    await denied(getDocs(channels));
  });

  test('Nicht-Mitglied B liest privaten Channel und Nachrichten nicht', async () => {
    await denied(getDoc(doc(clients.B.db, 'channels', ids.privateChannel)));
    await denied(getDocs(collection(clients.B.db, 'channels', ids.privateChannel, 'messages')));
  });

  test('Mitglied A liest privaten Channel und Nachrichten', async () => {
    await ok(getDoc(doc(clients.A.db, 'channels', ids.privateChannel)));
    await ok(getDocs(collection(clients.A.db, 'channels', ids.privateChannel, 'messages')));
  });

  test('ChannelService-Abfragen fuer B erlaubt', async () => {
    const channels = collection(clients.B.db, 'channels');
    await ok(getDocs(query(channels, where('memberIds', 'array-contains', clients.B.uid))));
    await ok(getDocs(query(channels, where('name', '==', 'Office-Team'))));
  });

  test('B kann sich nicht selbst in fremden privaten Channel eintragen', async () => {
    await denied(updateDoc(doc(clients.B.db, 'channels', ids.privateChannel), {
      memberIds: arrayUnion(clients.B.uid),
    }));
  });

  test('Mitglieder: B tritt bei, A (Ersteller) entfernt B, B entfernt A nicht', async () => {
    const ref = (db) => doc(db, 'channels', ids.privateChannel);
    await ok(updateDoc(ref(clients.A.db), { memberIds: arrayUnion(clients.B.uid) }));
    await denied(updateDoc(ref(clients.B.db), { memberIds: arrayRemove(clients.A.uid) }));
    await ok(updateDoc(ref(clients.A.db), { memberIds: arrayRemove(clients.B.uid) }));
  });

  test('Channel im Namen eines anderen anlegen: verboten', async () => {
    const id = `${RUN}-fake`;
    await denied(setDoc(doc(clients.B.db, 'channels', id), channel(id, clients.A.uid, [clients.A.uid, clients.B.uid])));
  });
});

describe('Live: Nachrichten', () => {
  test('Gast schreibt nicht in privaten Channel', async () => {
    await denied(setDoc(
      doc(clients.guest.db, 'channels', ids.privateChannel, 'messages', 'g1'),
      message('g1', clients.guest.uid, { channelId: ids.privateChannel }),
    ));
  });

  test('Nachricht mit fremder senderId: verboten', async () => {
    await denied(setDoc(
      doc(clients.A.db, 'channels', ids.privateChannel, 'messages', 'x'),
      message('x', clients.B.uid, { channelId: ids.privateChannel }),
    ));
  });

  test('Thread-Zaehler: replyCount + lastReplyAt setzen erlaubt', async () => {
    const ref = doc(clients.A.db, 'channels', ids.privateChannel, 'messages', 'm1');
    await ok(updateDoc(ref, { replyCount: 1, lastReplyAt: Date.now() }));
  });

  test('Eigene Nachricht: Text bearbeiten ja, andere Felder und Loeschen nein', async () => {
    const ref = doc(clients.A.db, 'channels', ids.privateChannel, 'messages', 'm1');
    await ok(updateDoc(ref, { text: 'bearbeitet' }));
    await denied(updateDoc(ref, { text: 'bearbeitet', senderId: clients.B.uid }));
    await denied(deleteDoc(ref));
  });
});

describe('Live: Direktchats', () => {
  test('B liest DM und schreibt hinein', async () => {
    await ok(getDoc(doc(clients.B.db, 'directChats', ids.dm)));
    await ok(setDoc(
      doc(clients.B.db, 'directChats', ids.dm, 'messages', 'm1'),
      message('m1', clients.B.uid, { dmId: ids.dm }),
    ));
  });

  test('DM bearbeiten: B eigene Nachricht ja, A fremde Nachricht nein', async () => {
    await ok(updateDoc(doc(clients.B.db, 'directChats', ids.dm, 'messages', 'm1'), { text: 'bearbeitet' }));
    await denied(updateDoc(doc(clients.A.db, 'directChats', ids.dm, 'messages', 'm1'), { text: 'von A' }));
  });

  test('Gast liest und schreibt fremde DM nicht', async () => {
    await denied(getDoc(doc(clients.guest.db, 'directChats', ids.dm)));
    await denied(getDocs(collection(clients.guest.db, 'directChats', ids.dm, 'messages')));
    await denied(setDoc(
      doc(clients.guest.db, 'directChats', ids.dm, 'messages', 'g1'),
      message('g1', clients.guest.uid, { dmId: ids.dm }),
    ));
  });
});

describe('Live: Users', () => {
  test('Gast liest keinen normalen User, legt kein users-Dokument an', async () => {
    await denied(getDoc(doc(clients.guest.db, 'users', clients.A.uid)));
    await denied(getDocs(collection(clients.guest.db, 'users')));
    await denied(setDoc(doc(clients.guest.db, 'users', clients.guest.uid), {
      id: clients.guest.uid, name: 'Gast', email: '', avatarUrl: '', onlineStatus: 'online',
    }));
  });

  test('Gast: Demo-User-Abfrage erlaubt', async () => {
    await ok(getDocs(query(collection(clients.guest.db, 'users'), where('isDemo', '==', true))));
  });

  test('B liest A, aendert A aber nicht', async () => {
    await ok(getDoc(doc(clients.B.db, 'users', clients.A.uid)));
    await denied(updateDoc(doc(clients.B.db, 'users', clients.A.uid), { name: 'Von B' }));
  });

  test('A setzt eigenen Status, aber keinen ungueltigen', async () => {
    const ref = doc(clients.A.db, 'users', clients.A.uid);
    await ok(updateDoc(ref, { onlineStatus: 'busy', chosenStatus: 'busy' }));
    await denied(updateDoc(ref, { onlineStatus: 'schlafen' }));
  });

  test('Gelesen-Stand: A schreibt eigenen, B liest ihn nicht', async () => {
    const ref = doc(clients.A.db, 'users', clients.A.uid, 'readState', 'channel:x');
    await ok(setDoc(ref, { lastReadAt: Date.now() }));
    await denied(getDoc(doc(clients.B.db, 'users', clients.A.uid, 'readState', 'channel:x')));
  });

  test('A aendert eigenen Namen, aber nicht isDemo', async () => {
    const ref = doc(clients.A.db, 'users', clients.A.uid);
    await ok(updateDoc(ref, { name: `${RUN}-neu` }));
    await denied(updateDoc(ref, { isDemo: true }));
  });
});
