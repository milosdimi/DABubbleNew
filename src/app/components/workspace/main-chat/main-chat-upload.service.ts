import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { ChatTarget } from '../../../shared/message/message';

/** Anhangsdaten einer Nachricht; beide `null`, wenn keine Datei angehaengt ist. */
export interface AttachmentData {
  path: string | null;
  name: string | null;
}

/**
 * Erlaubte Endungen und der Content-Type, mit dem hochgeladen wird. Der Typ
 * kommt bewusst aus der Endung: Browser melden teils keinen oder einen
 * abweichenden Typ (z. B. CSV unter Windows). Gleiche Liste wie im Gateway.
 */
const TYPES_BY_EXTENSION: Record<string, string | undefined> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** Fuer `<input type="file" accept>`. */
export const ATTACHMENT_ACCEPT = Object.keys(TYPES_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(',');

const MAX_BYTES = 10 * 1024 * 1024;

/** Laengster Dateiname (ohne Endung), der gespeichert wird. */
const MAX_BASE_NAME_LENGTH = 40;

/** Meldungen je Fehlercode des Gateways (siehe storage-api/README.md). */
const MESSAGES: Record<string, string | undefined> = {
  'guest-upload': 'Uploads nur für registrierte Benutzer.',
  'too-large': 'Die Datei ist zu groß (höchstens 10 MB).',
  'unsupported-type': 'Dieser Dateityp wird nicht unterstützt.',
  'rate-limited': 'Zu viele Uploads. Bitte versuche es später erneut.',
  'not-found': 'Datei nicht mehr verfügbar.',
  'missing-token': 'Bitte melde dich erneut an.',
  'invalid-token': 'Bitte melde dich erneut an.',
  'upload-failed': 'Upload fehlgeschlagen. Bitte versuche es erneut.',
  disabled: 'Anhänge sind in dieser Umgebung deaktiviert.',
};
const FALLBACK_MESSAGE = 'Der Speicher ist gerade nicht erreichbar. Bitte versuche es später erneut.';

/** Fehler mit dem Code des Gateways (oder einem eigenen). */
class StorageError extends Error {}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Schluessel der aktuellen Ablage; alte Supabase-Pfade haben kein "channel/" bzw. "dm/". */
function isCurrentKey(path: string): boolean {
  return path.startsWith('channel/') || path.startsWith('dm/');
}

/**
 * Hochladen und Oeffnen von Nachrichtenanhaengen ueber die eigene Storage-API
 * (MinIO auf dem QNAP, siehe storage-api/). Die API stellt 60 Sekunden gueltige,
 * signierte URLs aus; die S3-Zugangsdaten bleiben auf dem Server.
 * Wird per `providers` in Main-Chat bzw. Thread bereitgestellt; `error` zeigt die
 * Komponente am Eingabefeld an.
 */
@Injectable()
export class MainChatUploadService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly apiUrl = environment.storageApiUrl;

  readonly accept = ATTACHMENT_ACCEPT;
  /** Letzte Fehlermeldung fuer die Oberflaeche, sonst null. */
  readonly error = signal<string | null>(null);

  /** Warum nichts angehaengt werden kann (Button ausgegraut), sonst null. */
  unavailableReason(): string | null {
    if (!this.apiUrl) return MESSAGES['disabled'] ?? null;
    if (this.auth.currentUser?.isAnonymous) return MESSAGES['guest-upload'] ?? null;
    return null;
  }

  /**
   * Prueft die Auswahl und liefert die Datei mit speichertauglichem Namen und
   * einem Typ aus der Endung - oder null (Meldung steht dann in `error`).
   */
  prepareSelectedFile(file: File): File | null {
    const name = this.safeFileName(file.name);
    const type = TYPES_BY_EXTENSION[extensionOf(name)];
    if (!type) return this.reject('unsupported-type');
    if (file.size > MAX_BYTES) return this.reject('too-large');
    this.error.set(null);
    return new File([file], name, { type, lastModified: file.lastModified });
  }

  /**
   * Laedt `file` in den Chat `target` hoch.
   * - ohne Datei: `{ path: null, name: null }`
   * - Erfolg: `{ path, name }`
   * - Fehler: `null` (Aufrufer bricht dann den Versand ab, Meldung in `error`)
   */
  async getAttachmentData(file: File | null, target: ChatTarget): Promise<AttachmentData | null> {
    if (!file) return { path: null, name: null };
    this.error.set(null);
    try {
      const body = { chatId: `${target.kind}/${target.id}`, fileName: file.name, contentType: file.type, size: file.size };
      const { uploadUrl, key } = await this.post<{ uploadUrl: string; key: string }>('/upload-url', body);
      await this.putFile(uploadUrl, file);
      return { path: key, name: file.name };
    } catch (error) {
      this.showError(error);
      return null;
    }
  }

  /** Oeffnet einen privaten Anhang in einem neuen Tab. */
  async openAttachment(path: string): Promise<void> {
    this.error.set(null);
    if (!this.apiUrl) return void this.reject('disabled');
    if (!isCurrentKey(path)) return void this.reject('not-found');
    // Tab sofort (noch im Klick) oeffnen, sonst blockiert der Browser das Popup.
    const tab = window.open('', '_blank');
    try {
      const { url } = await this.post<{ url: string }>('/download-url', { key: path });
      this.showInTab(tab, url);
    } catch (error) {
      tab?.close();
      this.showError(error);
    }
  }

  private showInTab(tab: Window | null, url: string): void {
    if (!tab) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    tab.opener = null;
    tab.location.href = url;
  }

  /** POST an die Storage-API mit Firebase-ID-Token; wirft StorageError mit dem Fehlercode. */
  private async post<T>(path: string, body: object): Promise<T> {
    const token = await this.auth.currentUser?.getIdToken();
    if (!token) throw new StorageError('missing-token');
    const response = await fetch(this.apiUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response?.ok || !data) throw new StorageError(data?.error ?? 'unreachable');
    return data;
  }

  /** PUT an die signierte URL - mit exakt dem signierten Content-Type. */
  private async putFile(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    }).catch(() => null);
    if (!response) throw new StorageError('unreachable');
    if (!response.ok) throw new StorageError('upload-failed');
  }

  private reject(code: string): null {
    this.error.set(MESSAGES[code] ?? FALLBACK_MESSAGE);
    return null;
  }

  private showError(error: unknown): void {
    const code = error instanceof StorageError ? error.message : '';
    if (!(error instanceof StorageError)) console.error('[upload]', error);
    this.reject(code);
  }

  private safeFileName(original: string): string {
    const dot = original.lastIndexOf('.');
    const base = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot).toLowerCase() : '';
    const cleaned = base
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .slice(0, MAX_BASE_NAME_LENGTH);
    return `${cleaned || 'datei'}${extension}`;
  }
}
