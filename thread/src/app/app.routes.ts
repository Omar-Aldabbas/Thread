import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('../app/layouts/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: '',
        redirectTo: () => {
          try {
            const id = localStorage.getItem('thread-last-space');
            const spaces = JSON.parse(localStorage.getItem('thread-spaces') || '[]');
            if (localStorage.getItem('thread-reopen-last-space') === 'true' && id && Array.isArray(spaces) && spaces.some((space) => space.id === id))
              return `/space/${encodeURIComponent(id)}`;
            const preferred = localStorage.getItem('thread-preferred-space');
            if (preferred && Array.isArray(spaces) && spaces.some((space) => space.id === preferred))
              return `/space/${encodeURIComponent(preferred)}`;
          } catch {}
          return 'spaces';
        },
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
