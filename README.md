# DABubble

Ein Team-Messenger nach dem Vorbild von Slack: Channels, Direktnachrichten und Threads in Echtzeit.
Entstanden als Abschlussprojekt der Weiterbildung zum Frontend-Entwickler bei der
[Developer Akademie](https://developerakademie.com/), umgesetzt nach deren Figma-Design.

## Funktionen

**Konto**
- Registrierung mit E-Mail und Passwort (inkl. Avatar-Auswahl), Login mit Google oder als Gast
- Passwort vergessen / zurücksetzen per E-Mail
- Profil ansehen und bearbeiten (Name, Avatar)
- Eigener Status: Aktiv, Abwesend, Nicht stören oder Offline

**Chatten**
- Channels anlegen, Mitglieder per Suche hinzufügen, entfernen (Ersteller) oder selbst austreten
- Direktnachrichten, auch an sich selbst
- Threads zu jeder Nachricht
- Nachrichten bearbeiten und löschen, Hinweis „(bearbeitet)“
- Reaktionen mit Emojis, inkl. Tooltip „Anna und Du haben mit 🚀 reagiert“
- `@`-Erwähnungen mit Vorschlagsliste, Emoji-Auswahl im Eingabefeld
- Einfache Formatierung: `*fett*`, `_kursiv_`, `` `Code` ``; Links werden anklickbar
- Neue Nachricht an `#Channel`, `@Person` oder E-Mail-Adresse

**Überblick behalten**
- Suche über Channels, Personen und Nachrichten (`#` / `@` filtern, Strg+K)
- Klick auf einen Suchtreffer springt direkt zur Nachricht
- Ungelesen-Punkte in der Sidebar und an Threads, Anzahl im Browser-Tab, Trennlinie „Neue Nachrichten“
- „Anna schreibt gerade …“
- Online-Status, der auch beim Schließen des Tabs oder Verbindungsabbruch auf „Offline“ springt
- Automatisches Scrollen zur neuesten Nachricht, ohne beim Lesen älterer Nachrichten wegzuspringen

## Technik

| Bereich | Einsatz |
|---|---|
| Frontend | Angular 21 (Standalone Components, Signals, zoneless), TypeScript, SCSS |
| Anmeldung | Firebase Authentication (E-Mail/Passwort, Google, anonym für Gäste) |
| Daten | Cloud Firestore (User, Channels, Nachrichten, Threads, Gelesen-Stand) |
| Echtzeit-Präsenz | Firebase Realtime Database (Verbindungsstatus mit `onDisconnect`, „schreibt gerade“) |
| Sicherheit | Firestore- und Realtime-Database-Rules, mit Tests gegen die Emulatoren |

Die gesamte Zugriffslogik liegt in den Rules (`firestore.rules`, `database.rules.json`), nicht nur in
der Oberfläche: Gäste sehen nur freigegebene Channels und Demo-User, Direktnachrichten nur die
Beteiligten, bearbeiten und löschen darf nur der Absender, andere aus einem Channel entfernen nur der
Ersteller. Der Online-Status kommt ohne Cloud Functions aus und läuft damit im kostenlosen
Firebase-Tarif.

## Lokal starten

Voraussetzungen: Node.js 22 oder neuer, Java 11 oder neuer (für die Firebase-Emulatoren).

```bash
npm install
```

### Mit den Firebase-Emulatoren (empfohlen, ohne echte Daten)

```bash
npm run emulators        # Auth, Firestore und Realtime Database lokal (Projekt demo-dabubble)
npm run seed:emulator    # Demo-User, Channels und Nachrichten anlegen (zweites Terminal)
npm run start:emulator   # App unter http://localhost:4200 gegen die Emulatoren
```

Der Gäste-Login funktioniert sofort, der Google-Login über ein simuliertes Konto-Fenster.

### Mit einem eigenen Firebase-Projekt

1. `src/environments/environment.example.ts` nach `src/environments/environment.ts` kopieren
   und die Web-Konfiguration des Projekts eintragen (inkl. `databaseURL` der Realtime Database).
2. Rules deployen: `npx firebase-tools deploy --only "firestore:rules,database"`
3. `npm start`

`environment.ts` ist per `.gitignore` ausgeschlossen.

## Tests

```bash
npm run test:rules       # Firestore- und Realtime-Database-Rules gegen die Emulatoren
npm run test:rules:live  # Smoke-Test gegen das echte Projekt (legt Wegwerf-Accounts an und räumt sie wieder ab)
```

## Build

```bash
npm run build            # Ausgabe in dist/DABubble/browser
```

Für Apache-Hosting liegt eine `.htaccess` bei, damit Angular-Routen auch beim Neuladen funktionieren.

## Projektstruktur

```
src/app
├── components/     Seiten und Bausteine (auth, workspace, channel, profile, overlay …)
├── pages/          Impressum und Datenschutz
└── shared/         Services und gemeinsame Komponenten (Firebase, Nachrichten, Suche,
                    Präsenz, Ungelesen-Stand, Erwähnungen, Icons …)
src/styles          Globale SCSS-Partials (Farben, Mixins, Typografie)
firestore-tests/    Rules-Tests, Live-Smoke-Test, Emulator-Seed
```

## Autor

Milos Dimitrijevic
