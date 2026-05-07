// Module 3.3 — Free Fence (bouts).
// List, entry form, detail view.

import { el, clear, todayISO, fmtDate, fmtDateLong, toast } from '../lib/util.js';
import { go } from '../lib/router.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import { listBouts, getBout, listOpponents, findOrCreateOpponent, loadTaxonomies } from '../lib/db.js';
import { chipGroup, tacticTally } from '../lib/chips.js';
import { safeWrite } from '../lib/offline.js';

const CONTEXT_OPTIONS = [
    { value: 'club_open', label: 'Club open fencing' },
    { value: 'tournament_prep', label: 'Tournament prep' },
    { value: 'pool', label: 'Tournament pool' },
    { value: 'de', label: 'Tournament DE' },
    { value: 'other', label: 'Other' }
];

// =====================================================
// LIST
// =====================================================
export async function mountBoutsList(root) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, ['Pick a profile to log bouts.']));

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Free Fence']),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    root.appendChild(el('div', { class: 'btn-row', style: { marginBottom: '16px' } }, [
        el('a', { href: '#bouts/new', class: 'btn' }, ['+ Log a bout'])
    ]));

    const list = el('div', {});
    root.appendChild(list);

    let bouts = [];
    try {
        bouts = await listBouts({ limit: 50 });
    } catch (e) {
        list.appendChild(el('div', { class: 'card', style: { color: 'var(--danger)' } }, [`Failed to load bouts: ${e.message}`]));
        return;
    }

    if (!bouts.length) {
        list.appendChild(el('div', { class: 'empty' }, ['No bouts logged yet. Tap “Log a bout” after your next sparring session.']));
        return;
    }

    for (const b of bouts) {
        const cls = 'bout-row ' + (b.outcome || '');
        list.appendChild(el('a', {
            href: `#bouts/show?id=${b.id}`,
            class: cls,
            style: { textDecoration: 'none' }
        }, [
            el('div', { class: 'bout-date' }, [fmtDate(b.date)]),
            el('div', {}, [
                el('div', { class: 'bout-opponent' }, [b.opponent_name || '—']),
                el('div', { class: 'bout-context' }, [
                    (CONTEXT_OPTIONS.find((c) => c.value === b.context)?.label || b.context || ''),
                    b.location ? ` · ${b.location}` : ''
                ])
            ]),
            el('div', { class: 'bout-score' }, [
                el('span', { class: 'you' }, [String(b.my_score ?? '–')]),
                ' – ',
                String(b.their_score ?? '–')
            ])
        ]));
    }
}

