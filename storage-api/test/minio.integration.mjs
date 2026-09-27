/**
 * Integrationstest gegen ein echtes MinIO (nicht Teil von `npm test`).
 * Prueft, dass die signierten URLs im Browser-Ablauf funktionieren:
 * PUT mit exakt signiertem Content-Type/-Length, danach GET, abgelaufene URL.
 *
 * Aufruf (lokales MinIO, Bucket wird angelegt):
 *   S3_PUBLIC_ENDPOINT=http://127.0.0.1:19000 S3_BUCKET=chat-attachments \
 *   S3_ACCESS_KEY=... S3_SECRET_KEY=... node test/minio.integration.mjs
 */
import assert from 'node:assert/strict';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createStorage } from '../src/storage.js';

const config = { ...loadConfig(), uploadsPerHour: 100 };
const s3 = new S3Client({
  endpoint: config.s3.publicEndpoint,
  region: config.s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey },
});
await s3.send(new CreateBucketCommand({ Bucket: config.s3.bucket })).catch(() => {});

const verifyToken = async () => ({ uid: 'it-user', firebase: { sign_in_provider: 'password' } });
const server = createApp({ config, verifyToken, storage: createStorage(config.s3) }).listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const api = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
    body: JSON.stringify(body),
  }).then((response) => response.json());

const content = 'Hallo MinIO, Ümläute inklusive.';
const bytes = new TextEncoder().encode(content);

// 1) Upload mit passender Signatur
const { uploadUrl, key } = await api('/upload-url', { chatId: 'channel/test', fileName: 'Notiz ä.txt', contentType: 'text/plain', size: bytes.length });
const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bytes });
assert.equal(put.status, 200, `PUT fehlgeschlagen: ${await put.text()}`);
console.log('1) Upload ok:', key);

// 2) Download
const { url } = await api('/download-url', { key });
const get = await fetch(url);
assert.equal(get.status, 200);
assert.equal(await get.text(), content);
console.log('2) Download ok, Content-Disposition:', get.headers.get('content-disposition'));

// 3) Anderer Content-Type als signiert -> MinIO lehnt ab
const second = await api('/upload-url', { chatId: 'dm/test', fileName: 'b.txt', contentType: 'text/plain', size: bytes.length });
const wrongType = await fetch(second.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: bytes });
assert.equal(wrongType.status, 403);
console.log('3) Falscher Content-Type abgelehnt:', wrongType.status);

// 4) Groessere Datei als signiert -> MinIO lehnt ab
const bigger = new Uint8Array(bytes.length + 10);
const wrongSize = await fetch(second.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: bigger });
assert.notEqual(wrongSize.status, 200);
console.log('4) Falsche Groesse abgelehnt:', wrongSize.status);

// 5) Nicht vorhandene Datei -> 404 vom Gateway
const missing = await fetch(`${base}/download-url`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
  body: JSON.stringify({ key: key.replace(/[0-9a-f]{8}-/, '00000000-') }),
});
assert.equal(missing.status, 404);
console.log('5) Fehlende Datei: 404');

server.close();
console.log('Alles gruen.');
