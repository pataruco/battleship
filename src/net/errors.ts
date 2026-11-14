// Classified by shape, not `instanceof`: the kv package and app code can hold different copies
// of the error classes (see spec §7 *Client*), and duck typing keeps nats.js out of this module.

const CONFLICT_CODES = new Set([10071, 10164]);

function apiCode(e: unknown): number | undefined {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}
const message = (e: unknown): string => (e instanceof Error ? e.message : '');

/** JetStream "wrong last sequence" (10071), or its replicated-stream twin 10164: re-read and retry. */
export function isConflict(e: unknown): boolean {
  const code = apiCode(e);
  return (code !== undefined && CONFLICT_CODES.has(code)) || /wrong last sequence/i.test(message(e));
}

/** A request whose reply never came: the write may or may not have landed. */
export function isTimeout(e: unknown): boolean {
  for (let x: unknown = e, depth = 0; x instanceof Error && depth < 5; x = x.cause, depth++) {
    if (x.name === 'TimeoutError') return true;
  }
  return false;
}

/** On `create`, 10071 means the key already holds a value. The caller decides which reading applies. */
export function isKeyExists(e: unknown): boolean {
  return apiCode(e) === 10071 || /wrong last sequence/i.test(message(e));
}
