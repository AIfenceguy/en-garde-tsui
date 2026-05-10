// Sign-in view (shown when no session) and the topbar countdown updater.

import { el } from '../lib/util.js';
import { signInWithGoogle, signInWithMagicLink } from '../lib/auth.js';
import { isConfigured } from '../lib/supa.js';
import { nextTournament } from '../lib/db.js';
import { daysUntil, fmtDate } from '../lib/util.js';

export function renderSignIn(root) {
    root.innerHTML = '';
    document.body.classList.add('is-signed-out');

    const wrap = el('div', { class: 'auth' }, [
        el('div', { class: 'auth-mark' }, [
            el('h1', { class: 'wordmark wordmark-lg' }, ['En Garde']),
            el('div', { class: 'auth-mark-sub' }, ['A family studio · foil · est. 2025'])
        ]),
        el('p', { class: 'auth-tagline' }, [
            'A private journal for the work between bouts — yours, theirs, and what was learned.'
        ]),
        !isConfigured()
            ? el('div', { class: 'card', style: { marginTop: '24px' } }, [
                el('div', { class: 'label' }, ['Setup needed']),
                el('p', { style: { marginTop: '8px' } }, [
                    'Edit ',
                    el('code', {}, ['js/lib/config.js']),
                    ' with your Supabase project URL and anon key. See the README.'
                ])
            ])
            : null,
        el('div', { class: 'auth-form' }, [
            el('div', { class: 'label-row' }, [
                el('span', { class: 'label' }, ['Sign in by email'])
            ]),
            el('div', { class: 'field' }, [
                el('label', { class: 'field-label' }, ['Email']),
                el('input', {
                    type: 'email',
                    id: 'magic-email',
                    class: 'field-input',
                    placeholder: 'you@studio',
                    autocomplete: 'email',
                    autocapitalize: 'off',
                    spellcheck: 'false'
                })
            ]),
            el('button', {
                class: 'btn btn-primary btn-block btn-mono-label',
                style: { marginTop: '20px' },
                onclick: async (e) => {
                    const v = document.getElementById('magic-email').value.trim();
                    if (!v) return;
                    const btn = e.currentTarget;
                    const orig = btn.textContent;
                    btn.disabled = true;
                    btn.textContent = 'Sending…';
                    try {
                        await signInWithMagicLink(v);
                        btn.textContent = 'Check your inbox';
                        const sent = el('p', { class: 'auth-tagline', style: { marginTop: '14px', textAlign: 'center' } }, [
                            'Check ', el('em', {}, [v]), ' for a link. It opens the studio.'
                        ]);
                        btn.parentElement.appendChild(sent);
                    } catch (err) {
                        btn.textContent = orig;
                        btn.disabled = false;
                        alert('Magic link failed: ' + err.message);
                    }
                }
            }, ['Send magic link']),
            el('div', { class: 'auth-divider' }, ['or']),
            el('button', {
                class: 'btn btn-ghost btn-block',
                disabled: !isConfigured(),
                onclick: async () => {
                    try { await signInWithGoogle(); }
                    catch (e) { alert('Sign-in failed: ' + e.message); }
                }
            }, ['Continue with Google']),
            el('div', { class: 'auth-foot' }, [
                'Three profiles · one studio · private by default'
            ])
        ])
    ]);
    root.appendChild(wrap);
}

export async function refreshTournamentCountdown() {
    const node = document.getElementById('tournament-countdown');
    if (!node) return;
    try {
        const t = await nextTournament();
        if (!t) { node.innerHTML = ''; return; }
        const d = daysUntil(t.start_date);
        if (d < 0) { node.innerHTML = ''; return; }
        node.innerHTML = '';
        const isTaper = d >= 0 && d <= 5;
        node.className = 'countdown' + (isTaper ? ' taper' : '');
        node.appendChild(el('span', { class: 'label' }, [t.name.length > 18 ? t.name.slice(0, 16) + '…' : t.name, ' · ']));
        node.appendChild(el('span', { class: 'num' }, [d === 0 ? 'today' : `${d}d`]));
    } catch (e) {
        node.innerHTML = '';
    }
}
