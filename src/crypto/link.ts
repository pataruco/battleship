const SECRET_RE = /^[A-Za-z0-9_-]{22}$/;

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function isSecret(s: string): boolean {
  return SECRET_RE.test(s);
}

export function newSession(): { id: string; secret: string } {
  return {
    id: crypto.randomUUID(),
    secret: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
  };
}

export function gameLink(
  id: string,
  secret: string,
  base: string = location.origin + import.meta.env.BASE_URL,
): string {
  return `${base}#/g/${id}/${secret}`;
}
