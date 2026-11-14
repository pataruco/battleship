import { getEngine } from '../../engine/engine';
import { DOC_VERSION } from '../../game/types';
import { t } from '../../i18n';
import { natsConfig } from '../../net/config';
import { gamesRepo, type GameRecord } from '../../storage/games-repo';
import { el } from '../el';
import { recentErrors } from '../errors';
import { session } from '../session';

/** Set by the deploy build (Task 19). */
export const BUILD_ID: string = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? 'dev';

function row(label: string, value: Node | string): HTMLElement[] {
  return [el('dt', {}, label), el('dd', {}, value)];
}

/**
 * `#/debug`, for the grown-up (spec §10.8): connection, server, bucket, the current game's id,
 * revision and seq, versions and the last 20 errors. No secrets are shown.
 */
export function renderDebug(app: HTMLElement): () => void {
  const m = t();
  const conn = session.connection();
  const status = el('span', { 'data-debug': 'status' }, m.status(conn.status));
  const onStatus = () => (status.textContent = t().status(conn.status));
  conn.addEventListener('status', onStatus);

  let server = '?';
  let bucket = '?';
  try {
    const cfg = natsConfig();
    server = cfg.url;
    bucket = cfg.bucket;
  } catch (e) {
    server = String(e);
  }
  let engine = '?';
  try {
    engine = String(getEngine().version);
  } catch {
    // engine not loaded
  }

  const game = el('dl', { class: 'debug-game' });
  const errors = recentErrors();
  const errorList =
    errors.length === 0
      ? el('p', {}, m.debugNone)
      : el(
          'ol',
          { class: 'debug-errors' },
          ...errors.map((e) => el('li', {}, `${new Date(e.at).toISOString()} ${e.message}`)),
        );

  app.replaceChildren(
    el(
      'section',
      { class: 'screen debug' },
      el('h1', {}, m.debugTitle),
      el(
        'dl',
        {},
        ...row(m.debugConnection, status),
        ...row(m.debugServer, server),
        ...row(m.debugBucket, bucket),
        ...row(m.debugVersions, `app ${BUILD_ID} · engine ${engine} · doc ${DOC_VERSION}`),
      ),
      el('h2', {}, m.debugGame),
      game,
      el('h2', {}, m.debugErrors),
      errorList,
      el('a', { class: 'big', href: '#/' }, m.home),
    ),
  );

  let disposed = false;
  const fill = (rec: GameRecord | null) => {
    if (disposed) return;
    if (!rec) return game.replaceChildren(el('dd', {}, m.debugNone));
    game.replaceChildren(
      ...row('id', rec.id),
      ...row(m.debugRevision, String(rec.revision)),
      ...row(m.debugSeq, String(rec.seq)),
      ...row('doc', rec.doc ? `v${rec.doc.v} · engine ${rec.doc.engine} · round ${rec.doc.round} · ${rec.doc.phase}` : '—'),
    );
  };
  const id = session.lastGameId;
  (id ? gamesRepo.get(id) : gamesRepo.list().then((l) => l[0] ?? null)).then(fill, () => fill(null));

  return () => {
    disposed = true;
    conn.removeEventListener('status', onStatus);
  };
}
