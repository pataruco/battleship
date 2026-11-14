import { getEngine } from '../engine/engine';

const SVG_NS = 'http://www.w3.org/2000/svg';
const QUIET = 4;

/** `<qr-code text label>`: renders `text` as one SVG path with a 4-module quiet zone. */
export class QrCode extends HTMLElement {
  static observedAttributes = ['text', 'label'];

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  private render(): void {
    const { size, modules } = getEngine().qrEncode(this.getAttribute('text') ?? '');
    const total = size + QUIET * 2;
    let d = '';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (modules[y * size + x] === 1) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
      }
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', this.getAttribute('label') ?? '');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    this.replaceChildren(svg);
  }
}

if (!customElements.get('qr-code')) customElements.define('qr-code', QrCode);
