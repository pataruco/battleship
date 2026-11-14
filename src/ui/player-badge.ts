import { avatarIcon } from '../theme/default/avatars';

export type BadgeInfo = {
  player: { name: string; avatar: string } | null;
  /** Presence dot: true here, false away, null no dot. */
  here: boolean | null;
  /** The line under the name ("Your turn!", "Sam is ready"). */
  text: string;
};

/** `<player-badge>`: avatar, name, an optional presence dot and a status line. */
export class PlayerBadge extends HTMLElement {
  #info: BadgeInfo = { player: null, here: null, text: '' };
  #key = '';

  get info(): BadgeInfo {
    return this.#info;
  }
  set info(v: BadgeInfo) {
    this.#info = v;
    this.#render();
  }

  connectedCallback(): void {
    this.#render();
  }

  #render(): void {
    const { player, here, text } = this.#info;
    // Rebuild only when something changed, so a screen can set this on every state change.
    const key = JSON.stringify([player, here, text]);
    if (key === this.#key && this.childElementCount) return;
    this.#key = key;
    const kids: Node[] = [];
    if (player) kids.push(avatarIcon(player.avatar, 'avatar'));
    const words = document.createElement('span');
    words.className = 'badge-words';
    if (player) {
      const name = document.createElement('span');
      name.className = 'badge-name';
      name.textContent = player.name;
      if (here !== null) {
        const dot = document.createElement('span');
        dot.className = `dot ${here ? 'here' : 'away'}`;
        dot.setAttribute('aria-hidden', 'true');
        name.append(' ', dot);
      }
      words.append(name);
    }
    const line = document.createElement('span');
    line.className = 'badge-text';
    line.textContent = text;
    words.append(line);
    kids.push(words);
    this.replaceChildren(...kids);
  }
}

if (!customElements.get('player-badge')) customElements.define('player-badge', PlayerBadge);

declare global {
  interface HTMLElementTagNameMap {
    'player-badge': PlayerBadge;
  }
}
