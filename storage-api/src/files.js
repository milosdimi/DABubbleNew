import { randomUUID } from 'node:crypto';

/**
 * Erlaubte Dateiendungen und die dafuer akzeptierten Content-Types.
 * Tolerant, weil Browser je nach System abweichende Typen melden
 * (z. B. CSV unter Windows als application/vnd.ms-excel).
 */
const ALLOWED_TYPES = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
};

const MAX_NAME_LENGTH = 80;
const CHAT_ID = /^(channel|dm)\/[A-Za-z0-9_-]{1,128}$/;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY = new RegExp(`^(channel|dm)/[A-Za-z0-9_-]{1,128}/${UUID}-([A-Za-z0-9._-]{1,${MAX_NAME_LENGTH}})$`);

/** Fehler mit HTTP-Status und maschinenlesbarem Code fuer die App. */
export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Dateiname ohne Pfad, Umlaute und Sonderzeichen; Endung klein. */
export function safeFileName(original) {
  const base = String(original ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/^\.+/, '')
    .slice(-MAX_NAME_LENGTH);
  return cleaned || 'datei';
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Prueft einen Upload-Wunsch und liefert den Objekt-Schluessel. Wirft HttpError. */
export function validateUpload({ chatId, fileName, contentType, size }, maxBytes) {
  if (typeof chatId !== 'string' || !CHAT_ID.test(chatId)) throw new HttpError(400, 'invalid-chat');
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, 'invalid-size');
  if (size > maxBytes) throw new HttpError(413, 'too-large');
  const name = safeFileName(fileName);
  const allowed = ALLOWED_TYPES[extensionOf(name)];
  if (!allowed || !allowed.includes(String(contentType).toLowerCase())) {
    throw new HttpError(415, 'unsupported-type');
  }
  return `${chatId}/${randomUUID()}-${name}`;
}

/** Prueft einen Schluessel zum Oeffnen und liefert den Anzeigenamen. Wirft HttpError. */
export function validateKey(key) {
  if (typeof key !== 'string' || key.includes('..')) throw new HttpError(400, 'invalid-key');
  const match = KEY.exec(key);
  if (!match) throw new HttpError(400, 'invalid-key');
  return match[2];
}
