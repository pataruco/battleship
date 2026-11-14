export type NatsAuth =
  | { kind: 'none' }
  | { kind: 'userpass'; user: string; pass: string }
  | { kind: 'creds'; creds: string };

export interface NatsConfig {
  url: string;
  auth: NatsAuth;
  bucket: string;
}

type Env = Record<string, string | boolean | undefined>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function natsConfig(
  env: Env = import.meta.env as Env,
  loc: Pick<Location, 'protocol' | 'host'> = globalThis.location,
): NatsConfig {
  const raw = str(env.VITE_NATS_URL);
  const url = raw.startsWith('/') ? `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${raw}` : raw;
  const kind = str(env.VITE_NATS_AUTH) || 'none';
  let auth: NatsAuth;
  switch (kind) {
    case 'none':
      auth = { kind };
      break;
    case 'userpass':
      auth = { kind, user: str(env.VITE_NATS_USER), pass: str(env.VITE_NATS_PASS) };
      break;
    case 'creds':
      auth = { kind, creds: str(env.VITE_NATS_CREDS) };
      break;
    default:
      throw new Error(`Unknown VITE_NATS_AUTH "${kind}" (expected none, userpass or creds)`);
  }
  return { url, auth, bucket: 'bship_games' };
}
