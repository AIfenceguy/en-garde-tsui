// Profile switcher UI in the topbar.

import { getState, subscribe } from './state.js';
import { setActiveProfile, signOut } from './auth.js';
import { $, el, clear } from './util.js';

export function mountProfileSwitcher() {
    const btn = $('#profile-switcher');
    const menu = $('#profile-menu');
    if (!btn || !menu) return;

    function render() {
        const { profiles, activeProfileId } = getState();
        const active = profiles.find((p) => p.id === activeProfileId);
        $('.profile-name', btn).textContent = active?.name || 'Profile';

        clear(menu);
        for (const p of profiles) {
            menu.appendChild(
                el('button', {
                    class: `role-${p.role}` + (p.id === activeProfileId ? ' active' : ''),
                    onclick: () => {
                        setActiveProfile(p.id);
                        menu.hidden = true;
                    }
                }, [
                    el('span', { class: 'profile-mark' }),
                    el('span', { class: 'profile-name' }, [p.name]),
                    p.id === activeProfileId ? el('span', { class: 'mono dim' }, ['•']) : null
                ])
            );
        }
        menu.appendChild(
            el('button', { onclick: () => signOut() }, [
                el('span', { class: 'mono dim' }, ['↩']),
                el('span', {}, ['Sign out'])
            ])
        );
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !btn.contains(e.target)) menu.hidden = true;
    });

    subscribe(render);
    render();
}
