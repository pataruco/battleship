/**
 * Tiny DOM builder. Attributes are set with `setAttribute` (`true` → empty attribute, `false`/absent →
 * none), children are appended as nodes or text, so user data never becomes markup.
 * `style` and `on*` attributes are refused (CSP); use classes and `addEventListener`.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'style' || name.startsWith('on')) throw new Error(`el: attribute "${name}" is not allowed`);
    if (value === false) continue;
    node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children);
  return node;
}

/**
 * A polite live region and its `say`. Saying the same words twice still announces: the text is
 * cleared first and set on the next frame.
 */
export function liveRegion(className = 'live'): { node: HTMLElement; say: (text: string) => void } {
  const node = el('p', { class: className, 'aria-live': 'polite', role: 'status' });
  let frame = 0;
  const say = (text: string) => {
    cancelAnimationFrame(frame);
    node.textContent = '';
    frame = requestAnimationFrame(() => (node.textContent = text));
  };
  return { node, say };
}
