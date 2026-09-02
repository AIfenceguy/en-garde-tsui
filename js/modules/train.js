// Train — what to work on, and exactly how to work on it.
//
// The rest of the app records what a coach covered. This screen answers the
// question that actually keeps someone subscribed: given everything logged,
// what is the one thing to fix this week, and what do I do about it tonight?
//
// Diagnosis comes from skill_progress, which lifts every mastery rating out of
// private_lessons.topics and turns it into a trajectory. Prescription comes
// from skill_drills, keyed to the same slugs — a solo version for a fencer
// alone at home and a partner version for club night, because those are the
// two situations people actually train in.

import { el, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';

const INK = 'var(--ink, #1A1D24)';
// Literal, not var(--ink-mute): that token composites to ~3.1:1 on white.
const INK_MUTE = '#6B7280';
const GOOD = '#1f7a1f';
const WARN = '#B45309';
const BAD = '#9b2230';

// Worst first. A skill that has gone backwards outranks one that is merely
// stuck, which outranks one that was never good.
const STATUS = {
    declining: { rank: 1, label: 'Going backwards', color: BAD,
                 blurb: 'Rated lower now than when it was first logged.' },
    stuck:     { rank: 2, label: 'Not moving',      color: WARN,
                 blurb: 'Same rating across separate lessons.' },
    weak:      { rank: 3, label: 'Weakest',         color: WARN,
                 blurb: 'Rated 6 or below.' },
    stale:     { rank: 4, label: 'Not touched',     color: INK_MUTE,
                 blurb: 'No lesson has covered this in over two weeks.' },
    steady:    { rank: 5, label: 'Holding',         color: INK_MUTE, blurb: '' },
    improving: { rank: 6, label: 'Improving',       color: GOOD, blurb: '' },
    strong:    { rank: 7, label: 'Strong',          color: GOOD, blurb: '' }
};

const pretty = (slug) => String(slug || '')
    .split('-')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

export async function mountTrain(root) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));
        return;
    }

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Train']),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    const body = el('div', {});
    root.appendChild(body);
    body.appendChild(el('div', { class: 'empty' }, ['Reading your lessons…']));

    const [progRes, drillRes, doneRes] = await Promise.all([
        supa.from('skill_progress').select('*').eq('profile_id', profile.id),
        supa.from('skill_drills').select('*').order('sort_order'),
        supa.from('drill_sessions').select('drill_slug, created_at').eq('profile_id', profile.id)
    ]);

    const progress = progRes.data || [];
    body.innerHTML = '';

    if (!progress.length) {
        body.appendChild(el('div', { class: 'empty' }, [
            'Nothing to work from yet. Log a private lesson with topic ratings and this fills in.'
        ]));
        return;
    }

    const drillsBySkill = new Map();
    for (const d of (drillRes.data || [])) {
        if (!drillsBySkill.has(d.skill_slug)) drillsBySkill.set(d.skill_slug, []);
        drillsBySkill.get(d.skill_slug).push(d);
    }
    // Case-insensitive by default: slugs have arrived in mixed case before.
    const doneCount = new Map();
    for (const s of (doneRes.data || [])) {
        const k = String(s.drill_slug || '').toLowerCase();
        doneCount.set(k, (doneCount.get(k) || 0) + 1);
    }

    const ranked = progress.slice().sort((a, b) => {
        const ra = STATUS[a.status]?.rank ?? 9;
        const rb = STATUS[b.status]?.rank ?? 9;
        if (ra !== rb) return ra - rb;
        return Number(a.latest) - Number(b.latest);
    });

    // --- The one thing --------------------------------------------------
    // A list of eleven skills is a list nobody acts on. Name the single
    // priority first, in a sentence, with the evidence behind it.
    const top = ranked[0];
    if (top && STATUS[top.status]?.rank <= 3) {
        const meta = STATUS[top.status];
        const why = top.status === 'declining'
            ? `It was ${top.first_rated}/10 when you first logged it and it is ${top.latest}/10 now.`
            : top.status === 'stuck'
                ? `Rated ${top.latest}/10 across ${top.times_rated} separate lessons — the number has not moved.`
                : `Your lowest rating at ${top.latest}/10.`;
        const stale = Number(top.days_since) > 7
            ? ` No lesson has covered it in ${top.days_since} days.`
            : '';
        body.appendChild(el('div', {
            style: {
                border: `2px solid ${meta.color}`, borderRadius: '10px',
                padding: '14px 16px', marginBottom: '18px'
            }
        }, [
            el('div', { class: 'kicker', style: { color: meta.color } }, ['Work on this first']),
            el('div', { style: { color: INK, fontSize: '22px', fontWeight: '700', margin: '4px 0 6px' } }, [
                pretty(top.skill_slug)
            ]),
            el('div', { style: { color: INK, fontSize: '14px', lineHeight: '1.6' } }, [why + stale]),
            el('div', { style: { color: INK_MUTE, fontSize: '13px', marginTop: '8px' } }, [
                `Last covered by ${top.last_coach || 'a coach'} on ${String(top.last_seen).slice(0, 10)}.`
            ])
        ]));
    }

    // --- Every skill, worst first ---------------------------------------
    for (const s of ranked) {
        const meta = STATUS[s.status] || STATUS.steady;
        const drills = drillsBySkill.get(s.skill_slug) || [];
        const open = STATUS[s.status]?.rank <= 3;

        const detail = el('div', { style: { display: open ? 'block' : 'none', paddingBottom: '6px' } });

        const arrow = Number(s.change) > 0 ? `+${s.change}` : String(s.change ?? 0);
        const head = el('button', {
            type: 'button',
            style: {
                display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap',
                width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)',
                padding: '10px 0', cursor: 'pointer'
            },
            onclick: () => { detail.style.display = detail.style.display === 'none' ? 'block' : 'none'; }
        }, [
            el('span', { style: { color: INK, fontSize: '15px', fontWeight: '600', minWidth: '150px' } }, [pretty(s.skill_slug)]),
            el('span', { style: { color: INK, fontFamily: 'var(--mono)', fontWeight: '700' } }, [`${s.latest}/10`]),
            Number(s.change) !== 0
                ? el('span', {
                    style: { color: Number(s.change) > 0 ? GOOD : BAD, fontSize: '12px', fontFamily: 'var(--mono)' }
                  }, [arrow])
                : null,
            el('span', { style: { color: meta.color, fontSize: '12px', fontWeight: '600' } }, [meta.label]),
            el('span', { style: { color: INK_MUTE, fontSize: '12px' } }, [
                `${s.times_rated}× · ${s.days_since}d ago`
            ])
        ]);

        if (meta.blurb) {
            detail.appendChild(el('div', { style: { color: INK_MUTE, fontSize: '13px', margin: '0 0 8px' } }, [meta.blurb]));
        }

        if (!drills.length) {
            detail.appendChild(el('div', { style: { color: INK_MUTE, fontSize: '13px' } }, [
                'No drill written for this one yet.'
            ]));
        }

        for (const d of drills) {
            const times = doneCount.get(String(d.title).toLowerCase()) || 0;
            detail.appendChild(el('div', {
                style: {
                    background: 'rgba(0,0,0,0.03)', borderRadius: '8px',
                    padding: '12px 14px', marginBottom: '8px'
                }
            }, [
                el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } }, [
                    el('span', {
                        style: {
                            fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: '700',
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            color: d.mode === 'solo' ? GOOD : 'var(--accent)'
                        }
                    }, [d.mode === 'solo' ? 'On your own' : 'With a partner']),
                    el('span', { style: { color: INK_MUTE, fontSize: '11px' } }, [d.level]),
                    times ? el('span', { style: { color: GOOD, fontSize: '11px' } }, [`done ${times}×`]) : null
                ]),
                el('div', { style: { color: INK, fontSize: '15px', fontWeight: '600', margin: '4px 0 6px' } }, [d.title]),
                row('Set up', d.setup),
                row('Do', d.execution),
                row('Cue', d.cue, GOOD),
                row('Avoid', d.common_fault, BAD),
                row('Passed when', d.success_test),
                d.suggested_reps
                    ? el('div', { style: { color: INK_MUTE, fontSize: '12px', marginTop: '6px', fontFamily: 'var(--mono)' } }, [d.suggested_reps])
                    : null,
                el('button', {
                    class: 'btn',
                    style: { marginTop: '10px', fontSize: '13px' },
                    onclick: async (e) => {
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        const { error } = await supa.from('drill_sessions').insert({
                            profile_id: profile.id,
                            // The drill's own title is the key. drill_slug used to
                            // point at drill_library, which is conditioning only.
                            drill_slug: d.title,
                            weakness_slug: d.skill_slug,
                            note: `${d.mode} · ${d.suggested_reps || ''}`.trim()
                        });
                        if (error) { toast('Could not log: ' + error.message, 'error'); btn.disabled = false; return; }
                        toast('Logged');
                        btn.textContent = 'Logged today';
                    }
                }, ['I did this'])
            ]));
        }

        body.appendChild(head);
        body.appendChild(detail);
    }

    // Honest about the limit of what it knows.
    body.appendChild(el('div', {
        style: { color: INK_MUTE, fontSize: '12px', marginTop: '18px', lineHeight: '1.6' }
    }, [
        'These ratings come from private lessons — how a skill felt with a coach, not how it held up in a bout. ',
        'Log bouts and this can start telling you which skills survive real pressure.'
    ]));
}

function row(label, text, color) {
    if (!text) return null;
    return el('div', { style: { display: 'flex', gap: '8px', marginTop: '3px' } }, [
        el('span', {
            style: {
                color: INK_MUTE, fontSize: '11px', fontFamily: 'var(--mono)',
                textTransform: 'uppercase', minWidth: '86px', flexShrink: '0', paddingTop: '2px'
            }
        }, [label]),
        el('span', { style: { color: color || INK, fontSize: '13px', lineHeight: '1.55' } }, [text])
    ]);
}
