import './styles/base.css';

const app = document.getElementById('app');
if (app) {
  const h1 = document.createElement('h1');
  h1.textContent = 'Hello sea';
  app.replaceChildren(h1);
}
