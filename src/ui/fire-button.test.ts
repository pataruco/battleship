// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Cell } from '../game/types';
import './fire-button';
import type { FireButton } from './fire-button';

let fb: FireButton;
let fired: Cell[];
const button = () => fb.querySelector<HTMLButtonElement>('button')!;

beforeEach(() => {
  document.body.replaceChildren();
  fb = document.createElement('fire-button') as FireButton;
  document.body.append(fb);
  fired = [];
  fb.addEventListener('fire', (e) => fired.push((e as CustomEvent<{ cell: Cell }>).detail.cell));
});

describe('<fire-button>', () => {
  it('is disabled while there is no aim', () => {
    expect(button().disabled).toBe(true);
    button().click();
    expect(fired).toEqual([]);
    fb.aim = 42;
    expect(button().disabled).toBe(false);
    fb.aim = null;
    expect(button().disabled).toBe(true);
  });

  it('dispatches one fire for two rapid clicks', () => {
    fb.aim = 7;
    button().click();
    button().click();
    // Even a click that bypasses the disabled attribute is ignored.
    button().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fired).toEqual([7]);
    expect(button().disabled).toBe(true);
  });

  it('stays locked when the aim moves after firing, until reset()', () => {
    fb.aim = 7;
    button().click();
    fb.aim = 8;
    expect(button().disabled).toBe(true);
    fb.reset();
    expect(button().disabled).toBe(false);
    button().click();
    expect(fired).toEqual([7, 8]);
  });

  it('stays disabled while blocked, even with an aim', () => {
    fb.aim = 3;
    fb.blocked = true;
    expect(button().disabled).toBe(true);
    button().click();
    expect(fired).toEqual([]);
    fb.blocked = false;
    expect(button().disabled).toBe(false);
  });

  it('hides the emoji from assistive tech and uses the given label', () => {
    fb.label = 'FIRE!';
    expect(button().querySelector('[aria-hidden="true"]')?.textContent).toBe('🔥');
    expect(button().textContent).toContain('FIRE!');
  });
});
