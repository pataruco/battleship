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
    const from = keyframes[0]?.opacity ?? 0;
    const to = keyframes[keyframes.length - 1]?.opacity ?? 1;
    return el.animate([{ opacity: from }, { opacity: to }], { duration: 150, fill: opts.fill ?? 'none' });
  }
  return el.animate(keyframes, opts);
}
