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

export async function mountOpponentsList(root) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, [
            el('p', { class: 'empty-line' }, ['Pick a profile.'])
        ]));
        return;
    }

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, ['Scout']),
        el('div', { class: 'today-sub' }, [el('span', {}, [profile.name.toUpperCase()])])
    ]));

    let opps = [];
    try { opps = await listOpponents(); }
    catch (e) {
        return root.appendChild(el('div', { class: 'card', style: { color: 'var(--loss)', margin: '0 var(--gut)' } }, [`Failed to load: ${e.message}`]));
    }

    if (!opps.length) {
        root.appendChild(el('div', { class: 'empty' }, [
            el('p', { class: 'empty-line' }, ["The opposition writes itself in. Log a bout and they'll appear here."]),
            el('a', { href: '#bouts/new', class: 'btn btn-primary btn-mono-label empty-cta' }, ['Log a bout'])
        ]));
        return;
    }

    const filterInput = el('input', { type: 'text', class: 'field-input', placeholder: 'filter by name or club…', oninput: (e) => render(e.target.value) });
    root.appendChild(el('div', { style: { padding: '0 var(--gut) 8px' } }, [
        el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, ['Find']),
            filterInput
        ])
    ]));

    const list = el('div', {});
    root.appendChild(list);

    function render(filter = '') {
        list.innerHTML = '';
        const f = filter.toLowerCase();
        const filtered = opps.filter((o) => !f || (o.name || '').toLowerCase().includes(f) || (o.club || '').toLowerCase().includes(f));
        for (const o of filtered) list.appendChild(oppCard(o));
        if (!filtered.length) list.appendChild(el('p', { class: 'empty-line', style: { padding: '14px var(--gut)', fontSize: '15px' } }, ['No matches.']));
    }
    render();
}

function oppCard(o) {
    const archs = (o.archetypes || []).slice(0, 3);
    return el('a', {
        href: `#opponents/show?id=${o.id}`,
        class: 'opp-card',
        style: { textDecoration: 'none', color: 'inherit', display: 'block' }
    }, [
        el('div', { class: 'opp-card-head' }, [
            el('div', {}, [
                el('div', { class: 'opp-name' }, [o.name]),
                o.club ? el('div', { class: 'opp-club' }, [o.club]) : null
            ]),
            el('div', { class: 'opp-record' }, [
                o.rating || '—',
                el('span', { class: 'opp-record-label' }, ['RATING'])
            ])
        ]),
        archs.length || (o.hand && o.hand !== 'unknown')
            ? el('div', { class: 'opp-tag-row' }, [
                ...archs.map((a) => el('span', { class: 'tag' }, [a])),
                (o.hand && o.hand !== 'unknown') ? el('span', { class: 'tag' }, [o.hand[0].toUpperCase() + 'H']) : null
            ])
            : null
    ]);
}