// =====================================================
// ENTRY (new + edit)
// =====================================================
export async function mountBoutEntry(root, params) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, ['Pick a profile first.']));

    const editing = params.id ? await getBout(params.id) : null;
    const taxos = await loadTaxonomies();
    const opponents = await listOpponents();

    const scoringOpts = taxos.tactics.filter((t) => t.kind === 'scoring');
    const failureOpts = taxos.tactics.filter((t) => t.kind === 'failure');

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, [editing ? 'Edit bout' : 'Log a bout']),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    const form = el('form', { class: 'card', onsubmit: async (e) => { e.preventDefault(); await save(); } });
    root.appendChild(form);

    // date + context
    form.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [
            el('label', {}, ['Date']),
            el('input', { type: 'date', name: 'date', value: editing?.date || todayISO(), required: true })
        ]),
        el('div', { class: 'field' }, [
            el('label', {}, ['Context']),
            (() => {
                const sel = el('select', { name: 'context' }, CONTEXT_OPTIONS.map((c) =>
                    el('option', { value: c.value, selected: editing?.context === c.value }, [c.label])
                ));
                return sel;
            })()
        ])
    ]));

    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['Location']),
        el('input', { type: 'text', name: 'location', value: editing?.location || '', placeholder: 'club / venue' })
    ]));

    // opponent autocomplete
    const oppList = el('datalist', { id: 'opp-suggest' }, opponents.map((o) => el('option', { value: o.name }, [])));
    form.appendChild(oppList);
    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['Opponent']),
        el('input', {
            type: 'text', name: 'opponent_name', list: 'opp-suggest',
            value: editing?.opponent_name || '',
            placeholder: 'name', required: true, autocomplete: 'off'
        })
    ]));
    form.appendChild(el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [
            el('label', {}, ['Opponent rating']),
            el('input', { type: 'text', name: 'opponent_rating', value: editing?.opponent_rating || '', placeholder: 'U / E / D / C / B / A' })
        ]),
        el('div', { class: 'field' }, [
            el('label', {}, ['Opponent club']),
            el('input', { type: 'text', name: 'opponent_club', value: editing?.opponent_club || '' })
        ])
    ]));

    // score
    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['Score']),
        el('div', { class: 'score-input' }, [
            el('input', { type: 'number', name: 'my_score', min: 0, max: 30, value: editing?.my_score ?? '', placeholder: 'me', inputmode: 'numeric' }),
            el('span', { class: 'vs' }, ['—']),
            el('input', { type: 'number', name: 'their_score', min: 0, max: 30, value: editing?.their_score ?? '', placeholder: 'them', inputmode: 'numeric' })
        ])
    ]));

    // scoring tactics tally
    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['How I scored — tally per tactic']),
        el('p', { class: 'kicker', style: { marginBottom: '8px' } }, ['+ marks each touch attempted; ✓ marks the ones that landed.'])
    ]));
    const scoringWidget = tacticTally({ options: scoringOpts.map((t) => ({ slug: t.slug, label: t.label })), values: editing?.scoring_actions || [] });
    form.appendChild(scoringWidget);

    // failure patterns
    form.appendChild(el('div', { class: 'field', style: { marginTop: '20px' } }, [
        el('label', {}, ['How they scored on me'])
    ]));
    const failureWidget = chipGroup({
        options: failureOpts.map((t) => ({ slug: t.slug, label: t.label, kind: 'failure' })),
        selected: new Set(editing?.failure_patterns || []),
        allowAdd: true,
        onAdd: async ({ slug, label }) => {
            const { data, error } = await supa.from('tactic_taxonomy').insert({ slug, label, kind: 'failure' }).select().single();
            if (error) { toast('Could not add: ' + error.message, 'error'); return null; }
            return { slug: data.slug, label: data.label, kind: 'failure' };
        }
    });
    form.appendChild(failureWidget);

    // reflection + coach feedback
    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['One-line reflection']),
        el('input', { type: 'text', name: 'reflection', value: editing?.reflection || '', placeholder: 'one sentence — what I noticed' })
    ]));
    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['Coach feedback (if any)']),
        el('textarea', { name: 'coach_feedback' }, [editing?.coach_feedback || ''])
    ]));

    // submit
    form.appendChild(el('div', { class: 'btn-row right' }, [
        el('a', { href: '#bouts', class: 'btn btn-ghost' }, ['Cancel']),
        el('button', { type: 'submit', class: 'btn' }, [editing ? 'Save changes' : 'Save bout'])
    ]));

    async function save() {
        const fd = new FormData(form);
        const my = Number(fd.get('my_score'));
        const their = Number(fd.get('their_score'));
        const outcome = my === their ? 'draw' : (my > their ? 'win' : 'loss');

        const opName = (fd.get('opponent_name') || '').toString().trim();
        if (!opName) { toast('Opponent is required', 'error'); return; }

        let opponent = null;
        try {
            opponent = await findOrCreateOpponent({
                name: opName,
                club: (fd.get('opponent_club') || '').toString().trim() || null,
                rating: (fd.get('opponent_rating') || '').toString().trim() || null
            });
        } catch (e) {
            console.warn('opponent lookup failed', e);
        }

        const payload = {
            profile_id: profile.id,
            date: fd.get('date'),
            location: (fd.get('location') || '').toString().trim() || null,
            context: fd.get('context') || null,
            opponent_id: opponent?.id || null,
            opponent_name: opName,
            opponent_rating: (fd.get('opponent_rating') || '').toString().trim() || null,
            opponent_club: (fd.get('opponent_club') || '').toString().trim() || null,
            my_score: isNaN(my) ? null : my,
            their_score: isNaN(their) ? null : their,
            outcome,
            scoring_actions: scoringWidget.getValues(),
            failure_patterns: failureWidget.getValues(),
            reflection: (fd.get('reflection') || '').toString().trim() || null,
            coach_feedback: (fd.get('coach_feedback') || '').toString().trim() || null
        };

        try {
            if (editing) {
                await safeWrite({ table: 'bouts', op: 'update', payload, match: { id: editing.id } });
                toast('Bout updated');
            } else {
                await safeWrite({ table: 'bouts', op: 'insert', payload });
                toast('Bout logged' + (navigator.onLine ? '' : ' (offline — will sync)'));
            }
            go('bouts');
        } catch (e) {
            toast('Save failed: ' + e.message, 'error');
        }
    }
}

