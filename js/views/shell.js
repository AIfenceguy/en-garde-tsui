// Sign-in view (shown when no session) and the topbar countdown updater.

import { el } from '../lib/util.js';
import { signInWithGoogle, signInWithMagicLink } from '../lib/auth.js';
import { isConfigured } from '../lib/supa.js';
import { nextTournament } from '../lib/db.js';
import { daysUntil, fmtDate } from '../lib/util.js';

export function renderSignIn(root) {
    root.innerHTML = '';
    const wrap = el('div', { class: 'sign-in' }, [
        el('h1', {}, ['Atelier Tsui']),
        el('p', { class: 'kicker' }, ['training journal · foil · 2026']),
        el('p', {}, ['Sign in to log lessons, bouts, and prep.']),
        !isConfigured()
            ? el('div', { class: 'nudge', style: { textAlign: 'left' } }, [
                el('div', { class: 'nudge-head' }, ['Setup needed']),
                'Edit ',
                el('code', {}, ['js/lib/config.js']),
                ' with your Supabase project URL and anon key. See the README.'
            ])
            : null,
        el('button', {
            class: 'btn',
            disabled: !isConfigured(),
            onclick: async () => {
                try { await signInWithGoogle(); }
                catch (e) { alert('Sign-in failed: ' + e.message); }
            }
        }, ['Continue with Google']),
        el('details', { style: { marginTop: '20px', textAlign: 'left' } }, [
            el('summary', { class: 'btn-link', style: { cursor: 'pointer' } }, ['Trouble signing in?']),
            el('div', { class: 'field', style: { marginTop: '12px' } }, [
                el('label', {}, ['Magic link to email']),
                el('input', { type: 'email', id: 'magic-email', placeholder: 'you@example.com' })
            ]),
            el('button', {
                class: 'btn btn-ghost',
                onclick: async () => {
                    const v = document.getElementById('magic-email').value.trim();
                    if (!v) return;
                    try {
                        await signInWithMagicLink(v);
                        alert('Check your email for the link.');
                    } catch (e) { alert('Magic link failed: ' + e.message); }
                }
            }, ['Send magic link'])
        ])
    ]);
    root.appendChild(wrap);
}

export async function refreshTournamentCountdown() {
    const node = document.getElementById('tournament-countdown');
    if (!node) return;
    try {
        const t = await nextTournament();
        if (!t) {
            node.innerHTML = '';
            return;
        }
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
