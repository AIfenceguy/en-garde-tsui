// Hub view for §3.1 + §3.2 + §3.7. Sub-tabs: Private | Group | Video.
// The three ways the boys learn: from a coach one-on-one, from a class, and
// from watching real bouts.

import { el, $ } from '../lib/util.js';
import { activeProfile } from '../lib/state.js';
import { renderPrivateLessonsTab } from './private_lessons.js';
import { renderGroupLessonsTab } from './group_lessons.js';
import { mountVideos } from './videos.js';

const STORE_KEY = 'en-garde.lessonsTab';

export async function mountLessons(root, params) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));

    const initial = params.tab || localStorage.getItem(STORE_KEY) || 'private';

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Lessons']),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    const tabs = el('div', { class: 'chips', style: { marginBottom: '14px' } }, [
        el('button', { class: 'chip', 'data-tab': 'private', onclick: () => switchTab('private') }, ['Private']),
        el('button', { class: 'chip', 'data-tab': 'group',   onclick: () => switchTab('group')   }, ['Group']),
        el('button', { class: 'chip', 'data-tab': 'video',   onclick: () => switchTab('video')   }, ['Video'])
    ]);
    root.appendChild(tabs);

    const body = el('div', {});
    root.appendChild(body);

    function switchTab(name) {
        localStorage.setItem(STORE_KEY, name);
        for (const c of tabs.querySelectorAll('.chip')) {
            c.setAttribute('aria-pressed', c.dataset.tab === name ? 'true' : 'false');
        }
        body.innerHTML = '';
        if      (name === 'private') renderPrivateLessonsTab(body);
        else if (name === 'video')   mountVideos(body, { embedded: true });
        else                         renderGroupLessonsTab(body);
    }
    switchTab(initial);
}
