import './styles/base.css';
import { startRouter } from './app/router';
import { renderDevLocal } from './app/screens/dev-local';
import { loadEngine, setEngine } from './engine/engine';

const app = document.getElementById('app');

function message(text: string): void {
  const h1 = document.createElement('h1');
  h1.textContent = text;
  app?.replaceChildren(h1);
}

async function main(): Promise<void> {
  if (!app) return;
  try {
    setEngine(await loadEngine());
  } catch {
    message('Could not start the game');
    return;
  }
  startRouter((route) => {
    if (import.meta.env.DEV && route.name === 'dev-local') renderDevLocal(app);
    else if (route.name === 'not-found') message('Page not found');
    else message('Coming soon');
  });
}

void main();
