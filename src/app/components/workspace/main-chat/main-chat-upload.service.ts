import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

/** Anhangsdaten einer Nachricht; beide `null`, wenn keine Datei angehaengt ist. */
export interface AttachmentData {
  path: string | null;
  name: string | null;
}

/** Wie lange ein Link zum Oeffnen eines Anhangs gueltig ist. */
const SIGNED_URL_SECONDS = 60;

/** Laengster Dateiname (ohne Endung), der gespeichert wird. */
const MAX_BASE_NAME_LENGTH = 40;

/**
 * Hochladen und Oeffnen von Nachrichtenanhaengen.
 *
 * Backend vorlaeufig Supabase Storage (privater Bucket, Zugriff nur per
 * zeitlich begrenzter URL). Wird spaeter ausgetauscht - die oeffentliche
 * Schnittstelle (prepareSelectedFile / getAttachmentData / openAttachment)
 * bleibt dabei gleich.
 * Wird per `providers` in Main-Chat bzw. Thread bereitgestellt.
 */
@Injectable()
export class MainChatUploadService {
  private client: SupabaseClient | null = null;

  /** Erst beim ersten Upload anlegen - die App laeuft auch ohne Storage-Konfiguration. */
  private storage() {
    this.client ??= createClient(environment.storage.supabaseUrl, environment.storage.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return this.client.storage.from(environment.storage.bucket);
  }

  /** Liefert die Datei mit einem speichertauglichen Namen (keine Leer-/Sonderzeichen). */
  prepareSelectedFile(file: File): File {
    const name = this.safeFileName(file.name);
    return name === file.name ? file : new File([file], name, { type: file.type });
  }

  /**
   * Laedt `file` hoch.
   * - ohne Datei: `{ path: null, name: null }`
   * - Erfolg: `{ path, name }`
   * - Fehler: `null` (Aufrufer bricht dann den Versand ab)
   */
  async getAttachmentData(file: File | null): Promise<AttachmentData | null> {
    if (!file) return { path: null, name: null };

    const path = `${Date.now()}-${crypto.randomUUID()}/${file.name}`;
    try {
      const { data, error } = await this.storage().upload(path, file);
      if (error) throw error;
      return { path: data.path, name: file.name };
    } catch (error) {
      console.error('[upload] Anhang konnte nicht hochgeladen werden:', error);
      return null;
    }
  }

  /** Oeffnet einen privaten Anhang in einem neuen Tab. */
  async openAttachment(path: string): Promise<void> {
    try {
      const { data, error } = await this.storage().createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('[upload] Anhang konnte nicht geoeffnet werden:', error);
    }
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
