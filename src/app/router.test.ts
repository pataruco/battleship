import { describe, expect, it } from 'vitest';
import { linkToHash, parseRoute } from './router';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const SECRET = 'abcdefghijklmnopqrstuv';

describe('parseRoute', () => {
  it('maps empty hashes to home', () => {
    for (const h of ['', '#', '#/']) expect(parseRoute(h)).toEqual({ name: 'home' });
  });
  it('maps the fixed routes', () => {
    expect(parseRoute('#/profile')).toEqual({ name: 'profile' });
    expect(parseRoute('#/debug')).toEqual({ name: 'debug' });
    expect(parseRoute('#/dev/local')).toEqual({ name: 'dev-local' });
  });
  it('parses a game link', () => {
    expect(parseRoute(`#/g/${ID}/${SECRET}`)).toEqual({ name: 'game', id: ID, secret: SECRET });
  });
  it('rejects a bad uuid or secret', () => {
    expect(parseRoute(`#/g/not-a-uuid/${SECRET}`)).toEqual({ name: 'not-found' });
    expect(parseRoute(`#/g/${ID}/short`)).toEqual({ name: 'not-found' });
    expect(parseRoute(`#/g/${ID}/${SECRET}x`)).toEqual({ name: 'not-found' });
    expect(parseRoute(`#/g/${ID}`)).toEqual({ name: 'not-found' });
  });
  it('rejects unknown paths', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found' });
  });
});

describe('linkToHash', () => {
  const hash = `#/g/${ID}/${SECRET}`;
  it('accepts a full link, a bare hash and a bare path', () => {
    expect(linkToHash(`  https://example.com/battleship/${hash}\n`)).toBe(hash);
    expect(linkToHash(hash)).toBe(hash);
    expect(linkToHash(`/g/${ID}/${SECRET}`)).toBe(hash);
  });
  it('rejects anything else', () => {
    expect(linkToHash('')).toBeNull();
    expect(linkToHash('hello')).toBeNull();
    expect(linkToHash('#/profile')).toBeNull();
    expect(linkToHash(`#/g/${ID}/short`)).toBeNull();
  });
});
