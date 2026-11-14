import { connect } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { headers, type NatsConnection } from '@nats-io/nats-core';
import { Kvm, type KV } from '@nats-io/kv';
import { jetstreamManager } from '@nats-io/jetstream';
import { adminConnection, browserConnection } from './helpers';

const enc = new TextEncoder();
const dec = new TextDecoder();
const key = () => `g.${crypto.randomUUID()}`;

describe('browser user permissions', () => {
  let nc: NatsConnection;
  let admin: NatsConnection;
  let kv: KV;

  beforeAll(async () => {
    nc = await browserConnection();
    admin = await adminConnection();
    kv = await new Kvm(nc).open('bship_games', { allow_direct: true });
  });

  afterAll(async () => {
    await nc?.close();
    await admin?.close();
  });

  it('creates, gets and updates a game key', async () => {
    const k = key();
    const rev = await kv.create(k, enc.encode('one'));
    const got = await kv.get(k);
    expect(got && dec.decode(got.value)).toBe('one');
    expect(got?.revision).toBe(rev);
    const next = await kv.update(k, enc.encode('two'), rev);
    expect(next).toBeGreaterThan(rev);
    expect(dec.decode((await kv.get(k))!.value)).toBe('two');
  });

  it('cannot purge a key', async () => {
    const k = key();
    await kv.create(k, enc.encode('keep'));
    await expect(kv.purge(k)).rejects.toThrow();
    expect(dec.decode((await kv.get(k))!.value)).toBe('keep');
  });

  it('cannot roll up a key with a raw publish', async () => {
    const keep = key();
    const target = key();
    await kv.create(keep, enc.encode('survivor'));
    await kv.create(target, enc.encode('original'));
    const h = headers();
    h.set('Nats-Rollup', 'all');
    const reply = await nc.request(`$KV.bship_games.${target}`, enc.encode('evil'), {
      headers: h,
      timeout: 5000,
    });
    const body = JSON.parse(dec.decode(reply.data));
    expect(body.error.err_code).toBe(10111);
    expect(body.error.description).toBe('rollup not permitted');
    expect(dec.decode((await kv.get(target))!.value)).toBe('original');
    expect(dec.decode((await kv.get(keep))!.value)).toBe('survivor');
  });

  it('cannot create streams', async () => {
    await expect(
      nc.request('$JS.API.STREAM.CREATE.X', JSON.stringify({ name: 'X', subjects: ['x'] }), {
        timeout: 3000,
      }),
    ).rejects.toThrow(/permissions violation/i);
    const jsm = await jetstreamManager(admin);
    await expect(jsm.streams.info('X')).rejects.toThrow(/not found/i);
  });

  it('is refused over plain TCP (websocket-only user)', async () => {
    const reply = await new Promise<string>((resolve, reject) => {
      const sock = connect(4222, 'localhost');
      let buf = '';
      sock.setTimeout(5000, () => reject(new Error('timeout')));
      sock.on('error', reject);
      sock.on('data', (d) => {
        buf += d.toString();
        if (buf.startsWith('INFO') && !buf.includes('CONNECT')) {
          buf += 'CONNECT';
          sock.write('CONNECT {"user":"browser","pass":"browser-dev","verbose":false}\r\nPING\r\n');
        }
        if (/-ERR|PONG/.test(buf)) sock.destroy();
      });
      sock.on('close', () => resolve(buf));
    });
    expect(reply).toMatch(/-ERR '(Authorization Violation|.*)'/);
    expect(reply).not.toContain('PONG');
  });

  it('cannot write outside g.*', async () => {
    await expect(kv.put('other.key', enc.encode('nope'))).rejects.toThrow();
  });
});
