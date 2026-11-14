import { describe, expect, it } from 'vitest';
import { newSession } from './link';
import { createSealer } from './seal';

const data = new TextEncoder().encode('hello sea');

describe('sealer', () => {
  it('round trips bytes and json', async () => {
    const { id, secret } = newSession();
    const s = await createSealer(id, secret);
    const open = await s.open('doc', await s.seal('doc', data));
    expect(open && Array.from(open)).toEqual(Array.from(data));
    expect(await s.openJson('here', await s.sealJson('here', { a: [1, 2] }))).toEqual({ a: [1, 2] });
  });

  it('returns null for the wrong secret', async () => {
    const a = newSession();
    const b = newSession();
    const sealed = await (await createSealer(a.id, a.secret)).seal('doc', data);
    expect(await (await createSealer(a.id, b.secret)).open('doc', sealed)).toBeNull();
  });

  it('returns null for the same secret but another game id', async () => {
    const a = newSession();
    const sealed = await (await createSealer(a.id, a.secret)).seal('doc', data);
    expect(await (await createSealer(newSession().id, a.secret)).open('doc', sealed)).toBeNull();
  });

  it('returns null for another channel', async () => {
    const { id, secret } = newSession();
    const s = await createSealer(id, secret);
    expect(await s.open('doc', await s.seal('here', data))).toBeNull();
  });

  it('returns null for tampering, bad version, short or empty input', async () => {
    const { id, secret } = newSession();
    const s = await createSealer(id, secret);
    const sealed = await s.seal('doc', data);
    const flipped = sealed.slice();
    flipped[flipped.length - 1] ^= 1;
    expect(await s.open('doc', flipped)).toBeNull();
    const badVersion = sealed.slice();
    badVersion[0] = 2;
    expect(await s.open('doc', badVersion)).toBeNull();
    expect(await s.open('doc', new Uint8Array(0))).toBeNull();
    expect(await s.open('doc', sealed.slice(0, 20))).toBeNull();
  });

  it('returns null for authentic payloads that are not json', async () => {
    const { id, secret } = newSession();
    const s = await createSealer(id, secret);
    expect(await s.openJson('doc', await s.seal('doc', new TextEncoder().encode('{nope')))).toBeNull();
    expect(await s.openJson('doc', await s.seal('doc', Uint8Array.from([0xff, 0xfe])))).toBeNull();
  });

  it('uses a fresh iv each time', async () => {
    const { id, secret } = newSession();
    const s = await createSealer(id, secret);
    expect(Array.from(await s.seal('doc', data))).not.toEqual(Array.from(await s.seal('doc', data)));
  });

  it('rejects a malformed secret', async () => {
    await expect(createSealer(newSession().id, 'bad')).rejects.toThrow();
  });

  it('derives a non-extractable key', async () => {
    const spy: CryptoKey[] = [];
    const orig = crypto.subtle.deriveKey.bind(crypto.subtle);
    crypto.subtle.deriveKey = (async (...args: Parameters<typeof orig>) => {
      const k = await orig(...args);
      spy.push(k);
      return k;
    }) as typeof orig;
    try {
      const { id, secret } = newSession();
      await createSealer(id, secret);
    } finally {
      crypto.subtle.deriveKey = orig;
    }
    expect(spy).toHaveLength(1);
    await expect(crypto.subtle.exportKey('raw', spy[0])).rejects.toThrow();
  });
});
