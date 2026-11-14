import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp';

describe('buildCsp', () => {
  it('builds the full production policy for an absolute wss url', () => {
    expect(buildCsp('wss://connect.ngs.global:443')).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' wss://connect.ngs.global:443; img-src 'self' data: blob:; style-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'",
    );
  });

  it('adds nothing for a relative url', () => {
    expect(buildCsp('/nats')).toContain("connect-src 'self';");
  });

  it('adds the origin of a ws url', () => {
    expect(buildCsp('ws://localhost:9222')).toContain("connect-src 'self' ws://localhost:9222;");
  });
});