// =====================================================
// DETAIL
// =====================================================
export async function mountBoutDetail(root, params) {
    if (!params.id) return go('bouts');
    let b;
    try { b = await getBout(params.id); }
    catch (e) {
        root.appendChild(el('div', { class: 'card', style: { color: 'var(--danger)' } }, ['Bout not found.']));
        return;
    }

    const taxos = await loadTaxonomies();

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, [b.opponent_name || 'Bout']),
        el('span', { class: 'meta' }, [fmtDateLong(b.date)])
    ]));

    root.appendChild(el('div', {
        class: `card bordered-accent`
    }, [
        el('div', { class: 'card-head' }, [
            el('h3', {}, [
                el('span', { style: { color: outcomeColor(b.outcome) } }, [String(b.my_score ?? '?')]),
                ' – ',
                String(b.their_score ?? '?')
            ]),
            el('span', { class: 'card-meta' }, [
                (CONTEXT_OPTIONS.find((c) => c.value === b.context)?.label || b.context || ''),
                b.location ? ' · ' + b.location : ''
            ])
        ]),
        el('p', { class: 'kicker' }, ['scoring tally']),
        b.scoring_actions?.length
            ? el('div', { class: 'chips' }, b.scoring_actions.map((a) =>
                el('span', { class: 'chip tally' }, [
                    taxos.tacticBySlug.get(a.tactic_slug)?.label || a.tactic_slug,
                    el('span', { class: 'count' }, [`${a.successes}/${a.attempts}`])
                ])
            ))
            : el('p', { class: 'dim italic' }, ['no tactics tallied']),

        el('p', { class: 'kicker', style: { marginTop: '14px' } }, ['how they scored']),
        b.failure_patterns?.length
            ? el('div', { class: 'chips' }, b.failure_patterns.map((s) =>
                el('span', { class: 'chip failure on' }, [taxos.tacticBySlug.get(s)?.label || s])
            ))
            : el('p', { class: 'dim italic' }, ['nothing logged']),

        b.reflection
            ? [el('p', { class: 'kicker', style: { marginTop: '14px' } }, ['reflection']),
               el('p', {}, [b.reflection])]
            : null,
        b.coach_feedback
            ? [el('p', { class: 'kicker', style: { marginTop: '14px' } }, ['coach said']),
               el('blockquote', { style: { borderLeft: '2px solid var(--accent)', margin: '0', paddingLeft: '12px', fontStyle: 'italic' } }, [b.coach_feedback])]
            : null
    ]));

    root.appendChild(el('div', { class: 'btn-row' }, [
        el('a', { href: `#bouts/edit?id=${b.id}`, class: 'btn btn-ghost' }, ['Edit']),
        b.opponent_id ? el('a', { href: `#opponents/show?id=${b.opponent_id}`, class: 'btn btn-ghost' }, ['Open scout card']) : null,
        el('button', {
            class: 'btn btn-danger',
            onclick: async () => {
                if (!confirm('Delete this bout?')) return;
                await safeWrite({ table: 'bouts', op: 'delete', payload: {}, match: { id: b.id } });
                toast('Deleted');
                go('bouts');
            }
        }, ['Delete'])
    ]));
}

function outcomeColor(o) {
    if (o === 'win') return 'var(--success)';
    if (o === 'loss') return 'var(--danger)';
    if (o === 'draw') return 'var(--warn)';
    return 'var(--cream)';
}
