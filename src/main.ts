import './styles/base.css';
import { startRouter, type Route } from './app/router';
import { renderDevLocal } from './app/screens/dev-local';
import { renderHome } from './app/screens/home';
import { renderProfile } from './app/screens/profile';
import { renderStart } from './app/screens/start';
import { el } from './app/el';
import { session } from './app/session';
import { loadEngine, setEngine } from './engine/engine';
import { initLang, t } from './i18n';
import { profileRepo } from './storage/games-repo';
import { loadArt } from './theme/default/avatars';

const app = document.getElementById('app');

function message(text: string, withHome = false): void {
  const back = withHome ? el('a', { class: 'big', href: '#/' }, t().home) : '';
  app?.replaceChildren(el('section', { class: 'screen' }, el('h1', {}, text), back));
}

let dispose: () => void = () => {};
let token = 0;

async function render(route: Route): Promise<void> {
  if (!app) return;
  const mine = ++token;
  dispose();
  dispose = () => {};
  if (route.name === 'home' || route.name === 'profile') {
    const profile = await profileRepo.get().catch(() => null);
    if (mine !== token) return;
    session.state.set({ profile });
    if (route.name === 'home' && !profile) {
      window.location.hash = '#/profile';
      return;
    }
    dispose =
      route.name === 'home'
        ? renderHome(app, { profile, onNewGame: () => message(t().comingSoon, true) })
        : renderProfile(app, { profile, onSaved: () => (window.location.hash = '#/') });
  } else if (import.meta.env.DEV && route.name === 'dev-local') {
    renderDevLocal(app);
  } else if (route.name === 'not-found') {
    message(t().notFound, true);
  } else {
    message(t().comingSoon, true);
  }
}

async function main(): Promise<void> {
  if (!app) return;
  initLang();
  try {
    setEngine(await loadEngine());
    await loadArt();
  } catch {
    message(t().startFailed);
    return;
  }
  const stopStart = renderStart(app, () => {
    stopStart();
    session.start();
    startRouter((route) => void render(route));
  });
}

void main();
