import { gameLink } from '../../crypto/link';
import type { Seat } from '../../game/types';
import { t } from '../../i18n';
import { el } from '../el';
import type { BannerKind, ControllerState, GameController } from '../game-controller';
import { session } from '../session';
import { renderInvite } from './invite';
import { renderJoin } from './join';
import { renderUnavailable } from './unavailable';
import { renderWho } from './who';

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
  const link = gameLink(o.id, o.secret);
  const markShared = () => void c?.markShared();

  const loading = () => {
    body.replaceChildren(el('section', { class: 'screen' }, el('p', { class: 'spinner', role: 'status' }, t().loading)));
  };

  const build = (view: View) => {
    const m = t();
    const s = c!.state;
    switch (view) {
      case 'loading':
        return loading();
      case 'unavailable':
      case 'update-needed':
        return renderUnavailable(body, { kind: view, onNewGame: o.onNewGame });
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
      default:
        // Placement, battle and round over arrive with Task 16.
        body.replaceChildren(
          el(
            'section',
            { class: 'screen', 'data-phase': view },
            el('p', { 'data-todo': 'task16' }, `${m.comingSoon} (${view})`),
            el('a', { class: 'big', href: '#/' }, m.home),
          ),
        );
    }
  };

  const paint = () => {
    if (!c || disposed) return;
    const view = viewOf(c.state, placing);
    if (view !== shown) {
      shown = view;
      build(view);
    }
    const kind = c.state.banner;
    const show = kind !== null && view !== 'update-needed';
    banner.hidden = !show;
    banner.textContent = show ? bannerText(kind) : '';
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
      c.addEventListener('change', paint);
      paint();
    })
    .catch(() => {
      if (!disposed) renderUnavailable(body, { kind: 'unavailable', onNewGame: o.onNewGame });
    });

  return () => {
    disposed = true;
    window.removeEventListener('lang', relang);
    c?.removeEventListener('change', paint);
    c?.dispose();
  };
}
