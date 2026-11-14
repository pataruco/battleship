import { animate, reducedMotion } from '../fx/motion';

const CONFETTI_COLOURS = ['#ff5a5f', '#ffb400', '#2ec4b6', '#3a86ff', '#c77dff', '#ffd6a5'];
const MAX_CONFETTI = 36;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * `<fx-layer>`: a fixed, click-through layer for the big moments. Everything is a short-lived DOM
 * node animated with transform and opacity only, then removed. Under reduced motion each effect
 * is a 150 ms fade (`motion.animate`), and confetti is skipped.
 */
export class FxLayer extends HTMLElement {
  connectedCallback(): void {
    this.setAttribute('aria-hidden', 'true');
  }

  #spawn(className: string, text = ''): HTMLElement {
    const n = document.createElement('span');
    n.className = className;
    if (text) n.textContent = text;
    this.append(n);
    return n;
  }

  #run(n: HTMLElement, keyframes: Keyframe[], opts: KeyframeAnimationOptions, then?: () => void): void {
    const a = animate(n, keyframes, { fill: 'forwards', ...opts });
    const done = () => {
      n.remove();
      then?.();
    };
    if (a) a.finished.then(done, done);
    else done();
  }

  #centre(el: Element): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** A small shell flying from the FIRE button to the target square. */
  shell(fromEl: Element, toEl: Element): void {
    const a = this.#centre(fromEl);
    const b = this.#centre(toEl);
    const n = this.#spawn('fx-shell', '●');
    n.style.left = `${a.x}px`;
    n.style.top = `${a.y}px`;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    this.#run(
      n,
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - 60}px)) scale(1.4)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)`, opacity: 0.2 },
      ],
      { duration: 550, easing: 'ease-in' },
    );
  }

  /** Expanding ring where a shell missed. */
  splash(cellEl: Element): void {
    const c = this.#centre(cellEl);
    const n = this.#spawn('fx-ring', '');
    n.style.left = `${c.x}px`;
    n.style.top = `${c.y}px`;
    this.#run(
      n,
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.9 },
        { transform: 'translate(-50%, -50%) scale(2.4)', opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' },
    );
  }

  /** A burst at a hit square, and a shake of the board it sits in. */
  boom(cellEl: Element): void {
    const c = this.#centre(cellEl);
    const n = this.#spawn('fx-boom', '💥');
    n.style.left = `${c.x}px`;
    n.style.top = `${c.y}px`;
    this.#run(
      n,
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(2)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-out' },
    );
    const board = cellEl.closest('sea-grid');
    if (board && !reducedMotion()) {
      animate(board, [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ], { duration: 320 });
    }
  }

  /** The squares of a sunk ship sink: shrink and dim, staggered. */
  sink(cells: Element[]): void {
    cells.forEach((cell, i) => {
      animate(cell, [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.6)', opacity: 0.4, offset: 0.5 },
        { transform: 'scale(1)', opacity: 1 },
      ], { duration: 700, delay: i * 90 });
    });
  }

  /** At most 36 confetti pieces falling from the top; none under reduced motion. */
  confetti(): void {
    if (reducedMotion()) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < MAX_CONFETTI; i++) {
      const n = this.#spawn('fx-confetti');
      n.style.left = `${rand(0, w)}px`;
      n.style.background = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]!;
      this.#run(
        n,
        [
          { transform: 'translateY(-20px) rotate(0deg)', opacity: 1 },
          { transform: `translate(${rand(-80, 80)}px, ${h + 40}px) rotate(${rand(360, 900)}deg)`, opacity: 1 },
        ],
        { duration: rand(1500, 2600), delay: rand(0, 400), easing: 'ease-in' },
      );
    }
  }

  /** A big emoji that rises and fades. */
  floatEmoji(emoji: string): void {
    const n = this.#spawn('fx-emoji', emoji);
    n.style.left = `${rand(25, 75)}%`;
    this.#run(
      n,
      [
        { transform: 'translateY(0) scale(0.6)', opacity: 0 },
        { transform: 'translateY(-15vh) scale(1.3)', opacity: 1, offset: 0.2 },
        { transform: 'translateY(-45vh) scale(1.6)', opacity: 0 },
      ],
      { duration: 2200, easing: 'ease-out' },
    );
  }

  /** A coin that flips, then a line saying who goes first. */
  coinToss(first: string): void {
    const n = this.#spawn('fx-coin');
    const coin = document.createElement('span');
    coin.className = 'fx-coin-face';
    coin.textContent = '🪙';
    const who = document.createElement('span');
    who.className = 'fx-coin-who';
    who.textContent = first;
    n.append(coin, who);
    animate(coin, [{ transform: 'rotateY(0deg)', opacity: 1 }, { transform: 'rotateY(1080deg)', opacity: 1 }], { duration: 900, easing: 'ease-out' });
    this.#run(n, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 2000 });
  }

  /** An avatar node slides in from the side, holds, then leaves (a friend joined). */
  slideIn(node: HTMLElement): void {
    const n = this.#spawn('fx-join');
    n.append(node);
    this.#run(
      n,
      [
        { transform: 'translateX(-120%)', opacity: 0 },
        { transform: 'translateX(0)', opacity: 1, offset: 0.15 },
        { transform: 'translateX(0)', opacity: 1, offset: 0.8 },
        { transform: 'translateX(-120%)', opacity: 0 },
      ],
      { duration: 2600, easing: 'ease-out' },
    );
  }
}

if (!customElements.get('fx-layer')) customElements.define('fx-layer', FxLayer);

declare global {
  interface HTMLElementTagNameMap {
    'fx-layer': FxLayer;
  }
}

/** The one layer on the page, created on first use. */
export function fxLayer(): FxLayer {
  let layer = document.querySelector('fx-layer');
  if (!layer) {
    layer = document.createElement('fx-layer');
    document.body.append(layer);
  }
  return layer;
}