export async function mountOpponentDetail(root, params) {
    if (!params.id) return go('opponents');
    const profile = activeProfile();

    let opp; try { opp = await getOpponent(params.id); }
    catch (e) { return root.appendChild(el('div', { class: 'card', style: { margin: '24px var(--gut)' } }, ['Opponent not found.'])); }

    const [swot, cards, bouts, taxos] = await Promise.all([
        getSwot(params.id), listScoutCards(params.id),
        listBouts({ opponentId: params.id, limit: 20 }), loadTaxonomies()
    ]);

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, [opp.name]),
        el('div', { class: 'today-sub' }, [el('span', {}, [(opp.club || '—').toUpperCase()])])
    ]));

    const headerCard = el('div', { class: 'card', style: { margin: '0 var(--gut)' } });
    root.appendChild(headerCard);
    renderHeaderCard();

    function renderHeaderCard() {
        headerCard.innerHTML = '';
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, ['Rating']),
            el('input', { type: 'text', class: 'field-input', value: opp.rating || '', oninput: (e) => updateField('rating', e.target.value) })
        ]));
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, ['Age category']),
            el('input', { type: 'text', class: 'field-input', value: opp.age_category || '', placeholder: 'Y14 / Cadet …', oninput: (e) => updateField('age_category', e.target.value) })
        ]));
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, ['Hand']),
            (() => {
                const sel = el('select', { class: 'field-select', onchange: (e) => updateField('hand', e.target.value) },
                    ['unknown', 'right', 'left'].map((h) => el('option', { value: h, selected: opp.hand === h }, [h])));
                return sel;
            })()
        ]));
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, ['Club']),
            el('input', { type: 'text', class: 'field-input', value: opp.club || '', oninput: (e) => updateField('club', e.target.value) })
        ]));
        headerCard.appendChild(el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, ['Archetype']),
            chipGroup({ options: ARCHETYPES, selected: new Set(opp.archetypes || []), onChange: (vals) => updateField('archetypes', vals) })
        ]));
    }

    let saveTimer;
    function updateField(field, value) {
        opp = { ...opp, [field]: value };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            try { await safeWrite({ table: 'opponents', op: 'update', payload: { [field]: value }, match: { id: opp.id } }); toast('Saved'); }
            catch (e) { toast('Save failed: ' + e.message, 'error'); }
        }, 500);
    }

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

    root.appendChild(el('div', { class: 'label-row', style: { marginTop: '24px' } }, [
        el('span', { class: 'label' }, ['SWOT']),
        el('span', { class: 'label', style: { color: 'var(--ink-faint)' } }, [swot ? `UPDATED ${fmtDate(swot.updated_at?.slice(0, 10)).toUpperCase()}` : 'NOT STARTED'])
    ]));
    root.appendChild(el('div', { class: 'swot-grid' }, [
        el('div', { class: 'swot-cell' }, [el('div', { class: 'swot-cell-label' }, ['Strengths']), sEditor]),
        el('div', { class: 'swot-cell' }, [el('div', { class: 'swot-cell-label' }, ['Weaknesses']), wEditor]),
        el('div', { class: 'swot-cell' }, [el('div', { class: 'swot-cell-label' }, ['Opportunities (mine)']), oEditor]),
        el('div', { class: 'swot-cell' }, [el('div', { class: 'swot-cell-label' }, ['Threats (theirs)']), tEditor])
    ]));

    if (suggestedOpps.size || suggestedThreats.size) {
        const suggestionCard = el('div', { class: 'card', style: { margin: '14px var(--gut)' } }, [
            el('div', { class: 'label' }, ['Suggestions from bout data']),
            suggestedOpps.size
                ? el('div', { style: { marginTop: '10px' } }, [
                    el('div', { class: 'auth-tagline', style: { fontSize: '13px', margin: '0 0 8px' } }, ['scored against them with']),
                    el('div', { class: 'chip-row' }, Array.from(suggestedOpps).map((s) =>
                        el('button', { class: 'chip', type: 'button', onclick: () => { oEditor.setValues([...new Set([...(oEditor.getValues()), s])]); debouncedSwot(); } }, ['+ ', s])
                    ))
                ])
                : null,
            suggestedThreats.size
                ? el('div', { style: { marginTop: '10px' } }, [
                    el('div', { class: 'auth-tagline', style: { fontSize: '13px', margin: '0 0 8px' } }, ['they scored on me with']),
                    el('div', { class: 'chip-row' }, Array.from(suggestedThreats).map((s) =>
                        el('button', { class: 'chip', type: 'button', onclick: () => { tEditor.setValues([...new Set([...(tEditor.getValues()), s])]); debouncedSwot(); } }, ['+ ', s])
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
                    strengths: sEditor.getValues(), weaknesses: wEditor.getValues(),
                    opportunities: oEditor.getValues(), threats: tEditor.getValues()
                });
            } catch (e) { toast('SWOT save failed: ' + e.message, 'error'); }
        }, 700);
    }

    root.appendChild(el('div', { class: 'label-row', style: { marginTop: '28px' } }, [
        el('span', { class: 'label' }, ['Scout cards']),
        el('span', { class: 'label', style: { color: 'var(--ink-faint)' } }, [`${cards.length} CARD${cards.length === 1 ? '' : 'S'}`])
    ]));
    root.appendChild(el('div', { style: { padding: '0 var(--gut) 12px' } }, [
        el('a', { href: `#opponents/scout?id=${opp.id}`, class: 'btn btn-ghost btn-mono-label' }, ['+ Pre-bout scout card'])
    ]));
    if (!cards.length) {
        root.appendChild(el('p', { class: 'empty-line', style: { padding: '0 var(--gut) 12px', fontSize: '15px' } }, ['No scout cards yet.']));
    } else {
        for (const c of cards) {
            root.appendChild(el('div', { class: 'card', style: { margin: '0 var(--gut) 12px' } }, [
                el('div', { class: 'label', style: { marginBottom: '10px' } }, [fmtDateLong(c.bout_date || c.created_at?.slice(0, 10)).toUpperCase()]),
                row5w2h('Who', c.who),
                row5w2h('What', c.what),
                row5w2h('When', c.when_in_bout),
                row5w2h('Where', c.where_scoring),
                row5w2h('Why', c.why_they_win),
                row5w2h('How', c.how_to_score),
                row5w2h('Respect', c.respect_1_10 ? `${c.respect_1_10} / 10` : null)
            ]));
        }
    }

    root.appendChild(el('div', { class: 'label-row', style: { marginTop: '28px' } }, [
        el('span', { class: 'label' }, ['Past bouts']),
        el('span', { class: 'label', style: { color: 'var(--ink-faint)' } }, [`${bouts.length} ON RECORD`])
    ]));
    if (!bouts.length) {
        root.appendChild(el('p', { class: 'empty-line', style: { padding: '0 var(--gut) 24px', fontSize: '15px' } }, ['No bouts yet.']));
    } else {
        for (const b of bouts) {
            const isWin = b.outcome === 'win';
            const isLoss = b.outcome === 'loss';
            root.appendChild(el('a', {
                href: `#bouts/show?id=${b.id}`, class: 'bout-card',
                style: { textDecoration: 'none', color: 'inherit', display: 'flex' }
            }, [
                el('div', { class: 'bout-card-head' }, [
                    el('div', { class: 'bout-card-opp' }, [
                        el('div', { class: 'bout-card-opp-name' }, [`${isWin ? 'Won' : (isLoss ? 'Lost' : 'Drew')}`]),
                        el('div', { class: 'bout-card-opp-tags' }, [
                            el('span', { class: 'bout-card-opp-tag' }, [fmtDate(b.date).toUpperCase()]),
                            b.location ? el('span', { class: 'bout-card-opp-tag' }, [b.location.toUpperCase()]) : null
                        ])
                    ]),
                    el('div', { class: 'scoreline' }, [
                        el('span', { class: `scoreline-num ${isWin ? 'is-win' : (isLoss ? 'is-loss' : '')}` }, [String(b.my_score ?? '–')]),
                        el('span', { class: 'scoreline-sep' }, ['—']),
                        el('span', { class: 'scoreline-num' }, [String(b.their_score ?? '–')])
                    ])
                ])
            ]));
        }
    }
}

