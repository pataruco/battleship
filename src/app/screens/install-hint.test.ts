// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrefs } from '../../storage/prefs';

vi.mock('../pwa', () => ({
  isIosSafari: () => true,
  canInstall: () => false,
  promptInstall: async () => {},
  onInstallChange: () => () => {},
}));

import { installHint } from './install-hint';

describe('installHint', () => {
  beforeEach(() => localStorage.clear());

  it('shows once, survives a language change, goes when dismissed, and is not shown again', () => {
    const hint = installHint();
    document.body.append(hint.node);
    expect(hint.node.querySelector('.install-hint')).not.toBeNull();
    window.dispatchEvent(new Event('lang'));
    expect(hint.node.querySelector('.install-hint')).not.toBeNull();
    hint.node.querySelector<HTMLButtonElement>('.install-hint button')!.click();
    expect(hint.node.querySelector('.install-hint')).toBeNull();
    expect(getPrefs().installHintShown).toBe(true);
    hint.dispose();
    expect(installHint().node.querySelector('.install-hint')).toBeNull();
  });
});
