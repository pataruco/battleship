import './styles/base.css';
import { loadEngine } from './engine/engine';

const app = document.getElementById('app');
if (app) {
  const h1 = document.createElement('h1');
  h1.textContent = 'Hello sea';
  app.replaceChildren(h1);
  loadEngine().then(
    (engine) => {
      h1.textContent = `Hello sea — engine v${engine.version}`;
    },
    () => {
      h1.textContent = 'Hello sea — engine failed to load';
    },
  );
}
