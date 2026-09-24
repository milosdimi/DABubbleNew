// Befuellt den lokalen Firestore-Emulator (Projekt demo-dabubble) mit Testdaten.
// Voraussetzung: `npm run emulators` laeuft. Dann: `npm run seed:emulator`.
// Schreibt NIE in ein echtes Firebase-Projekt (Projekt-ID mit Praefix "demo-").
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const env = await initializeTestEnvironment({
  projectId: 'demo-dabubble',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
});

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();

  const demoUser = (id, name, avatar) => ({
    id,
    name,
    email: `${id}@demo.dabubble`,
    avatarUrl: `img/avatar/${avatar}.svg`,
    onlineStatus: 'online',
    isDemo: true,
  });
  await setDoc(doc(db, 'users/demo-anna'), demoUser('demo-anna', 'Anna Demo', 'avatar02'));
  await setDoc(doc(db, 'users/demo-ben'), demoUser('demo-ben', 'Ben Demo', 'avatar03'));

  const channel = (id, name, description, memberIds, guestVisible) => ({
    id, name, description, memberIds, createdBy: 'demo-anna', createdAt: now - 7 * DAY, guestVisible,
  });
  await setDoc(
    doc(db, 'channels/entwicklerteam'),
    channel('entwicklerteam', 'Entwicklerteam', 'Demo-Channel fuer Gaeste', ['demo-anna', 'demo-ben'], true),
  );
  await setDoc(
    doc(db, 'channels/office-team'),
    channel('office-team', 'Office-Team', 'Fuer alle registrierten User', ['demo-anna'], false),
  );
  await setDoc(
    doc(db, 'channels/privat'),
    channel('privat', 'Privat', 'Nur fuer Ben', ['demo-ben'], false),
  );

  const message = (id, channelId, senderId, text, timestamp) => ({
    id, channelId, senderId, text, timestamp, reactions: [],
  });
  await setDoc(
    doc(db, 'channels/entwicklerteam/messages/m1'),
    message('m1', 'entwicklerteam', 'demo-anna', 'Willkommen im Entwicklerteam!', now - DAY),
  );
  await setDoc(
    doc(db, 'channels/entwicklerteam/messages/m2'),
    message('m2', 'entwicklerteam', 'demo-ben', 'Hallo zusammen 👋', now - 60 * 60 * 1000),
  );
  await setDoc(
    doc(db, 'channels/privat/messages/m1'),
    message('m1', 'privat', 'demo-ben', 'Geheim.', now - DAY),
  );
});

await env.cleanup();
console.log('Emulator befuellt: 2 Demo-User, 3 Channels, 3 Nachrichten.');
