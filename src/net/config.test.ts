import { describe, expect, it } from 'vitest';
import { natsConfig } from './config';

const loc = (protocol: string, host: string) => ({ protocol, host }) as Location;

describe('natsConfig', () => {
  it('defaults to no auth and the fixed bucket', () => {
    const c = natsConfig({ VITE_NATS_URL: 'wss://x.example:443' }, loc('https:', 'a'));
    expect(c).toEqual({ url: 'wss://x.example:443', auth: { kind: 'none' }, bucket: 'bship_games' });
  });

  it('reads userpass', () => {
    const c = natsConfig(
      { VITE_NATS_URL: 'ws://h:9222', VITE_NATS_AUTH: 'userpass', VITE_NATS_USER: 'u', VITE_NATS_PASS: 'p' },
      loc('http:', 'a'),
    );
    expect(c.auth).toEqual({ kind: 'userpass', user: 'u', pass: 'p' });
  });

  it('reads creds', () => {
    const c = natsConfig(
      { VITE_NATS_URL: 'wss://h', VITE_NATS_AUTH: 'creds', VITE_NATS_CREDS: 'CREDS' },
      loc('https:', 'a'),
    );
    expect(c.auth).toEqual({ kind: 'creds', creds: 'CREDS' });
  });

  it('resolves a /nats path against the page origin', () => {
    expect(natsConfig({ VITE_NATS_URL: '/nats' }, loc('http:', '192.168.1.5:5173')).url).toBe(
      'ws://192.168.1.5:5173/nats',
    );
    expect(natsConfig({ VITE_NATS_URL: '/nats' }, loc('https:', 'x.dev')).url).toBe('wss://x.dev/nats');
  });

  it('throws on an unknown auth kind', () => {
    expect(() => natsConfig({ VITE_NATS_URL: 'ws://h', VITE_NATS_AUTH: 'bogus' }, loc('http:', 'a'))).toThrow(
      /VITE_NATS_AUTH/,
    );
  });
});
