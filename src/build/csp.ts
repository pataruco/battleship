/** Scheme + authority of an absolute URL as written (keeps a default port), or '' for a relative one. */
function originOf(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i.exec(url)?.[0] ?? '';
}

/** Production Content-Security-Policy for the given NATS url. */
export function buildCsp(natsUrl: string): string {
  const origin = originOf(natsUrl);
  const connect = origin ? `'self' ${origin}` : "'self'";
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `connect-src ${connect}`,
    "img-src 'self' data: blob:",
    "style-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ].join('; ');
}
