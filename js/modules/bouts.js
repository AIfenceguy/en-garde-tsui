// Bouts (Free Fence) — list, entry form, detail.
// Visual layer per the new design: editorial bout-card timeline,
// stripped form with field-row labels and chip-row tactics.

import { el, todayISO, fmtDate, fmtDateLong, toast } from '../lib/util.js';
import { go } from '../lib/router.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import { listBouts, getBout, listOpponents, findOrCreateOpponent, loadTaxonomies } from '../lib/db.js';
import { chipGroup, tacticTally } from '../lib/chips.js';
import { safeWrite } from '../lib/offline.js';
import { boutDebrief, listCoachNotes } from '../lib/coach.js';

const CONTEXT_OPTIONS = [
    { value: 'club_open', label: 'Club open fencing' },
    { value: 'tournament_prep', label: 'Tournament prep' },
    { value: 'pool', label: 'Tournament pool' },
    { value: 'de', label: 'Tournament DE' },
    { value: 'other', label: 'Other' }
];

// =====================================================
// LIST — editorial timeline of bout-card rows
// =====================================================
export async function mountBoutsList(root) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, [
            el('p', { class: 'empty-line' }, ['Pick a profile to log bouts.'])
        ]));
        return;
    }

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, ['Free Fence']),
        el('div', { class: 'today-sub' }, [
            el('span', {}, [profile.name.toUpperCase()])
        ])
    ]));

    root.appendChild(el('div', { style: { padding: '0 var(--gut) 18px' } }, [
        el('a', { href: '#bouts/new', class: 'btn btn-primary btn-mono-label' }, ['+ Log a bout'])
    ]));

    let bouts = [];
    try {
        bouts = await listBouts({ limit: 50 });
    } catch (e) {
        root.appendChild(el('div', { class: 'card', style: { color: 'var(--loss)', margin: '0 var(--gut)' } }, [`Failed to load bouts: ${e.message}`]));
        return;
    }

    if (!bouts.length) {
        root.appendChild(el('div', { class: 'empty' }, [
            el('p', { class: 'empty-line' }, ['No bouts logged yet. The journal opens with the first one.']),
            el('a', { href: '#bouts/new', class: 'btn btn-primary btn-mono-label empty-cta' }, ['Log a bout'])
        ]));
        return;
    }

    for (const b of bouts) {
        root.appendChild(boutCard(b));
    }
}

// Render a single bout as the editorial card with sparkline + quote
function boutCard(b) {
    const my = b.my_score ?? 0;
    const their = b.their_score ?? 0;
    const isWin = b.outcome === 'win';
    const isLoss = b.outcome === 'loss';

    const total = my + their;
    const ticks = [];
    for (let i = 0; i < total; i++) {
        ticks.push(el('span', { class: i < my ? 'touch-tick is-scored' : 'touch-tick' }));
    }
    const acts = Array.isArray(b.scoring_actions) ? b.scoring_actions : [];
    const lastAct = acts.length ? acts[acts.length - 1] : null;
    if (lastAct && /flick/i.test(lastAct.tactic_slug || '') && my > 0 && ticks[my - 1]) {
        ticks[my - 1] = el('span', { class: 'touch-tick is-flick' });
    }

    const tags = [];
    if (b.opponent_rating) tags.push(el('span', { class: 'bout-card-opp-tag' }, [b.opponent_rating]));
    (b.opponent_archetypes || []).forEach((a) => tags.push(el('span', { class: 'bout-card-opp-tag' }, [a])));
    if (b.opponent_club) tags.push(el('span', { class: 'bout-card-opp-tag' }, [b.opponent_club]));

    const meta = [];
    meta.push(el('span', {}, [fmtDate(b.date).toUpperCase()]));
    const ctxLabel = CONTEXT_OPTIONS.find((c) => c.value === b.context)?.label;
    if (ctxLabel) meta.push(el('span', {}, [ctxLabel.toUpperCase()]));
    if (b.location) meta.push(el('span', {}, [b.location.toUpperCase()]));

    return el('a', {
        href: `#bouts/show?id=${b.id}`,
        class: 'bout-card',
        style: { textDecoration: 'none', color: 'inherit', display: 'flex' }
    }, [
        el('div', { class: 'bout-card-head' }, [
            el('div', { class: 'bout-card-opp' }, [
                el('div', { class: 'bout-card-opp-name' }, [b.opponent_name || '—']),
                tags.length ? el('div', { class: 'bout-card-opp-tags' }, tags) : null
            ]),
            el('div', { style: { textAlign: 'right' } }, [
                el('div', { class: 'scoreline', style: { justifyContent: 'flex-end' } }, [
                    el('span', { class: `scoreline-num ${isWin ? 'is-win' : (isLoss ? 'is-loss' : '')}` }, [String(my)]),
                    el('span', { class: 'scoreline-sep' }, ['—']),
                    el('span', { class: 'scoreline-num' }, [String(their)])
                ]),
                ticks.length ? el('div', { class: 'touch-strip', style: { justifyContent: 'flex-end' } }, ticks) : null
            ])
        ]),
        b.reflection ? el('div', { class: 'bout-card-quote' }, [b.reflection]) : null,
        meta.length ? el('div', { class: 'bout-card-meta' }, meta) : null
    ]);
}