function row5w2h(key, val) {
    return el('div', { style: { display: 'flex', gap: '14px', padding: '8px 0', borderBottom: '1px solid var(--rule)', alignItems: 'baseline' } }, [
        el('div', { class: 'label', style: { minWidth: '70px' } }, [key]),
        el('div', { style: { fontFamily: 'var(--sans)', fontSize: '15px', color: val ? 'var(--ink)' : 'var(--ink-faint)', flex: '1' } }, [val || '—'])
    ]);
}

export async function mountScoutForm(root, params) {
    if (!params.id) return go('opponents');
    const opp = await getOpponent(params.id);
    const profile = activeProfile();

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, [`Scout: ${opp.name}`]),
        el('div', { class: 'today-sub' }, [el('span', {}, [profile.name.toUpperCase()])])
    ]));

    const form = el('form', { onsubmit: async (e) => { e.preventDefault(); await save(); }, style: { padding: '0 var(--gut)' } });
    root.appendChild(form);

    function fld(label, name, ph) {
        return el('div', { class: 'field' }, [
            el('label', { class: 'field-label' }, [label]),
            el('input', { type: 'text', class: 'field-input', name, placeholder: ph || '' })
        ]);
    }

    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Bout date']),
        el('input', { type: 'date', class: 'field-input', name: 'bout_date', value: new Date().toISOString().slice(0, 10) })
    ]));

    form.appendChild(fld('Who · name + club + archetype', 'who', `${opp.name}${opp.club ? ' · ' + opp.club : ''}`));
    form.appendChild(fld('What · their go-to action', 'what', 'e.g., attack-in-prep'));
    form.appendChild(fld('When · when do they peak', 'when_in_bout', 'early / mid / late'));
    form.appendChild(fld('Where · where do they score', 'where_scoring', 'high / low / flank'));
    form.appendChild(fld('Why · why they win when they do', 'why_they_win'));
    form.appendChild(fld('How · how I will score on them', 'how_to_score'));

    const respect = scaleSlider({ value: 6 });
    form.appendChild(el('div', { class: 'field' }, [
        el('label', { class: 'field-label' }, ['Respect 1–10']),
        respect
    ]));

    form.appendChild(el('div', { style: { display: 'flex', gap: '10px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--rule)' } }, [
        el('a', { href: `#opponents/show?id=${opp.id}`, class: 'btn btn-ghost btn-mono-label', style: { flex: '1', textDecoration: 'none' } }, ['Cancel']),
        el('button', { type: 'submit', class: 'btn btn-primary btn-mono-label', style: { flex: '2' } }, ['Save scout card'])
    ]));

    async function save() {
        const fd = new FormData(form);
        const payload = {
            opponent_id: opp.id, profile_id: profile.id,
            bout_date: fd.get('bout_date') || null,
            who: fd.get('who') || null, what: fd.get('what') || null,
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
