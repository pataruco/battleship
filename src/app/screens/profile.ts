import type { Profile } from '../../game/types';
import { t } from '../../i18n';
import { profileRepo } from '../../storage/games-repo';
import { AVATAR_IDS, avatarIcon } from '../../theme/default/avatars';
import { el } from '../el';
import { session } from '../session';

export const NAME_MAX = 12;

export function renderProfile(app: HTMLElement, deps: { profile: Profile | null; onSaved: () => void }): () => void {
  let chosen: string = deps.profile?.avatar ?? AVATAR_IDS[0];
  let typed = deps.profile?.name ?? '';

  const build = () => {
    const m = t();
    const error = el('p', { class: 'error', role: 'alert' });
    const name = el('input', {
      id: 'profile-name',
      type: 'text',
      name: 'name',
      maxlength: String(NAME_MAX),
      autocomplete: 'off',
      placeholder: m.namePlaceholder,
      required: true,
    });
    name.value = typed;
    name.addEventListener('input', () => {
      typed = name.value;
    });

    const group = el('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-label': m.pickAvatar });
    for (const id of AVATAR_IDS) {
      const input = el('input', { type: 'radio', name: 'avatar', value: id, class: 'sr' });
      input.checked = id === chosen;
      input.addEventListener('change', () => {
        chosen = id;
      });
      group.append(
        el('label', { class: 'avatar-opt' }, input, avatarIcon(id, 'avatar'), el('span', { class: 'avatar-name' }, m.avatarName(id))),
      );
    }

    const save = el('button', { type: 'submit', class: 'big primary' }, el('span', { 'aria-hidden': 'true' }, '✅'), ` ${m.save}`);
    const form = el(
      'form',
      { class: 'profile-form', novalidate: true },
      el('h2', {}, m.pickAvatar),
      group,
      el('label', { for: 'profile-name', class: 'field-label' }, m.yourName),
      name,
      error,
      save,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      // By code points, so an emoji is never cut in half.
      const clean = Array.from(name.value.trim()).slice(0, NAME_MAX).join('').trim();
      if (!clean) {
        error.textContent = m.nameRequired;
        name.focus();
        return;
      }
      const profile: Profile = { playerId: deps.profile?.playerId ?? crypto.randomUUID(), name: clean, avatar: chosen };
      try {
        await profileRepo.put(profile);
      } catch {
        error.textContent = m.saveFailed;
        return;
      }
      deps.profile = profile;
      session.state.set({ profile });
      deps.onSaved();
    });
    const back = deps.profile ? el('a', { class: 'back', href: '#/' }, el('span', { 'aria-hidden': 'true' }, '←'), ` ${m.back}`) : '';
    app.replaceChildren(el('section', { class: 'screen profile' }, back, el('h1', {}, m.profileTitle), form));
    name.focus();
  };

  build();
  window.addEventListener('lang', build);
  return () => window.removeEventListener('lang', build);
}
