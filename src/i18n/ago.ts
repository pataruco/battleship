const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "2 days ago" / "hace 2 días". `ms` is the offset from now (negative = past). */
export function relativeTime(locale: string, ms: number): string {
  for (const [unit, size] of UNITS) {
    if (Math.abs(ms) >= size) {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(Math.round(ms / size), unit);
    }
  }
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
}
