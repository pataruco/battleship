import { gameLink } from '../../crypto/link';
import type { Action, Seat } from '../../game/types';
import { play } from '../../fx/audio';
import { reducedMotion } from '../../fx/motion';
import { t } from '../../i18n';
import { avatarIcon } from '../../theme/default/avatars';
import { fxLayer } from '../../ui/fx-layer';
import type { ApplyResult } from '../../net/game-store';
import { el } from '../el';
import { logError } from '../errors';
import type { BannerKind, ControllerState, GameController, MovedDetail } from '../game-controller';
import { session } from '../session';
import { renderBattle } from './battle';
import { renderInvite } from './invite';
import { renderJoin } from './join';
import { renderPlacement } from './placement';
import { renderRoundOver } from './round-over';
import { renderUnavailable } from './unavailable';
import { renderWho } from './who';

/** A screen that stays mounted while its view lasts and is updated in place on every change. */
export type GameView = {
  update(s: ControllerState): void;
  dispose(): void;
  /** True while the screen holds the view (a shell in flight): the next view waits. */
  busy?(): boolean;
};

export type GameViewOptions = {
  c: GameController;
  link: string;
  /** `c.act`, but an unexpected throw is logged and reported as failed. */
  act: (action: Action) => Promise<ApplyResult>;
  /** Re-runs routing (after `busy()` turns false). */
  repaint: () => void;
  onShared: () => void;
};

type View =
  | 'loading'
  | 'unavailable'
  | 'update-needed'
  | 'join'
  | 'who'
  | 'invite'
  | 'placement'
  | 'battle'
  | 'round-over';

/** Which screen the game shows, by status, seat and phase. `placing`: the host left the invite. */
export function viewOf(s: ControllerState, placing: boolean): View {
  if (s.status !== 'ready' || !s.doc) return s.status === 'ready' ? 'loading' : s.status;
  if (s.needsJoin) return 'join';
  if (s.needsWho) return 'who';
  if (s.seat === null) return 'loading';
  const { doc } = s;
  if (doc.phase === 'setup') {
    return s.seat === 0 && doc.seats[1] === null && !placing ? 'invite' : 'placement';
  }
  return doc.phase === 'battle' ? 'battle' : 'round-over';
}

function bannerText(kind: BannerKind): string {
  const m = t();
  switch (kind) {
    case 'offline':
      return m.offline;
    case 'busy':
      return m.busy;
    case 'retry':
      return m.retryBanner;
    case 'rejected':
      return m.rejectedBanner;
    case 'update-needed':
      return m.authFailed;
  }
}

export type GameScreenOptions = {
  id: string;
  secret: string;
  /** Creates a game and navigates to it; rejects when offline. */
  onNewGame: () => Promise<void>;
};

/** `#/g/<id>/<secret>`: opens the controller and shows the screen its state calls for. */
export function renderGame(app: HTMLElement, o: GameScreenOptions): () => void {
  const banner = el('p', { class: 'banner', role: 'status', hidden: true });
  const body = el('div', { class: 'game-body' });
  app.replaceChildren(banner, body);

  let c: GameController | null = null;
  let disposed = false;
  let placing = false;
  let shown: View | null = null;
  let view: GameView | null = null;
  const link = gameLink(o.id, o.secret);
  const markShared = () => void c?.markShared();

  const loading = () => {
    body.replaceChildren(el('section', { class: 'screen' }, el('p', { class: 'spinner', role: 'status' }, t().loading)));
  };

  const act = (action: Action): Promise<ApplyResult> =>
    c!.act(action).catch((e: unknown) => {
      logError(e);
      return { kind: 'failed', reason: 'offline' } as ApplyResult;
    });
  const viewOptions = (): GameViewOptions => ({ c: c!, link, act, repaint: () => paint(), onShared: markShared });

  const build = (next: View) => {
    const s = c!.state;
    view?.dispose();
    view = null;
    switch (next) {
      case 'loading':
        return loading();
      case 'unavailable':
      case 'update-needed':
        return renderUnavailable(body, { kind: next, onNewGame: o.onNewGame });
      case 'join':
        return renderJoin(body, {
          host: s.doc!.seats[0],
          link,
          onJoin: async () => (await c!.join()).kind === 'ok',
          onImHost: () => void c!.claimSeat(0),
          onShared: markShared,
        });
      case 'who':
        return renderWho(body, {
          seats: s.doc!.seats as [Seat, Seat],
          isHere: (seat) => c!.seatHere(seat),
          onClaim: (seat) => void c!.claimSeat(seat),
        });
      case 'invite':
        return renderInvite(body, {
          link,
          hostName: s.doc!.seats[0].name,
          onShared: markShared,
          onPlace: () => {
            placing = true;
            paint();
          },
        });
      case 'placement':
        view = renderPlacement(body, viewOptions());
        return;
      case 'battle':
        view = renderBattle(body, viewOptions());
        return;
      case 'round-over':
        view = renderRoundOver(body, viewOptions());
        return;
    }
  };

  const paint = () => {
    if (!c || disposed) return;
    const s = c.state;
    const next = viewOf(s, placing);
    // A new round is a new placement screen (fresh dock, "same ships" offer).
    const round = s.doc?.round ?? 0;
    if (view?.busy?.()) {
      // A shell in flight: its result shows first, then the next screen (it calls repaint).
      view.update(s);
    } else if (next !== shown || round !== shownRound) {
      shown = next;
      shownRound = round;
      // A soft cross-fade between screens where the browser can do it (never under reduced motion).
      const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
      if (typeof start === 'function' && !reducedMotion() && view === null) {
        start.call(document, () => {
          if (!disposed && shown === next) build(next);
        });
      } else {
        build(next);
      }
    } else {
      view?.update(s);
    }
    const kind = s.banner;
    const show = kind !== null && shown !== 'update-needed';
    banner.hidden = !show;
    banner.textContent = show ? bannerText(kind) : '';
  };

  let shownRound = 0;

  /** A friend took the second seat: chime, and their avatar slides in. */
  const onMoved = (e: Event) => {
    const { prev, next } = (e as CustomEvent<MovedDetail>).detail;
    const guest = next.seats[1];
    if (!prev || prev.seats[1] || !guest || c?.state.seat !== 0) return;
    play('chime');
    const chip = el('span', { class: 'join-chip' }, avatarIcon(guest.avatar, 'avatar'), ` ${guest.name}`);
    fxLayer().slideIn(chip);
  };

  const relang = () => {
    shown = null;
    if (c) paint();
    else loading();
  };

  loading();
  window.addEventListener('lang', relang);
  session
    .openGame(o.id, o.secret)
    .then((ctrl) => {
      if (disposed) return ctrl.dispose();
      c = ctrl;
      session.lastGameId = o.id;
      c.addEventListener('change', paint);
      c.addEventListener('moved', onMoved);
      paint();
    })
    .catch(() => {
      if (!disposed) renderUnavailable(body, { kind: 'unavailable', onNewGame: o.onNewGame });
    });

  return () => {
    disposed = true;
    view?.dispose();
    window.removeEventListener('lang', relang);
    c?.removeEventListener('change', paint);
    c?.removeEventListener('moved', onMoved);
    c?.dispose();
  };
}