// =====================================================
// ENTRY (new + edit) — editorial form
// =====================================================
export async function mountBoutEntry(root, params) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, [
            el('p', { class: 'empty-line' }, ['Pick a profile first.'])
        ]));
        return;
    }

    const editing = params.id ? await getBout(params.id) : null;
    const taxos = await loadTaxonomies();
    const opponents = await listOpponents();

    const scoringOpts = taxos.tactics.filter((t) => t.kind === 'scoring');
    const failureOpts = taxos.tactics.filter((t) => t.kind === 'failure');

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, [editing ? 'Edit bout' : 'Log a bout']),
        el('div', { class: 'today-sub' }, [
            el('span', {}, [profile.name.toUpperCase()])
        ])
    ]));

    const form = el('form', {
        onsubmit: async (e) => { e.preventDefault(); await save(); },
        style: { padding: '0 var(--gut)' }
    });
    root.appendChild(form);

    // SECTION: When / where
    form.appendChild(sectionLabel('When · where'));
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Date']),
        el('input', { type: 'date', name: 'date', class: 'field-input', value: editing?.date || todayISO(), required: true })
    ]));

    // Context — chips, not select
    const ctxField = el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Context'])
    ]);
    const ctxRow = el('div', { class: 'chip-row', style: { marginTop: '6px' } });
    let selectedCtx = editing?.context || 'club_open';
    const ctxBtns = CONTEXT_OPTIONS.map((opt) => {
        const btn = el('button', {
            type: 'button',
            class: 'chip' + (selectedCtx === opt.value ? ' is-on' : ''),
            'data-value': opt.value,
            onclick: (e) => {
                selectedCtx = opt.value;
                ctxRow.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c.getAttribute('data-value') === opt.value));
            }
        }, [opt.label]);
        return btn;
    });
    ctxBtns.forEach((b) => ctxRow.appendChild(b));
    ctxField.appendChild(ctxRow);
    form.appendChild(ctxField);

    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Location']),
        el('input', { type: 'text', name: 'location', class: 'field-input', value: editing?.location || '', placeholder: 'club / venue' })
    ]));

    // SECTION: Opponent
    form.appendChild(sectionLabel('Opponent'));
    const oppList = el('datalist', { id: 'opp-suggest' }, opponents.map((o) => el('option', { value: o.name }, [])));
    form.appendChild(oppList);
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Name']),
        el('input', {
            type: 'text', name: 'opponent_name', class: 'field-input', list: 'opp-suggest',
            value: editing?.opponent_name || '',
            placeholder: 'who you fenced',
            required: true,
            autocomplete: 'off'
        })
    ]));
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Rating']),
        el('input', { type: 'text', name: 'opponent_rating', class: 'field-input', value: editing?.opponent_rating || '', placeholder: 'U / E / D / C / B / A' })
    ]));
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Club']),
        el('input', { type: 'text', name: 'opponent_club', class: 'field-input', value: editing?.opponent_club || '', placeholder: 'home club' })
    ]));

    // SECTION: Score
    form.appendChild(sectionLabel('Score'));
    form.appendChild(el('div', { class: 'field' }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '4px 0' } }, [
            el('input', {
                type: 'number', name: 'my_score', class: 'field-input field-numeric',
                min: 0, max: 30, value: editing?.my_score ?? '', placeholder: 'me', inputmode: 'numeric',
                style: { textAlign: 'center', maxWidth: '80px' }
            }),
            el('span', { style: { color: 'var(--ink-faint)', fontFamily: 'var(--mono)', fontSize: '20px' } }, ['—']),
            el('input', {
                type: 'number', name: 'their_score', class: 'field-input field-numeric',
                min: 0, max: 30, value: editing?.their_score ?? '', placeholder: 'them', inputmode: 'numeric',
                style: { textAlign: 'center', maxWidth: '80px' }
            })
        ])
    ]));

    // SECTION: How I scored — tally per tactic
    form.appendChild(sectionLabel('How I scored'));
    form.appendChild(el('p', {
        class: 'auth-tagline',
        style: { fontSize: '13px', margin: '0 0 12px', maxWidth: 'none' }
    }, ['+ marks each touch attempted; ✓ marks the ones that landed.']));
    const scoringWidget = tacticTally({ options: scoringOpts.map((t) => ({ slug: t.slug, label: t.label })), values: editing?.scoring_actions || [] });
    form.appendChild(scoringWidget);

    // SECTION: How they scored on me
    form.appendChild(sectionLabel('How they scored'));
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

    // SECTION: Reflection
    form.appendChild(sectionLabel('Reflection'));
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['One line']),
        el('input', { type: 'text', name: 'reflection', class: 'field-input', value: editing?.reflection || '', placeholder: 'what I noticed' })
    ]));
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Coach feedback']),
        el('textarea', { name: 'coach_feedback', class: 'field-textarea', rows: 3, placeholder: 'if any' }, [editing?.coach_feedback || ''])
    ]));

    // SUBMIT
    form.appendChild(el('div', { style: { display: 'flex', gap: '10px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--rule)' } }, [
        el('a', { href: '#bouts', class: 'btn btn-ghost btn-mono-label', style: { flex: '1', textDecoration: 'none' } }, ['Cancel']),
        el('button', { type: 'submit', class: 'btn btn-primary btn-mono-label', style: { flex: '2' } }, [editing ? 'Save changes' : 'Save bout'])
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
            context: selectedCtx || null,
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

function sectionLabel(text) {
    return el('div', { class: 'label-row', style: { margin: '24px 0 4px' } }, [
        el('span', { class: 'label' }, [text])
    ]);
}

// =====================================================
// DETAIL — editorial bout-card with full breakdown
// =====================================================
export async function mountBoutDetail(root, params) {
    if (!params.id) return go('bouts');
    let b;
    try { b = await getBout(params.id); }
    catch (e) {
        root.appendChild(el('div', { class: 'card', style: { color: 'var(--loss)', margin: '24px var(--gut)' } }, ['Bout not found.']));
        return;
    }

    const taxos = await loadTaxonomies();
    const my = b.my_score ?? 0;
    const their = b.their_score ?? 0;
    const isWin = b.outcome === 'win';
    const isLoss = b.outcome === 'loss';

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, [b.opponent_name || 'Bout']),
        el('div', { class: 'today-sub' }, [
            el('span', {}, [fmtDateLong(b.date).toUpperCase()])
        ])
    ]));

    // Hero score
    const total = my + their;
    const ticks = [];
    for (let i = 0; i < total; i++) {
        ticks.push(el('span', { class: i < my ? 'touch-tick is-scored' : 'touch-tick' }));
    }
    const lastAct = (b.scoring_actions || []).slice(-1)[0];
    if (lastAct && /flick/i.test(lastAct.tactic_slug || '') && my > 0 && ticks[my - 1]) {
        ticks[my - 1] = el('span', { class: 'touch-tick is-flick' });
    }

    root.appendChild(el('div', { style: { padding: '12px var(--gut) 24px' } }, [
        el('div', { class: 'scoreline' }, [
            el('span', { class: `scoreline-num ${isWin ? 'is-win' : (isLoss ? 'is-loss' : '')}`, style: { fontSize: '48px' } }, [String(my)]),
            el('span', { class: 'scoreline-sep', style: { fontSize: '32px' } }, ['—']),
            el('span', { class: 'scoreline-num', style: { fontSize: '48px' } }, [String(their)]),
            el('span', { class: `scoreline-result ${isWin ? 'is-win' : (isLoss ? 'is-loss' : '')}`, style: { marginLeft: '14px' } }, [b.outcome || ''])
        ]),
        ticks.length ? el('div', { class: 'touch-strip', style: { marginTop: '12px' } }, ticks) : null,
        el('div', { class: 'bout-card-meta', style: { marginTop: '12px' } }, [
            CONTEXT_OPTIONS.find((c) => c.value === b.context)?.label
                ? el('span', {}, [(CONTEXT_OPTIONS.find((c) => c.value === b.context)?.label).toUpperCase()])
                : null,
            b.location ? el('span', {}, [b.location.toUpperCase()]) : null
        ])
    ]));

    // Scoring tally
    root.appendChild(el('div', { class: 'label-row' }, [el('span', { class: 'label' }, ['How I scored'])]));
    if (b.scoring_actions?.length) {
        root.appendChild(el('div', { class: 'chip-row', style: { padding: '0 var(--gut)' } }, b.scoring_actions.map((a) =>
            el('span', { class: 'chip is-on' }, [
                taxos.tacticBySlug.get(a.tactic_slug)?.label || a.tactic_slug,
                el('span', { style: { marginLeft: '8px', opacity: '0.7' } }, [`${a.successes}/${a.attempts}`])
            ])
        )));
    } else {
        root.appendChild(el('p', { class: 'empty-line', style: { padding: '0 var(--gut)', fontSize: '15px' } }, ['No tactics tallied.']));
    }

    // Failure patterns
    root.appendChild(el('div', { class: 'label-row', style: { marginTop: '24px' } }, [el('span', { class: 'label' }, ['How they scored'])]));
    if (b.failure_patterns?.length) {
        root.appendChild(el('div', { class: 'chip-row', style: { padding: '0 var(--gut)' } }, b.failure_patterns.map((s) =>
            el('span', { class: 'tag tag-weakness' }, [taxos.tacticBySlug.get(s)?.label || s])
        )));
    } else {
        root.appendChild(el('p', { class: 'empty-line', style: { padding: '0 var(--gut)', fontSize: '15px' } }, ['Nothing logged.']));
    }

    // Reflection
    if (b.reflection) {
        root.appendChild(el('div', { class: 'label-row', style: { marginTop: '24px' } }, [el('span', { class: 'label' }, ['Reflection'])]));
        root.appendChild(el('p', { class: 'bout-card-quote', style: { padding: '0 var(--gut)' } }, [b.reflection]));
    }

    // Coach feedback
    if (b.coach_feedback) {
        root.appendChild(el('div', { class: 'label-row', style: { marginTop: '24px' } }, [el('span', { class: 'label' }, ['Coach said'])]));
        root.appendChild(el('p', {
            style: {
                padding: '0 var(--gut)',
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: '17px',
                lineHeight: '1.5',
                color: 'var(--ink-soft)',
                borderLeft: '2px solid var(--gold-soft)',
                marginLeft: 'var(--gut)',
                paddingLeft: '14px'
            }
        }, [b.coach_feedback]));
    }

    // Claude debrief — generated by AI, cached in coach_notes
    root.appendChild(buildBoutDebriefCard(b));

    // Actions
    root.appendChild(el('div', { class: 'foil-divider' }));
    root.appendChild(el('div', { style: { display: 'flex', gap: '10px', padding: '0 var(--gut) 32px' } }, [
        el('a', { href: `#bouts/edit?id=${b.id}`, class: 'btn btn-ghost btn-mono-label', style: { flex: '1', textDecoration: 'none' } }, ['Edit']),
        b.opponent_id ? el('a', { href: `#opponents/show?id=${b.opponent_id}`, class: 'btn btn-ghost btn-mono-label', style: { flex: '1', textDecoration: 'none' } }, ['Scout card']) : null,
        el('button', {
            class: 'btn btn-ghost btn-mono-label',
            style: { color: 'var(--loss)', borderColor: 'rgba(192,138,126,0.3)' },
            onclick: async () => {
                if (!confirm('Delete this bout?')) return;
                await safeWrite({ table: 'bouts', op: 'delete', payload: {}, match: { id: b.id } });
                toast('Deleted');
                go('bouts');
            }
        }, ['Delete'])
    ]));
}

