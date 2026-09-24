# DABubble

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Lokal testen mit Firebase-Emulatoren

Ohne echte Firebase-Daten zu berühren (Projekt-ID `demo-dabubble`):

```bash
npm run emulators        # Auth (9099) + Firestore (8080); nutzt firebase-tools@13 (läuft mit Java 11)
npm run seed:emulator    # Demo-User, Channels und Nachrichten anlegen (in zweitem Terminal)
npm run start:emulator   # App unter http://localhost:4200 gegen die Emulatoren
```

Google-Login funktioniert im Emulator über ein simuliertes Konto-Popup.

## Firestore Rules

Die Rules liegen versioniert in `firestore.rules`. Tests (31 Fälle, u. a. Gast-/DM-Zugriff):

```bash
npm run test:rules       # startet einen eigenen Emulator; Port 8080 muss frei sein
npx firebase-tools deploy --only firestore:rules --project dababble
```

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
