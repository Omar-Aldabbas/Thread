import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('../app/layouts/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: '',
        redirectTo: 'spaces',
        pathMatch: 'full',
      },
      {
        path: 'spaces',
        loadComponent: () =>
          import('../app/features/spaces/pages/spaces-page/spaces-page').then((m) => m.SpacesPage),
      },
    ],
  },

  {
    path: 'settings',
    loadComponent: () =>
      import('../app/features/settings/settings-page').then((m) => m.SettingsPage),
  },

  {
    path: 'space/:id',
    loadComponent: () =>
      import('../app/layouts/canvas-layout/canvas-layout').then((m) => m.CanvasLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('../app/features/canvas/pages/canvas-page/canvas-page').then((m) => m.CanvasPage),
      },
    ],
  },
];
