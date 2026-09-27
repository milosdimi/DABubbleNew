import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

const TOKENS = {
  user: { uid: 'user-1', firebase: { sign_in_provider: 'password' } },
  other: { uid: 'user-2', firebase: { sign_in_provider: 'google.com' } },
  guest: { uid: 'guest-1', firebase: { sign_in_provider: 'anonymous' } },
};

const config = {
  allowedOrigins: ['https://dabubble.dimit.cc', 'http://localhost:4200'],
  maxUploadBytes: 10 * 1024 * 1024,
  uploadsPerHour: 3,
};

const storedKeys = new Set();
const storage = {
  uploadUrl: async (key, type, size) => `https://s3.test/${key}?type=${type}&size=${size}`,
  downloadUrl: async (key, name) => `https://s3.test/${key}?name=${name}`,
  exists: async (key) => storedKeys.has(key),
};
const verifyToken = async (token) => {
  if (!TOKENS[token]) throw new Error('invalid');
  return TOKENS[token];
};

let server;
let base;

before(async () => {
  server = createApp({ config, verifyToken, storage }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const upload = (overrides = {}) => ({
  chatId: 'channel/entwicklerteam',
  fileName: 'Plan Q3.pdf',
  contentType: 'application/pdf',
  size: 1234,
  ...overrides,
});

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: code });
}

describe('GET /health', () => {
  it('antwortet ohne Token', async () => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
  });
});

describe('POST /upload-url', () => {
  it('liefert URL und Schluessel mit Chat-Bezug und bereinigtem Namen', async () => {
    const response = await post('/upload-url', upload(), 'user');
    assert.equal(response.status, 200);
    const { uploadUrl, key } = await response.json();
    assert.match(key, /^channel\/entwicklerteam\/[0-9a-f-]{36}-Plan-Q3\.pdf$/);
    assert.ok(uploadUrl.includes(key));
  });

  it('ohne oder mit falschem Token: 401', async () => {
    await expectError(await post('/upload-url', upload()), 401, 'missing-token');
    await expectError(await post('/upload-url', upload(), 'kaputt'), 401, 'invalid-token');
  });

  it('Gaeste duerfen nicht hochladen: 403', async () => {
    await expectError(await post('/upload-url', upload(), 'guest'), 403, 'guest-upload');
  });

  it('zu gross: 413', async () => {
    await expectError(await post('/upload-url', upload({ size: 11 * 1024 * 1024 }), 'user'), 413, 'too-large');
  });

  it('falscher Typ oder falsche Endung: 415', async () => {
    await expectError(await post('/upload-url', upload({ fileName: 'x.exe', contentType: 'application/pdf' }), 'user'), 415, 'unsupported-type');
    await expectError(await post('/upload-url', upload({ contentType: 'text/html' }), 'user'), 415, 'unsupported-type');
  });

  it('CSV mit Windows-Typ ist erlaubt', async () => {
    const response = await post('/upload-url', upload({ fileName: 'liste.csv', contentType: 'application/vnd.ms-excel' }), 'other');
    assert.equal(response.status, 200);
  });

  it('ungueltiger Chat: 400', async () => {
    await expectError(await post('/upload-url', upload({ chatId: '../etc' }), 'user'), 400, 'invalid-chat');
    await expectError(await post('/upload-url', upload({ chatId: 'channel/a/b' }), 'user'), 400, 'invalid-chat');
  });

  it('Rate-Limit pro uid: 429', async () => {
    // user-1 hat oben schon einen gueltigen Upload (Limit im Test: 3).
    await post('/upload-url', upload(), 'user');
    await post('/upload-url', upload(), 'user');
    await expectError(await post('/upload-url', upload(), 'user'), 429, 'rate-limited');
  });
});

describe('POST /download-url', () => {
  const key = 'dm/dm-tester-anna/123e4567-e89b-12d3-a456-426614174000-bild.png';

  it('liefert eine URL fuer vorhandene Dateien, auch fuer Gaeste', async () => {
    storedKeys.add(key);
    const response = await post('/download-url', { key }, 'guest');
    assert.equal(response.status, 200);
    assert.ok((await response.json()).url.includes('name=bild.png'));
  });

  it('fehlende Datei: 404', async () => {
    const missing = key.replace('bild', 'weg');
    await expectError(await post('/download-url', { key: missing }, 'user'), 404, 'not-found');
  });

  it('nur channel/ oder dm/, kein "..", sonst 400', async () => {
    await expectError(await post('/download-url', { key: '1712-abc/alt.pdf' }, 'user'), 400, 'invalid-key');
    await expectError(await post('/download-url', { key: 'dm/../geheim.pdf' }, 'user'), 400, 'invalid-key');
    await expectError(await post('/download-url', {}, 'user'), 400, 'invalid-key');
  });

  it('ohne Token: 401', async () => {
    await expectError(await post('/download-url', { key }), 401, 'missing-token');
  });
});

describe('CORS', () => {
  it('erlaubt nur die eigenen Origins', async () => {
    const allowed = await fetch(`${base}/health`, { headers: { Origin: 'https://dabubble.dimit.cc' } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://dabubble.dimit.cc');
    const foreign = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);
  });
});
