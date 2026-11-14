/** `prefers-reduced-motion: reduce`. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const noop = (): Animation | null => null;

/**
 * Web Animations wrapper. Transform and opacity only, by convention (older iPads). Under reduced
 * motion the keyframes are replaced by a 150 ms fade. Returns null when WAAPI is missing.
 */
export function animate(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions = {}): Animation | null {
  if (typeof el.animate !== 'function') return noop();
  if (reducedMotion()) {
    // A fade in to the keyframes' peak opacity (they often run 0 -> 1 -> 0, so first/last would be invisible).
    const peak = Math.max(0, ...keyframes.map((k) => Number(k.opacity ?? 0)));
    const visible = peak > 0 ? peak : 1;
    return el.animate([{ opacity: 0 }, { opacity: visible }], { duration: 150, fill: 'none' });
  }
  return el.animate(keyframes, opts);
}
