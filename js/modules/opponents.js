// Module 3.6 — Opponents, SWOT, 5W2H scout cards.

import { el, fmtDate, fmtDateLong, toast } from '../lib/util.js';
import { go } from '../lib/router.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import {
    listOpponents, getOpponent,
    getSwot, upsertSwot, listScoutCards,
    listBouts, loadTaxonomies
} from '../lib/db.js';
import { chipArrayEditor, chipGroup, scaleSlider } from '../lib/chips.js';
import { safeWrite } from '../lib/offline.js';

const ARCHETYPES = [
    { slug: 'aggressive',   label: 'Aggressive' },
    { slug: 'technical',    label: 'Technical' },
    { slug: 'unpredictable',label: 'Unpredictable' },
    { slug: 'defensive',    label: 'Defensive' },
    { slug: 'counter',      label: 'Counter-fencer' },
    { slug: 'long-arm',     label: 'Long-arm / runner' },
    { slug: 'lefty',        label: 'Left-handed' }
];

// =====================================================
// LIST
// =====================================================
export async function mountOpponentsList(root) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Scout']),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    let opps = [];
    try { opps = await listOpponents(); }
    catch (e) {
        return root.appendChild(el('div', { class: 'card', style: { color: 'var(--danger)' } }, [`Failed to load: ${e.message}`]));
    }

    if (!opps.length) {
        root.appendChild(el('div', { class: 'empty' }, [
            'No opponents yet. They\'ll appear here automatically as you log bouts.'
        ]));
        return;
    }

    // group by first letter
    const filterInput = el('input', {
        type: 'text', placeholder: 'filter by name or club…',
        oninput: (e) => render(e.target.value)
    });
    root.appendChild(el('div', { class: 'field' }, [filterInput]));

    const list = el('div', {});
    root.appendChild(list);

    function render(filter = '') {
        list.innerHTML = '';
        const f = filter.toLowerCase();
        const filtered = opps.filter((o) =>
            !f || (o.name || '').toLowerCase().includes(f) || (o.club || '').toLowerCase().includes(f)
        );
        for (const o of filtered) {
            list.appendChild(el('a', {
                href: `#opponents/show?id=${o.id}`,
                class: 'bout-row',
                style: { textDecoration: 'none', borderLeftColor: 'var(--accent)' }
            }, [
                el('div', { class: 'bout-date' }, [(o.rating || '–')]),
                el('div', {}, [
                    el('div', { class: 'bout-opponent' }, [o.name]),
                    el('div', { class: 'bout-context' }, [
                        o.club || '',
                        (o.archetypes || []).length ? ' · ' + o.archetypes.join(', ') : ''
                    ])
                ]),
                el('div', { class: 'bout-score dim mono' }, [(o.hand && o.hand !== 'unknown') ? o.hand[0].toUpperCase() : ''])
            ]));
        }
        if (!filtered.length) list.appendChild(el('div', { class: 'empty' }, ['no matches']));
    }
    render();
}

