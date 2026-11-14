// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { setEngine } from '../engine/engine';
import { loadEngineForTests } from '../engine/load-node';
import './qr-code';

beforeAll(async () => {
  setEngine(await loadEngineForTests());
});

describe('<qr-code>', () => {
  it('renders an svg with a label and one non-empty path', () => {
    const el = document.createElement('qr-code');
    el.setAttribute('text', 'https://example.com/#/g/abc');
    el.setAttribute('label', 'Join code');
    document.body.append(el);
    const svg = el.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Join code');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('viewBox')).toMatch(/^0 0 (\d+) \1$/);
    const paths = el.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('d')?.length).toBeGreaterThan(0);
    expect(paths[0]?.getAttribute('fill')).toBe('currentColor');
    expect(el.querySelectorAll('[style]')).toHaveLength(0);
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('re-renders when text changes', () => {
    const el = document.createElement('qr-code');
    el.setAttribute('text', 'a');
    document.body.append(el);
    const first = el.querySelector('path')?.getAttribute('d');
    el.setAttribute('text', 'something quite a bit longer than a');
    expect(el.querySelector('path')?.getAttribute('d')).not.toBe(first);
  });
});
