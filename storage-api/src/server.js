import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createStorage } from './storage.js';

const config = loadConfig();

// Nur die Projekt-ID: verifyIdToken prueft mit Googles oeffentlichen Schluesseln,
// ein Service-Account ist dafuer nicht noetig.
const firebase = initializeApp({ projectId: config.firebaseProjectId });
const auth = getAuth(firebase);

const app = createApp({
  config,
  verifyToken: (token) => auth.verifyIdToken(token),
  storage: createStorage(config.s3),
});

app.listen(config.port, () => {
  console.log(`[storage-api] laeuft auf Port ${config.port}`);
});