// =====================================================
// DETAIL — opponent record + SWOT + scout cards + bout history
// =====================================================
export async function mountOpponentDetail(root, params) {
    if (!params.id) return go('opponents');
    const profile = activeProfile();

    let opp; try { opp = await getOpponent(params.id); }
    catch (e) { return root.appendChild(el('div', { class: 'card' }, ['Opponent not found.'])); }

    const [swot, cards, bouts, taxos] = await Promise.all([
        getSwot(params.id),
        listScoutCards(params.id),
        listBouts({ opponentId: params.id, limit: 20 }),
        loadTaxonomies()
    ]);

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, [opp.name]),
        el('span', { class: 'meta' }, [opp.club || '—'])
    ]));

    // editable header card
    const headerCard = el('div', { class: 'card bordered-accent' });
    root.appendChild(headerCard);
    renderHeaderCard();

    function renderHeaderCard() {
        headerCard.innerHTML = '';
        headerCard.appendChild(el('div', { class: 'row tight' }, [
            el('div', { class: 'field' }, [
                el('label', {}, ['Rating']),
                el('input', { type: 'text', value: opp.rating || '', oninput: (e) => updateField('rating', e.target.value) })
            ]),
            el('div', { class: 'field' }, [
                el('label', {}, ['Age category']),
                el('input', { type: 'text', value: opp.age_category || '', placeholder: 'Y14 / Cadet …', oninput: (e) => updateField('age_category', e.target.value) })
            ]),
            el('div', { class: 'field' }, [
                el('label', {}, ['Hand']),
                (() => {
                    const sel = el('select', { onchange: (e) => updateField('hand', e.target.value) },
                        ['unknown', 'right', 'left'].map((h) => el('option', { value: h, selected: opp.hand === h }, [h])));
                    return sel;
                })()
            ])
        ]));
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', {}, ['Club']),
            el('input', { type: 'text', value: opp.club || '', oninput: (e) => updateField('club', e.target.value) })
        ]));
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', {}, ['Archetype']),
            chipGroup({
                options: ARCHETYPES,
                selected: new Set(opp.archetypes || []),
                onChange: (vals) => updateField('archetypes', vals)
            })
        ]));
    }

    let saveTimer;
    function updateField(field, value) {
        opp = { ...opp, [field]: value };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            try {
                await safeWrite({ table: 'opponents', op: 'update', payload: { [field]: value }, match: { id: opp.id } });
                toast('Saved');
            } catch (e) { toast('Save failed: ' + e.message, 'error'); }
        }, 500);
    }

    // SWOT — auto-suggested from bouts
    const suggestedThreats = new Set();
    const suggestedOpps = new Set();
    for (const b of bouts) {
        for (const f of (b.failure_patterns || [])) suggestedThreats.add(taxos.tacticBySlug.get(f)?.label || f);
        for (const a of (b.scoring_actions || [])) {
            if (a.successes > 0) suggestedOpps.add(taxos.tacticBySlug.get(a.tactic_slug)?.label || a.tactic_slug);
        }
    }

    const cur = swot || { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    const sEditor = chipArrayEditor({ values: cur.strengths || [], onChange: () => debouncedSwot() });
    const wEditor = chipArrayEditor({ values: cur.weaknesses || [], onChange: () => debouncedSwot() });
    const oEditor = chipArrayEditor({ values: cur.opportunities || [], onChange: () => debouncedSwot() });
    const tEditor = chipArrayEditor({ values: cur.threats || [], onChange: () => debouncedSwot() });

    const swotSection = el('div', { class: 'section' }, [
        el('div', { class: 'section-head' }, [
            el('h2', {}, ['SWOT']),
            el('span', { class: 'meta' }, [swot ? `updated ${fmtDate(swot.updated_at?.slice(0, 10))}` : 'not started'])
        ]),
        el('div', { class: 'swot' }, [
            el('div', { class: 'quadrant s' }, [el('h4', {}, ['Strengths']), sEditor]),
            el('div', { class: 'quadrant w' }, [el('h4', {}, ['Weaknesses']), wEditor]),
            el('div', { class: 'quadrant o' }, [el('h4', {}, ['Opportunities (mine)']), oEditor]),
            el('div', { class: 'quadrant t' }, [el('h4', {}, ['Threats (theirs)']), tEditor])
        ])
    ]);
    root.appendChild(swotSection);

    if (suggestedOpps.size || suggestedThreats.size) {
        const suggestionCard = el('div', { class: 'card', style: { borderLeft: '3px solid var(--accent)' } }, [
            el('h4', {}, ['Suggestions from bout data']),
            suggestedOpps.size
                ? el('div', { style: { marginBottom: '10px' } }, [
                    el('div', { class: 'kicker' }, ['scored against them with']),
                    el('div', { class: 'chips' }, Array.from(suggestedOpps).map((s) =>
                        el('button', {
                            class: 'chip', type: 'button',
                            onclick: () => { oEditor.setValues([...new Set([...(oEditor.getValues()), s])]); debouncedSwot(); }
                        }, ['+ ', s])
                    ))
                ])
                : null,
            suggestedThreats.size
                ? el('div', {}, [
                    el('div', { class: 'kicker' }, ['they scored on me with']),
                    el('div', { class: 'chips' }, Array.from(suggestedThreats).map((s) =>
                        el('button', {
                            class: 'chip failure', type: 'button',
                            onclick: () => { tEditor.setValues([...new Set([...(tEditor.getValues()), s])]); debouncedSwot(); }
                        }, ['+ ', s])
                    ))
                ])
                : null
        ]);
        root.appendChild(suggestionCard);
    }

    let swotTimer;
    function debouncedSwot() {
        clearTimeout(swotTimer);
        swotTimer = setTimeout(async () => {
            try {
                await upsertSwot(opp.id, {
                    strengths: sEditor.getValues(),
                    weaknesses: wEditor.getValues(),
                    opportunities: oEditor.getValues(),
                    threats: tEditor.getValues()
                });
            } catch (e) { toast('SWOT save failed: ' + e.message, 'error'); }
        }, 700);
    }

    // 5W2H scout cards
    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Scout cards']),
        el('span', { class: 'meta' }, [`${cards.length} card${cards.length === 1 ? '' : 's'}`])
    ]));
    root.appendChild(el('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
        el('a', { href: `#opponents/scout?id=${opp.id}`, class: 'btn' }, ['+ Pre-bout scout card'])
    ]));
    if (!cards.length) {
        root.appendChild(el('div', { class: 'empty' }, ['no scout cards yet']));
    } else {
        for (const c of cards) {
            root.appendChild(el('div', { class: 'scout-card', style: { marginBottom: '12px' } }, [
                el('div', { class: 'kicker', style: { marginBottom: '8px' } }, [fmtDateLong(c.bout_date || c.created_at?.slice(0, 10))]),
                el('div', { class: 'grid-7' }, [
                    field('Who', c.who),
                    field('What', c.what),
                    field('When', c.when_in_bout),
                    field('Where', c.where_scoring),
                    field('Why', c.why_they_win),
                    field('How', c.how_to_score),
                    field('Respect', c.respect_1_10 ? `${c.respect_1_10} / 10` : null)
                ])
            ]));
        }
    }

    // Bout history
    root.appendChild(el('div', { class: 'section-head', style: { marginTop: '24px' } }, [
        el('h2', {}, ['Past bouts']),
        el('span', { class: 'meta' }, [`${bouts.length} on record`])
    ]));
    if (!bouts.length) {
        root.appendChild(el('div', { class: 'empty' }, ['no bouts yet']));
    } else {
        for (const b of bouts) {
            root.appendChild(el('a', {
                href: `#bouts/show?id=${b.id}`, class: `bout-row ${b.outcome || ''}`, style: { textDecoration: 'none' }
            }, [
                el('div', { class: 'bout-date' }, [fmtDate(b.date)]),
                el('div', {}, [
                    el('div', { class: 'bout-opponent' }, [`${b.outcome === 'win' ? 'Won' : (b.outcome === 'loss' ? 'Lost' : 'Drew')} ${b.my_score ?? '?'}–${b.their_score ?? '?'}`]),
                    el('div', { class: 'bout-context' }, [b.location || ''])
                ]),
                el('div', { class: 'bout-score' }, [el('span', { class: 'you' }, [String(b.my_score ?? '–')]), ' – ', String(b.their_score ?? '–')])
            ]));
        }
    }

    function field(key, val) {
        return el('div', { class: 'field-static' }, [
            el('div', { class: 'key' }, [key]),
            el('div', { class: 'val' }, [val || '—'])
        ]);
    }
}

