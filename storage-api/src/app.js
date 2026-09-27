import cors from 'cors';
import express from 'express';
import { HttpError, validateKey, validateUpload } from './files.js';
import { createRateLimiter } from './rate-limit.js';

/** Liest und prueft das Firebase-ID-Token aus dem Authorization-Header. */
async function authenticate(req, verifyToken) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'missing-token');
  try {
    return await verifyToken(token);
  } catch {
    throw new HttpError(401, 'invalid-token');
  }
}

/** Gaeste (anonymer Login) duerfen oeffnen, aber nicht hochladen. */
function isGuest(decodedToken) {
  return decodedToken.firebase?.sign_in_provider === 'anonymous';
}

/** Wandelt Fehler in JSON-Antworten `{ error: code }` um. */
function handleErrors(error, req, res, next) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.code });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid-json' });
  console.error('[storage-api]', error);
  return res.status(500).json({ error: 'internal' });
}

/**
 * HTTP-API. Abhaengigkeiten werden hereingereicht, damit Tests ohne Firebase
 * und MinIO laufen: `verifyToken(token)` und `storage` (siehe storage.js).
 */
export function createApp({ config, verifyToken, storage }) {
  const app = express();
  const allowUpload = createRateLimiter(config.uploadsPerHour);

  app.disable('x-powered-by');
  app.use(cors({ origin: config.allowedOrigins, methods: ['GET', 'POST'], allowedHeaders: ['Authorization', 'Content-Type'] }));
  app.use(express.json({ limit: '4kb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.post('/upload-url', async (req, res) => {
    const user = await authenticate(req, verifyToken);
    if (isGuest(user)) throw new HttpError(403, 'guest-upload');
    const key = validateUpload(req.body ?? {}, config.maxUploadBytes);
    if (!allowUpload(user.uid)) throw new HttpError(429, 'rate-limited');
    const uploadUrl = await storage.uploadUrl(key, req.body.contentType, req.body.size);
    res.json({ uploadUrl, key });
  });

  app.post('/download-url', async (req, res) => {
    await authenticate(req, verifyToken);
    const key = req.body?.key;
    const fileName = validateKey(key);
    if (!(await storage.exists(key))) throw new HttpError(404, 'not-found');
    res.json({ url: await storage.downloadUrl(key, fileName) });
  });

  app.use((req, res) => res.status(404).json({ error: 'not-found' }));
  app.use(handleErrors);
  return app;
}
