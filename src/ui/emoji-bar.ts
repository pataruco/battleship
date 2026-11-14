import { EMOJI, type Emoji } from '../game/types';

const COOLDOWN_MS = 3_000;

/**
 * `<emoji-bar>`: the fixed kid-safe reactions. A tap dispatches `react` (`{emoji}`) and rests
 * the whole bar for 3 s (one reaction per 3 s per device). `data-label` names the group.
 */
export class EmojiBar extends HTMLElement {
  #timer: ReturnType<typeof setTimeout> | undefined;
  #buttons: HTMLButtonElement[] = [];
  #nameOf: (emoji: Emoji) => string = (e) => e;

  /** Spoken name per emoji (i18n), set as each button's aria-label. */
  get nameOf(): (emoji: Emoji) => string {
    return this.#nameOf;
  }
  set nameOf(fn: (emoji: Emoji) => string) {
    this.#nameOf = fn;
    this.#label();
  }

  #label(): void {
    this.#buttons.forEach((b, i) => b.setAttribute('aria-label', this.#nameOf(EMOJI[i]!)));
  }

  connectedCallback(): void {
    if (this.#buttons.length) return;
    this.setAttribute('role', 'group');
    if (this.dataset.label) this.setAttribute('aria-label', this.dataset.label);
    for (const emoji of EMOJI) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji';
      b.textContent = emoji;
      b.addEventListener('click', () => this.#tap(emoji));
      this.#buttons.push(b);
    }
    this.replaceChildren(...this.#buttons);
    this.#label();
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#rest(false);
  }

  #tap(emoji: Emoji): void {
    if (this.#timer !== undefined) return;
    this.#rest(true);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#rest(false);
    }, COOLDOWN_MS);
    this.dispatchEvent(new CustomEvent('react', { detail: { emoji }, bubbles: true }));
  }

  #rest(on: boolean): void {
    for (const b of this.#buttons) b.disabled = on;
  }
}

if (!customElements.get('emoji-bar')) customElements.define('emoji-bar', EmojiBar);

declare global {
  interface HTMLElementTagNameMap {
    'emoji-bar': EmojiBar;
  }
}
