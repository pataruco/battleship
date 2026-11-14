import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode, gameLink, isSecret, newSession } from './link';

describe('session links', () => {
  it('makes a uuid id and a 22 char secret that decodes to 16 bytes', () => {
    const { id, secret } = newSession();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(secret).toHaveLength(22);
    expect(isSecret(secret)).toBe(true);
    expect(b64urlDecode(secret)).toHaveLength(16);
  });

  it('makes distinct sessions', () => {
    expect(newSession().secret).not.toBe(newSession().secret);
  });

  it('rejects malformed secrets', () => {
    expect(isSecret('short')).toBe(false);
    expect(isSecret('a'.repeat(23))).toBe(false);
    expect(isSecret(`${'a'.repeat(21)}+`)).toBe(false);
  });

  it('round trips base64url without padding', () => {
    const bytes = Uint8Array.from([251, 255, 190, 0, 1]);
    const text = b64urlEncode(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(b64urlDecode(text))).toEqual(Array.from(bytes));
  });

  it('builds a link with the secret in the fragment', () => {
    expect(gameLink('abc', 'sss', 'https://x.test/battleship/')).toBe(
      'https://x.test/battleship/#/g/abc/sss',
    );
  });
});
