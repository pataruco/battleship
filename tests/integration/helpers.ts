import { wsconnect, usernamePasswordAuthenticator, type NatsConnection } from '@nats-io/nats-core';

const SERVER = 'ws://localhost:9222';

export function browserConnection(): Promise<NatsConnection> {
  return wsconnect({
    servers: SERVER,
    authenticator: usernamePasswordAuthenticator('browser', 'browser-dev'),
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
