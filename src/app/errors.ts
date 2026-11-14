/** The last errors, newest last, for the `#/debug` screen (there is no analytics). */
export type LoggedError = { at: number; message: string };

const MAX = 20;
const ring: LoggedError[] = [];

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return typeof e === 'string' ? e : JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Keeps the last 20 errors and logs to the console. Never throws. */
export function logError(e: unknown): void {
  ring.push({ at: Date.now(), message: describe(e) });
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  console.error(e);
}

export function recentErrors(): readonly LoggedError[] {
  return ring.slice();
}
