import type { Cell } from '../game/types';

/**
 * `<fire-button>`: the big 🔥 FIRE! button. Disabled until an aim exists (and while `blocked`);
 * one click dispatches one `fire` event (`{cell}`) and locks the button until `reset()`, so a
 * double tap can never fire twice.
 */
export class FireButton extends HTMLElement {
  #aim: Cell | null = null;
  #blocked = false;
  #fired = false;
  #label = 'FIRE!';
  #button: HTMLButtonElement | null = null;
  #text: Text | null = null;

  get aim(): Cell | null {
    return this.#aim;
  }
  set aim(v: Cell | null) {
    this.#aim = v;
    this.#update();
  }
  /** Not my turn, or a move is in flight. */
  get blocked(): boolean {
    return this.#blocked;
  }
  set blocked(v: boolean) {
    this.#blocked = v;
    this.#update();
  }
  get label(): string {
    return this.#label;
  }
  set label(v: string) {
    this.#label = v;
    this.#update();
  }

  /** Unlocks after the shot has been resolved (or failed). */
  reset(): void {
    this.#fired = false;
    this.#update();
  }

  connectedCallback(): void {
    if (!this.#button) this.#build();
    this.#update();
  }

  #build(): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fire big';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🔥';
    this.#text = document.createTextNode('');
    b.append(icon, this.#text);
    b.addEventListener('click', () => this.#click());
    this.#button = b;
    this.replaceChildren(b);
  }

  #click(): void {
    const cell = this.#aim;
    if (this.#fired || this.#blocked || cell === null) return;
    this.#fired = true;
    this.#update();
    this.dispatchEvent(new CustomEvent('fire', { detail: { cell }, bubbles: true }));
  }

  #update(): void {
    if (!this.#button || !this.#text) return;
    this.#text.data = ` ${this.#label}`;
    this.#button.disabled = this.#fired || this.#blocked || this.#aim === null;
  }
}

if (!customElements.get('fire-button')) customElements.define('fire-button', FireButton);

declare global {
  interface HTMLElementTagNameMap {
    'fire-button': FireButton;
  }
}