// =====================================================
// Claude bout debrief — appears under bout detail
// =====================================================
function buildBoutDebriefCard(bout) {
    const wrap = el('section', {
        class: 'coach-card',
        style: {
            margin: '24px var(--gut) 8px', padding: '22px 24px',
            background: 'var(--surface)', borderRadius: 'var(--r-card, 18px)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
        }
    });
    const head = el('div', {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }
    }, [
        el('div', { class: 'metric-label' }, ['Debrief']),
        el('div', { class: 'meta', style: { fontSize: '11px', color: 'var(--ink-mute)' } }, ['by Claude'])
    ]);
    wrap.appendChild(head);

    const body = el('div', { class: 'coach-card-body' });
    wrap.appendChild(body);

    renderEmpty();

    function renderEmpty() {
        body.innerHTML = '';
        body.appendChild(el('p', {
            style: { margin: '6px 0 14px', color: 'var(--ink-mute)', fontStyle: 'italic' }
        }, ['Get a debrief — what happened, the root cause, and the next training touch.']));
        body.appendChild(el('button', {
            type: 'button', class: 'btn btn-primary',
            onclick: handleGenerate
        }, ['Debrief this bout']));
    }
    function renderLoading() {
        body.innerHTML = '';
        body.appendChild(el('p', {
            style: { margin: '6px 0', color: 'var(--ink-mute)' }
        }, ['Asking Claude. One moment…']));
    }
    function renderResponse(text, model) {
        body.innerHTML = '';
        body.appendChild(el('div', {
            style: { whiteSpace: 'pre-wrap', lineHeight: '1.55', fontSize: '15px', color: 'var(--ink)' }
        }, [text]));
        body.appendChild(el('div', {
            class: 'kicker',
            style: { marginTop: '12px', fontSize: '11px', color: 'var(--ink-mute)' }
        }, [`${model || 'claude'} · click Regenerate for a fresh take`]));
        body.appendChild(el('div', { style: { marginTop: '12px' } }, [
            el('button', {
                type: 'button', class: 'btn btn-ghost btn-sm',
                style: { fontSize: '12px' }, onclick: handleGenerate
            }, ['Regenerate'])
        ]));
    }
    function renderError(msg) {
        body.innerHTML = '';
        body.appendChild(el('p', { style: { color: 'var(--loss)' } }, ['Could not get debrief: ' + msg]));
        body.appendChild(el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm',
            onclick: handleGenerate
        }, ['Try again']));
    }
    async function handleGenerate() {
        renderLoading();
        try {
            const res = await boutDebrief(bout.id);
            if (res?.text) renderResponse(res.text, res.model);
            else renderError('empty response');
        } catch (e) {
            renderError(e.message || String(e));
        }
    }

    // On mount — show cached debrief if one exists
    (async () => {
        try {
            const notes = await listCoachNotes({ kind: 'bout-debrief', boutId: bout.id, limit: 1 });
            if (notes[0]) renderResponse(notes[0].response_text, notes[0].model);
        } catch (_) { /* ignore */ }
    })();

    return wrap;
}
