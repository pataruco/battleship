export type Route =
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'game'; id: string; secret: string }
  | { name: 'debug' }
  | { name: 'dev-local' }
  | { name: 'not-found' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{22}$/;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  if (path === '' ) return { name: 'home' };
  if (path === '/profile') return { name: 'profile' };
  if (path === '/debug') return { name: 'debug' };
  if (path === '/dev/local') return { name: 'dev-local' };
  const parts = path.split('/');
  if (parts.length === 4 && parts[0] === '' && parts[1] === 'g') {
    const [, , id = '', secret = ''] = parts;
    if (UUID.test(id) && SECRET.test(secret)) return { name: 'game', id, secret };
  }
  return { name: 'not-found' };
}

/** Renders the current route now and again on every `hashchange`. */
export function startRouter(render: (r: Route) => void): void {
  const run = () => render(parseRoute(window.location.hash));
  window.addEventListener('hashchange', run);
  run();
}
