/**
 * Keep a /api/presence stream open while this window is open, so the server
 * started by `npm start` can stop by itself once every window is closed. Only
 * in the built app: the dev server and the tests never stop on their own.
 */
export function holdPresence(): void {
  if (!import.meta.env.PROD || typeof EventSource === 'undefined') return;
  new EventSource('/api/presence');
}
