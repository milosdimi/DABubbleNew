# DABubble Storage API

Kleiner Presign-Dienst für Chat-Anhänge. Die App bekommt von hier kurzlebige,
signierte URLs und lädt Dateien damit **direkt** in MinIO hoch bzw. öffnet sie.
Die S3-Zugangsdaten bleiben auf dem Server, nie im Frontend.

## Ablauf

1. App: `POST /upload-url` mit Firebase-ID-Token → `{ uploadUrl, key }`
2. App: `PUT uploadUrl` mit der Datei (exakt signierter Content-Type und -Länge, 60 s gültig)
3. App speichert `key` als `attachmentPath` an der Nachricht (Firestore)
4. Beim Öffnen: `POST /download-url` → `{ url }` (60 s gültig) → neuer Tab

## API

Alle Endpunkte außer `/health` brauchen `Authorization: Bearer <Firebase-ID-Token>`.
Fehler kommen als `{ "error": "<code>" }`.

| Endpunkt | Body | Antwort |
|---|---|---|
| `GET /health` | – | `{ ok: true }` |
| `POST /upload-url` | `{ chatId, fileName, contentType, size }` | `{ uploadUrl, key }` |
| `POST /download-url` | `{ key }` | `{ url }` |

- `chatId`: `channel/<id>` oder `dm/<id>`; Schlüssel: `<chatId>/<uuid>-<dateiname>`
- Uploads nur für registrierte Benutzer (Gäste = anonymer Login: 403), höchstens
  `UPLOADS_PER_HOUR` pro Benutzer (im Speicher, Reset bei Neustart).
- Öffnen dürfen alle Eingeloggten, auch Gäste. Schutz: Der Schlüssel enthält eine
  zufällige UUID und steht nur in Nachrichten, die Firestore per Rules schützt.
- Erlaubte Dateien: png, jpg/jpeg, gif, webp, pdf, txt, csv, doc(x), xls(x), ppt(x).

| Status | Code | Bedeutung |
|---|---|---|
| 400 | `invalid-chat`, `invalid-size`, `invalid-key`, `invalid-json` | ungültige Anfrage |
| 401 | `missing-token`, `invalid-token` | nicht (mehr) angemeldet |
| 403 | `guest-upload` | Gäste dürfen nicht hochladen |
| 404 | `not-found` | Datei existiert nicht (mehr) |
| 413 | `too-large` | größer als `MAX_UPLOAD_BYTES` |
| 415 | `unsupported-type` | Endung oder Content-Type nicht erlaubt |
| 429 | `rate-limited` | zu viele Uploads |

## Deploy auf dem QNAP (Container Station)

Voraussetzungen: MinIO läuft, Bucket `chat-attachments` ist **privat**, MinIO ist
über `https://storage.join-dimit.cc` erreichbar, und das Docker-Netz `n8n-stack_default`
existiert.

1. **CORS an MinIO** (für den direkten Upload aus dem Browser):
   `MINIO_API_CORS_ALLOW_ORIGIN=https://dabubble.dimit.cc,http://localhost:4200`
2. **Code aufs NAS kopieren** nach `/share/Container/dabubble-storage-api`
   (File Station oder SMB). Benötigt werden `package.json`, `package-lock.json` und
   der Ordner `src/`. `node_modules` nicht mitkopieren.
3. **Container Station → Anwendungen → Erstellen**, Name `dabubble-storage-api`,
   Inhalt von `docker-compose.yml` einfügen und die Platzhalter
   `<MINIO_ACCESS_KEY>` / `<MINIO_SECRET_KEY>` ersetzen (am besten ein eigener
   MinIO-Benutzer, der nur auf `chat-attachments` lesen und schreiben darf).
4. Starten. Beim ersten Start installiert der Container die Abhängigkeiten
   (dauert etwa eine Minute), danach meldet das Log `laeuft auf Port 3000`.
5. **Cloudflare Tunnel:** Public Hostname `storage-api.join-dimit.cc` →
   `http://dabubble-storage-api:3000`.
6. Test: `https://storage-api.join-dimit.cc/health` liefert `{"ok":true}`.

Nach einer Code-Änderung: Dateien im NAS-Ordner ersetzen und den Container neu starten.

Alternative mit eigenem Image (z. B. per SSH): `docker build -t dabubble-storage-api .`
und in der YAML `image: dabubble-storage-api` ohne `volumes` und `command` verwenden.

## Umgebungsvariablen

Siehe `.env.example`. Pflicht: `S3_PUBLIC_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`. `S3_INTERNAL_ENDPOINT` ist optional (z. B. `http://<minio-container>:9000`
im selben Docker-Netz) und wird nur für die Existenzprüfung beim Öffnen genutzt.

## Lokal / Tests

```bash
npm install
npm test                          # Routen-Tests ohne Firebase und MinIO
node test/minio.integration.mjs   # gegen ein echtes MinIO (Env-Variablen wie oben)
```
