import './styles/base.css';
import { startRouter, type Route } from './app/router';
import { renderDebug } from './app/screens/debug';
import { renderDevLocal } from './app/screens/dev-local';
import { renderGame } from './app/screens/game';
import { renderHome } from './app/screens/home';
import { renderProfile } from './app/screens/profile';
import { renderStart } from './app/screens/start';
import { el } from './app/el';
import { logError } from './app/errors';
import { captureInstallPrompt, registerSw } from './app/pwa';
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
/** Where a first run was going before the Profile step (keeps deep-link invites). */
let afterProfile = '#/';

/** Creates a game on the server and opens its invite. Rejects when offline. */
async function newGame(): Promise<void> {
  const { id, secret } = await session.newGame();
  window.location.hash = `#/g/${id}/${secret}`;
}

async function render(route: Route): Promise<void> {
  if (!app) return;
  const mine = ++token;
  dispose();
  dispose = () => {};
  if (route.name === 'home' || route.name === 'profile' || route.name === 'game') {
    const profile = await profileRepo.get().catch(() => null);
    if (mine !== token) return;
    session.state.set({ profile });
    if (route.name !== 'profile' && !profile) {
      afterProfile = window.location.hash || '#/';
      window.location.hash = '#/profile';
      return;
    }
    if (route.name === 'game') {
      dispose = renderGame(app, { id: route.id, secret: route.secret, onNewGame: newGame });
    } else if (route.name === 'home') {
      dispose = renderHome(app, { profile, onNewGame: newGame });
    } else {
      const firstRun = !profile;
      dispose = renderProfile(app, {
        profile,
        onSaved: () => {
          window.location.hash = firstRun ? afterProfile : '#/';
          afterProfile = '#/';
        },
      });
    }
  } else if (route.name === 'debug') {
    dispose = renderDebug(app);
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
  window.addEventListener('error', (e) => logError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => logError(e.reason));
  initLang();
  captureInstallPrompt();
  registerSw();
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
