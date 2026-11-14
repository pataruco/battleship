import type { Profile } from '../../game/types';
import { lang, setLang, t, type Lang } from '../../i18n';
import type { GameRecord } from '../../storage/games-repo';
import { getPrefs, setPrefs } from '../../storage/prefs';
import { avatarIcon } from '../../theme/default/avatars';
import { el } from '../el';
import { linkToHash } from '../router';
import { session, type Badge } from '../session';
import { installHint } from './install-hint';

const BADGE_ICON: Record<Badge, string> = {
  'your-turn': '⭐',
  'their-turn': '⏳',
  setup: '⚓',
  over: '🏁',
  'update-needed': '⬆️',
  unavailable: '⚠️',
};

function badgeText(badge: Badge, opponent: string): string {
  const m = t();
  switch (badge) {
    case 'your-turn':
      return m.yourTurn;
    case 'their-turn':
      return m.turnOf(opponent);
    case 'setup':
      return m.badgeSetup;
    case 'over':
      return m.badgeOver;
    case 'update-needed':
      return m.badgeUpdateNeeded;
    case 'unavailable':
      return m.badgeUnavailable;
  }
}

function gameCard(rec: GameRecord, badge: Badge): HTMLElement {
  const m = t();
  const name = rec.opponent?.name ?? m.waitingForFriend;
  const status = badgeText(badge, rec.opponent?.name ?? '');
  const when = rec.lastMoveAt ? m.lastMove(m.ago(rec.lastMoveAt - Date.now())) : '';
  return el(
    'li',
    {},
    el(
      'a',
      { class: `card badge-${badge}`, href: `#/g/${rec.id}/${rec.secret}`, 'aria-label': m.openGame(name) },
      avatarIcon(rec.opponent?.avatar ?? 'octopus', 'avatar'),
      el(
        'span',
        { class: 'card-text' },
        el('strong', {}, name),
        el('span', { class: 'badge' }, el('span', { 'aria-hidden': 'true' }, BADGE_ICON[badge]), ` ${status}`),
        when ? el('small', {}, when) : '',
      ),
    ),
  );
}

function toggle(label: string, icon: string, on: boolean, onChange: (v: boolean) => void): HTMLButtonElement {
  const m = t();
  const b = el('button', { type: 'button', role: 'switch', class: 'toggle', 'aria-checked': String(on) });
  const paint = (v: boolean) => {
    b.setAttribute('aria-checked', String(v));
    b.replaceChildren(el('span', { 'aria-hidden': 'true' }, icon), ` ${label}: ${v ? m.on : m.off}`);
  };
  paint(on);
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    paint(v);
    onChange(v);
  });
  return b;
}

export function renderHome(
  app: HTMLElement,
  deps: { profile: Profile | null; onNewGame: () => Promise<void> },
): () => void {
  const games = el('ul', { class: 'games' });
  const live = el('p', { class: 'error', role: 'alert' });

  const paintGames = () => {
    const { games: list, badges } = session.state.get();
    const m = t();
    if (!list || list.length === 0) {
      games.replaceChildren(el('li', { class: 'empty' }, m.noGames));
      return;
    }
    games.replaceChildren(...list.map((rec) => gameCard(rec, badges[rec.id] ?? 'setup')));
  };

  const pasteLink = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // blocked or unsupported: ask instead
    }
    // An empty clipboard falls through to the prompt too.
    if (!text.trim()) text = window.prompt(t().pastePrompt) ?? '';
    if (!text.trim()) return;
    const hash = linkToHash(text);
    if (hash) window.location.hash = hash;
    else live.textContent = t().pasteBad;
  };

  let hint: ReturnType<typeof installHint> | null = null;
  const build = () => {
    hint?.dispose();
    hint = installHint();
    const m = t();
    const prefs = getPrefs();
    const langButton = (l: Lang, label: string) => {
      const b = el('button', { type: 'button', class: 'lang-button', lang: l, 'aria-pressed': String(lang() === l) }, label);
      b.addEventListener('click', () => setLang(l));
      return b;
    };
    const me = deps.profile
      ? el('a', { class: 'me', href: '#/profile', 'aria-label': `${m.myProfile}: ${deps.profile.name}` }, avatarIcon(deps.profile.avatar, 'avatar'), el('span', {}, deps.profile.name))
      : el('a', { class: 'me', href: '#/profile' }, m.myProfile);
    const newGame = el('button', { type: 'button', class: 'big primary' }, el('span', { 'aria-hidden': 'true' }, '➕'), ` ${m.newGame}`);
    newGame.addEventListener('click', async () => {
      newGame.disabled = true; // one tap, one game
      live.textContent = '';
      try {
        await deps.onNewGame();
      } catch {
        live.textContent = t().offline;
        newGame.disabled = false;
      }
    });
    const paste = el('button', { type: 'button' }, el('span', { 'aria-hidden': 'true' }, '📋'), ` ${m.pasteLink}`);
    paste.addEventListener('click', () => void pasteLink());

    live.textContent = '';
    app.replaceChildren(
      el(
        'section',
        { class: 'screen home' },
        el('header', { class: 'top' }, me, el('div', { class: 'lang', role: 'group', 'aria-label': m.language }, langButton('en', 'EN'), langButton('es', 'ES'))),
        el('h1', {}, m.appName),
        newGame,
        el(
          'div',
          { class: 'toggles' },
          toggle(m.sound, '🔊', prefs.sound, (sound) => setPrefs({ sound })),
          toggle(m.voice, '🗣️', prefs.voice, (voice) => setPrefs({ voice })),
          paste,
        ),
        live,
        el('h2', {}, m.myGames),
        games,
        hint.node,
      ),
    );
    paintGames();
  };

  build();
  let lastStatus = session.state.get().status;
  const onChange = () => {
    paintGames();
    const { status } = session.state.get();
    if (status === 'online' && lastStatus !== 'online') void session.refreshHome().catch(() => {});
    lastStatus = status;
  };
  session.state.addEventListener('change', onChange);
  window.addEventListener('lang', build);
  void session.refreshHome().catch(() => {});
  return () => {
    hint?.dispose();
    session.state.removeEventListener('change', onChange);
    window.removeEventListener('lang', build);
  };
}