// =====================================================
// 5W2H scout-card form
// =====================================================
export async function mountScoutForm(root, params) {
    if (!params.id) return go('opponents');
    const opp = await getOpponent(params.id);
    const profile = activeProfile();

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, [`Scout: ${opp.name}`]),
        el('span', { class: 'meta' }, [profile.name])
    ]));

    const form = el('form', { class: 'card', onsubmit: async (e) => { e.preventDefault(); await save(); } });
    root.appendChild(form);

    function fld(label, name, ph) {
        return el('div', { class: 'field' }, [
            el('label', {}, [label]),
            el('input', { type: 'text', name, placeholder: ph || '' })
        ]);
    }

    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['Date of upcoming bout (or today)']),
        el('input', { type: 'date', name: 'bout_date', value: new Date().toISOString().slice(0, 10) })
    ]));

    form.appendChild(fld('Who · name + club + archetype', 'who', `${opp.name}${opp.club ? ' · ' + opp.club : ''}`));
    form.appendChild(fld('What · their go-to action', 'what', 'e.g., attack-in-prep'));
    form.appendChild(fld('When · when in the bout do they peak?', 'when_in_bout', 'early / mid / late'));
    form.appendChild(fld('Where · where do they like to score?', 'where_scoring', 'high line / low line / flank'));
    form.appendChild(fld('Why · why do they win against me when they do?', 'why_they_win'));
    form.appendChild(fld('How · how am I going to score on them?', 'how_to_score'));

    const respect = scaleSlider({ value: 6 });
    form.appendChild(el('div', { class: 'field' }, [
        el('label', {}, ['How much · respect 1–10']),
        respect
    ]));

    form.appendChild(el('div', { class: 'btn-row right' }, [
        el('a', { href: `#opponents/show?id=${opp.id}`, class: 'btn btn-ghost' }, ['Cancel']),
        el('button', { type: 'submit', class: 'btn' }, ['Save scout card'])
    ]));

    async function save() {
        const fd = new FormData(form);
        const payload = {
            opponent_id: opp.id,
            profile_id: profile.id,
            bout_date: fd.get('bout_date') || null,
            who: fd.get('who') || null,
            what: fd.get('what') || null,
            when_in_bout: fd.get('when_in_bout') || null,
            where_scoring: fd.get('where_scoring') || null,
            why_they_win: fd.get('why_they_win') || null,
            how_to_score: fd.get('how_to_score') || null,
            respect_1_10: respect.getValue()
        };
        try {
            await safeWrite({ table: 'opponent_5w2h', op: 'insert', payload });
            toast('Scout card saved');
            go('opponents/show', { id: opp.id });
        } catch (e) { toast('Save failed: ' + e.message, 'error'); }
    }
}
