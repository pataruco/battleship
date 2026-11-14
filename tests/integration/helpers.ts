import { readFileSync } from 'node:fs';
import { wsconnect, usernamePasswordAuthenticator, credsAuthenticator, type NatsConnection } from '@nats-io/nats-core';

// Set PROBE_NATS_URL (+ PROBE_CREDS, a path to the browser user's .creds file) to run the
// browser-user tests against a real server such as Synadia Cloud instead of local Docker.
export const PROBE_URL = process.env.PROBE_NATS_URL;
const PROBE_CREDS = process.env.PROBE_CREDS;
const SERVER = PROBE_URL ?? 'ws://localhost:9222';

export function browserConnection(): Promise<NatsConnection> {
  return wsconnect({
    servers: SERVER,
    authenticator: PROBE_URL
      ? credsAuthenticator(new TextEncoder().encode(readFileSync(PROBE_CREDS ?? '', 'utf8')))
      : usernamePasswordAuthenticator('browser', 'browser-dev'),
    name: 'bship-web',
    noEcho: true,
  });
}

export function adminConnection(): Promise<NatsConnection> {
  return wsconnect({
    servers: SERVER,
    authenticator: usernamePasswordAuthenticator('admin', 'admin-dev'),
  });
}
