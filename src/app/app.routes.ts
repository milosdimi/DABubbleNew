import { Routes } from '@angular/router';
import { authGuard } from './shared/auth/auth.guard';

/**
 * Routing-Grundgeruest (Sprint 0). Lazy geladen ueber loadComponent.
 * Die Workspace-Shell (Header + Sidebar + Kind-Routen) folgt in Sprint 1.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./components/intro/intro').then((m) => m.Intro),
  },
  {
    path: 'login',
    title: 'Anmeldung – DABubble',
    loadComponent: () => import('./components/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    title: 'Konto erstellen – DABubble',
    loadComponent: () => import('./components/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'forgot-password',
    title: 'Passwort vergessen – DABubble',
    loadComponent: () =>
      import('./components/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    title: 'Neues Passwort – DABubble',
    loadComponent: () =>
      import('./components/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    // Workspace-Shell (Header + Sidebar + Main-Chat + Thread).
    // canActivate greift auch fuer alle kuenftigen Kind-Routen dieser Route.
    path: 'workspace',
    title: 'Workspace – DABubble',
    canActivate: [authGuard],
    loadComponent: () => import('./components/workspace/chat/chat').then((m) => m.Chat),
  },
  {
    path: 'imprint',
    title: 'Impressum – DABubble',
    loadComponent: () => import('./pages/imprint/imprint').then((m) => m.Imprint),
  },
  {
    path: 'privacy',
    title: 'Datenschutz – DABubble',
    loadComponent: () => import('./pages/privacy/privacy').then((m) => m.Privacy),
  },
  { path: '**', redirectTo: '' },
];
