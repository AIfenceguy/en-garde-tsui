// Module 3.8 — Style model.
// "Copy Ryan Choi" is not trainable on its own, so the model's game is broken
// into concrete traits the fencer rates themselves on. Ratings are kept over
// time, which turns a vague ambition into a visible trend.

import { el, fmtDate, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import { safeWrite } from '../lib/offline.js';

const INK = 'var(--ink, #1A1D24)';
// Literal, not var(--ink-mute): that token composites to ~3.1:1 on white.
const INK_MUTE = '#6B7280';
const ACCENT = 'var(--accent, #a82b2b)';

export async function mountStyle(root) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));
        return;
    }

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Style model']),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    if (!profile.style_model) {
        root.appendChild(el('div', { class: 'empty' }, [
            'No style model set for this profile yet.'
        ]));
        return;
    }

    const model = profile.style_model;

    // Header: who they are copying and why.
    root.appendChild(el('div', {
        class: 'card',
        style: { borderLeft: `3px solid ${ACCENT}` }
    }, [
        el('div', { class: 'kicker', style: { color: INK_MUTE } }, ['Copying']),
        el('div', { style: { color: INK, fontSize: '20px', fontWeight: '600', marginTop: '2px' } }, [model]),
        profile.style_model_note
            ? el('p', { style: { color: INK_MUTE, fontSize: '13px', lineHeight: '1.5', margin: '8px 0 0' } }, [profile.style_model_note])
            : null,
        el('a', {
            href: `https://www.youtube.com/results?search_query=${encodeURIComponent(model + ' fencing foil')}`,
            target: '_blank', rel: 'noopener',
            style: {
                display: 'inline-block', marginTop: '10px', color: ACCENT,
                fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px', fontWeight: '700',
                letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none'
            }
        }, [`watch ${model} →`])
    ]));

    const [traitsRes, checkinsRes] = await Promise.all([
        supa.from('style_traits').select('*').eq('model_name', model).order('sort_order'),
        supa.from('style_checkins').select('*').eq('profile_id', profile.id).order('created_at', { ascending: true })
    ]);

    if (traitsRes.error) {
        root.appendChild(el('div', { class: 'card' }, [
            el('p', { style: { color: 'var(--danger, #9b2230)' } }, ['Could not load traits: ' + traitsRes.error.message])
        ]));
        return;
    }

    const traits = traitsRes.data || [];
    const checkins = checkinsRes.data || [];

    // trait_slug -> chronological ratings
    const history = new Map();
    for (const c of checkins) {
        if (!history.has(c.trait_slug)) history.set(c.trait_slug, []);
        history.get(c.trait_slug).push(c);
    }

    // Overall: mean of the latest rating for each trait.
    const latest = traits
        .map((t) => (history.get(t.slug) || []).slice(-1)[0])
        .filter(Boolean);
    const first = traits
        .map((t) => (history.get(t.slug) || [])[0])
        .filter(Boolean);

    if (latest.length) {
        const now = latest.reduce((s, c) => s + c.rating_1_10, 0) / latest.length;
        const then = first.reduce((s, c) => s + c.rating_1_10, 0) / first.length;
        const delta = now - then;
        root.appendChild(el('div', { class: 'card', style: { marginTop: '12px' } }, [
            el('div', { class: 'kicker', style: { color: INK_MUTE } }, [`How much you fence like ${model}`]),
            el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '4px' } }, [
                el('span', { style: { color: INK, fontSize: '32px', fontWeight: '700', fontFamily: 'var(--mono)' } }, [now.toFixed(1)]),
                el('span', { style: { color: INK_MUTE, fontSize: '14px' } }, ['/ 10']),
                delta !== 0
                    ? el('span', {
                        style: {
                            color: delta > 0 ? '#1f7a1f' : '#9b2230',
                            fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: '700'
                        }
                    }, [`${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} since you started`])
                    : null
            ]),
            el('div', { style: { color: INK_MUTE, fontSize: '12px', marginTop: '4px' } }, [
                `${checkins.length} check-in${checkins.length === 1 ? '' : 's'} logged`
            ])
        ]));
    }

    root.appendChild(el('div', { class: 'label-row', style: { marginTop: '20px' } }, [
        el('span', { class: 'label', style: { color: INK } }, ['Their signature traits']),
        el('span', { class: 'label', style: { color: INK_MUTE } }, ['RATE YOURSELF'])
    ]));

    root.appendChild(el('p', { style: { color: INK_MUTE, fontSize: '13px', margin: '0 0 12px' } }, [
        '1 = not like them at all. 10 = that is exactly their game. Be honest — the trend is the point, not the number.'
    ]));

    // Track the sliders so one Save writes every trait at once.
    const pending = new Map();

    for (const t of traits) {
        const hist = history.get(t.slug) || [];
        const current = hist.length ? hist[hist.length - 1].rating_1_10 : 5;
        const startVal = hist.length ? hist[0].rating_1_10 : null;
        pending.set(t.slug, current);

        const valOut = el('span', { class: 'scale-value', style: { color: INK } }, [String(current)]);
        const slider = el('input', {
            type: 'range', min: 1, max: 10, step: 1, value: current,
            oninput: (e) => {
                valOut.textContent = e.target.value;
                pending.set(t.slug, Number(e.target.value));
            }
        });

        const trendBits = [];
        if (hist.length > 1) {
            const d = current - startVal;
            trendBits.push(el('span', {
                style: {
                    fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: '700',
                    color: d > 0 ? '#1f7a1f' : (d < 0 ? '#9b2230' : INK_MUTE)
                }
            }, [d > 0 ? `▲ +${d}` : (d < 0 ? `▼ ${d}` : '— no change')]));
            trendBits.push(el('span', { style: { color: INK_MUTE, fontSize: '11px' } }, [
                ` from ${startVal} on ${fmtDate(hist[0].checked_at)}`
            ]));
        } else if (hist.length === 1) {
            trendBits.push(el('span', { style: { color: INK_MUTE, fontSize: '11px' } }, [
                `first rated ${fmtDate(hist[0].checked_at)}`
            ]));
        } else {
            trendBits.push(el('span', { style: { color: INK_MUTE, fontSize: '11px' } }, ['not rated yet']));
        }

        // "How to train it" is collapsed so the page stays scannable.
        const trainBody = el('p', {
            style: {
                display: 'none', margin: '6px 0 0', padding: '10px 12px',
                background: 'rgba(0,0,0,0.03)', borderRadius: '8px',
                color: INK, fontSize: '13px', lineHeight: '1.5'
            }
        }, [t.how_to_train || '']);
        const chev = el('span', {
            style: { display: 'inline-block', transition: 'transform 0.15s ease', marginRight: '6px', fontSize: '10px', color: INK_MUTE }
        }, ['▶']);

        root.appendChild(el('div', { class: 'card', style: { marginBottom: '10px' } }, [
            el('div', { style: { color: INK, fontSize: '16px', fontWeight: '600' } }, [t.label]),
            t.description
                ? el('p', { style: { color: INK_MUTE, fontSize: '13px', lineHeight: '1.5', margin: '4px 0 0' } }, [t.description])
                : null,
            el('div', { class: 'scale', style: { marginTop: '10px' } }, [slider, valOut]),
            el('div', { style: { marginTop: '2px' } }, trendBits),
            t.how_to_train ? el('button', {
                type: 'button',
                style: {
                    background: 'transparent', border: 'none', padding: '6px 0', cursor: 'pointer',
                    fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px', fontWeight: '700',
                    letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_MUTE,
                    display: 'inline-flex', alignItems: 'center'
                },
                onclick: () => {
                    const open = trainBody.style.display !== 'none';
                    trainBody.style.display = open ? 'none' : 'block';
                    chev.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
                }
            }, [chev, 'How to train it']) : null,
            trainBody
        ]));
    }

    const noteInput = el('textarea', {
        rows: 2,
        placeholder: 'what changed since last time? (optional)',
        style: { color: INK, width: '100%' }
    }, []);
    root.appendChild(el('div', { class: 'field', style: { marginTop: '4px' } }, [
        el('label', { style: { color: INK_MUTE } }, ['Note for this check-in']),
        noteInput
    ]));

    root.appendChild(el('div', { style: { padding: '8px 0 24px' } }, [
        el('button', {
            class: 'btn btn-primary btn-mono-label',
            style: { width: '100%' },
            onclick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = 'Saving…';
                try {
                    const note = noteInput.value.trim() || null;
                    const rows = traits.map((t) => ({
                        profile_id: profile.id,
                        trait_slug: t.slug,
                        model_name: model,
                        rating_1_10: pending.get(t.slug),
                        note
                    }));
                    await safeWrite({ table: 'style_checkins', op: 'insert', payload: rows });
                    toast('Check-in saved');
                    root.innerHTML = '';
                    await mountStyle(root);
                } catch (err) {
                    btn.disabled = false;
                    btn.textContent = 'Save today\'s check-in';
                    toast('Save failed: ' + err.message, 'error');
                }
            }
        }, ['Save today\'s check-in'])
    ]));

    // Past check-ins, most recent first.
    const byDate = new Map();
    for (const c of checkins) {
        if (!byDate.has(c.checked_at)) byDate.set(c.checked_at, []);
        byDate.get(c.checked_at).push(c);
    }
    if (byDate.size) {
        root.appendChild(el('div', { class: 'label-row', style: { marginTop: '18px' } }, [
            el('span', { class: 'label', style: { color: INK } }, ['Past check-ins'])
        ]));
        const dates = Array.from(byDate.keys()).sort().reverse();
        for (const d of dates) {
            const rows = byDate.get(d);
            const avg = rows.reduce((s, r) => s + r.rating_1_10, 0) / rows.length;
            root.appendChild(el('div', { class: 'card', style: { marginBottom: '8px' } }, [
                el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, [
                    el('span', { style: { color: INK, fontWeight: '600' } }, [fmtDate(d)]),
                    el('span', { style: { color: INK_MUTE, fontFamily: 'var(--mono)', fontSize: '13px' } }, [`avg ${avg.toFixed(1)}`])
                ]),
                rows[0].note
                    ? el('p', { style: { color: INK_MUTE, fontSize: '13px', margin: '6px 0 0', lineHeight: '1.5' } }, [rows[0].note])
                    : null
            ]));
        }
    }
}
