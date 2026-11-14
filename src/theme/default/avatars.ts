import artUrl from './art.svg?url';

export const AVATAR_IDS = [
  'octopus',
  'crab',
  'whale',
  'turtle',
  'seal',
  'puffin',
  'jellyfish',
  'starfish',
  'seahorse',
  'otter',
  'narwhal',
  'pufferfish',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export const SHIP_IDS = ['flagship', 'frigate', 'corvette', 'sloop', 'dinghy'] as const;

const SVG_NS = 'http://www.w3.org/2000/svg';

export function isAvatarId(id: string): id is AvatarId {
  return (AVATAR_IDS as readonly string[]).includes(id);
}

/** `<svg><use href="#symbolId"/></svg>`, built with the DOM (no markup strings). */
export function symbolIcon(symbolId: string, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.append(use);
  return svg;
}

/** Unknown ids fall back to the octopus so a bad record never breaks a screen. */
export function avatarIcon(id: string, className = 'avatar'): SVGSVGElement {
  return symbolIcon(`av-${isAvatarId(id) ? id : 'octopus'}`, className);
}

/**
 * Fetches the sprite once and injects it hidden into the page. Fetching (rather than inlining a
 * string) keeps the CSP at `script-src 'self'` and `style-src 'self'`. Safe to call twice.
 */
export async function loadArt(): Promise<void> {
  if (document.getElementById('art-sprite')) return;
  const res = await fetch(artUrl);
  if (!res.ok) throw new Error(`art ${res.status}`);
  const parsed = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
  svg.id = 'art-sprite';
  svg.setAttribute('class', 'sprite');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  document.body.prepend(svg);
}
