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
