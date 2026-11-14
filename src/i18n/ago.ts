const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "2 days ago" / "hace 2 días". `offset` is from now (negative = past; future clamps to now). */
export function relativeTime(locale: string, offset: number): string {
  // A server timestamp a little ahead of this device's clock is still "now".
  const ms = Math.min(offset, 0);
  for (const [unit, size] of UNITS) {
    if (Math.abs(ms) >= size) {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(Math.round(ms / size), unit);
    }
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
}
