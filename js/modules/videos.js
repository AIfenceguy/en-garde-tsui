// Module 3.7 — Competition video watch-log.
// Paste a YouTube link, the two fencers are pulled off the title, then a short
// interview turns passive watching into something that feeds the fencing IQ
// database. Everything is kept so the same video can be revisited months later
// and the fencer can read what they thought at the time.

import { el, todayISO, fmtDate, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import { loadTaxonomies } from '../lib/db.js';
import { safeWrite } from '../lib/offline.js';
import { chipGroup } from '../lib/chips.js';
import { parseVideoId, canonicalUrl, thumbnailUrl, fetchMeta, parseFencers } from '../lib/youtube.js';

// Explicit colors everywhere: these surfaces are light, and inheriting a color
// chosen for the dark palette is how text has gone invisible here before.
//
// INK_MUTE is a literal rather than var(--ink-mute) on purpose: that token
// resolves to rgba(29,29,31,0.52), which composites to roughly 3.1:1 on the
// white card and fails AA. #6B7280 measures 4.65:1.
const INK = 'var(--ink, #1A1D24)';
const INK_MUTE = '#6B7280';

const selectStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.15)',
    background: '#fff',
    color: INK,
    fontSize: '15px',
    fontFamily: 'inherit'
};

const linkBtnStyle = {
    background: 'transparent',
    border: 'none',
    padding: '4px 10px',
    margin: '0 4px 0 0',
    cursor: 'pointer',
    fontFamily: 'var(--eg-mono, monospace)',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: INK_MUTE,
    textDecoration: 'none',
    borderRadius: '4px'
};

function selectField(name, options, value) {
    return el('select', { name, style: selectStyle },
        options.map((o) => el('option', {
            value: o.value,
            selected: o.value === value,
            style: { color: INK }
        }, [o.label]))
    );
}

function labelled(text, control, hint) {
    return el('div', { class: 'field', style: { marginTop: '14px' } }, [
        el('label', { style: { color: INK_MUTE } }, [text]),
        hint ? el('div', {
            style: { color: INK_MUTE, fontSize: '12px', margin: '2px 0 6px' }
        }, [hint]) : null,
        control
    ]);
}

// `params.embedded` is set when this renders as a tab inside the Lessons hub,
// which already shows its own heading.
export async function mountVideos(root, params = {}) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));
        return;
    }

    if (!params.embedded) {
        root.appendChild(el('div', { class: 'section-head' }, [
            el('h2', {}, ['Video study']),
            el('span', { class: 'meta' }, [profile.name])
        ]));
    }

    root.appendChild(el('p', {
        style: { color: INK_MUTE, marginTop: '-4px', fontSize: '14px' }
    }, ['Watch a bout, log what you saw. Come back to it before the next tournament.']));

    // The fencer they are modelling their game on - gives the study a target
    // instead of watching whatever autoplay serves up.
    if (profile.style_model) {
        const query = encodeURIComponent(`${profile.style_model} fencing foil`);
        root.appendChild(el('div', {
            class: 'card',
            style: { marginTop: '12px', borderLeft: '3px solid var(--accent)' }
        }, [
            el('div', { class: 'kicker', style: { color: INK_MUTE } }, ['Your style model']),
            el('div', { style: { color: INK, fontSize: '17px', fontWeight: '600', marginTop: '2px' } }, [profile.style_model]),
            profile.style_model_note
                ? el('p', { style: { color: INK_MUTE, fontSize: '13px', lineHeight: '1.5', margin: '6px 0 0' } }, [profile.style_model_note])
                : null,
            el('a', {
                href: `https://www.youtube.com/results?search_query=${query}`,
                target: '_blank',
                rel: 'noopener',
                style: {
                    display: 'inline-block', marginTop: '10px', color: 'var(--accent)',
                    fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px', fontWeight: '700',
                    letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none'
                }
            }, [`find ${profile.style_model} bouts →`])
        ]));
    }

    const taxos = await loadTaxonomies();
    const scoringTactics = taxos.tactics.filter((t) => t.kind === 'scoring');

    const { data, error } = await supa
        .from('video_reflections')
        .select('*')
        .eq('profile_id', profile.id)
        .is('deleted_at', null)
        .order('watched_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) {
        root.appendChild(el('div', { class: 'card' }, [
            el('p', { style: { color: 'var(--danger, #9b2230)' } }, ['Could not load videos: ' + error.message])
        ]));
        return;
    }
    const videos = data || [];

    root.appendChild(el('div', { class: 'btn-row', style: { margin: '12px 0' } }, [
        el('button', { class: 'btn', onclick: () => openForm() }, ['+ Log a video watched'])
    ]));

    const formMount = el('div', {});
    root.appendChild(formMount);

    const listMount = el('div', {});
    root.appendChild(listMount);
    renderList();

    // ------------------------------------------------------------------
    // List of past study sessions
    // ------------------------------------------------------------------
    function renderList() {
        listMount.innerHTML = '';

        if (!videos.length) {
            listMount.appendChild(el('div', { class: 'empty' }, ['no videos logged yet']));
            return;
        }

        // Which actions keep showing up across everything watched so far.
        const tally = new Map();
        for (const v of videos) {
            for (const slug of (v.key_actions || [])) {
                tally.set(slug, (tally.get(slug) || 0) + 1);
            }
        }
        if (tally.size) {
            const top = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
            listMount.appendChild(el('div', {
                class: 'nudge',
                style: { borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
            }, [
                el('div', { class: 'nudge-head', style: { color: 'var(--accent)' } }, ['Actions you keep seeing win']),
                el('div', { class: 'chips' }, top.map(([slug, n]) =>
                    el('span', { class: 'chip on' }, [
                        taxos.tacticBySlug.get(slug)?.label || slug,
                        el('span', {
                            style: { fontFamily: 'var(--mono)', marginLeft: '6px', fontSize: '0.8rem' }
                        }, [` x${n}`])
                    ])
                ))
            ]));
        }

        for (const v of videos) {
            listMount.appendChild(videoCard(v));
        }
    }

    function videoCard(v) {
        const card = el('div', { class: 'card bordered-accent' });

        const bout = (v.fencer_a && v.fencer_b)
            ? `${v.fencer_a} vs ${v.fencer_b}`
            : (v.video_title || 'Video');

        card.appendChild(el('div', { class: 'card-head' }, [
            el('h3', { style: { color: INK } }, [bout]),
            el('span', { class: 'card-meta' }, [fmtDate(v.watched_date)])
        ]));

        if (v.competition) {
            card.appendChild(el('div', { class: 'kicker', style: { color: INK_MUTE } }, [v.competition]));
        }

        const media = el('div', { style: { display: 'flex', gap: '12px', marginTop: '10px', alignItems: 'flex-start' } });
        if (v.video_thumbnail_url) {
            media.appendChild(el('img', {
                src: v.video_thumbnail_url,
                alt: '',
                loading: 'lazy',
                style: { width: '120px', maxWidth: '35%', borderRadius: '8px', display: 'block' }
            }));
        }
        const meta = el('div', { style: { flex: '1 1 auto', minWidth: '0' } });
        if (v.winner) {
            meta.appendChild(el('div', { style: { color: INK, fontSize: '14px' } }, [
                el('strong', { style: { color: INK } }, ['Won: ']),
                v.winner,
                v.final_score ? `  (${v.final_score})` : ''
            ]));
        }
        if (v.key_actions?.length) {
            meta.appendChild(el('div', { class: 'chips', style: { marginTop: '6px' } },
                v.key_actions.map((slug) =>
                    el('span', { class: 'chip on' }, [taxos.tacticBySlug.get(slug)?.label || slug])
                )
            ));
        }
        media.appendChild(meta);
        card.appendChild(media);

        if (v.what_i_learned) {
            card.appendChild(el('div', { style: { marginTop: '10px' } }, [
                el('div', { class: 'kicker', style: { color: INK_MUTE } }, ['What I learned']),
                el('p', { style: { margin: '4px 0 0', color: INK, fontSize: '14px', lineHeight: '1.5' } }, [v.what_i_learned])
            ]));
        }
        if (v.how_to_practice) {
            card.appendChild(el('div', { style: { marginTop: '10px' } }, [
                el('div', { class: 'kicker', style: { color: INK_MUTE } }, ['How I will practice it']),
                el('p', {
                    style: {
                        margin: '4px 0 0', padding: '10px 12px', background: 'rgba(0,0,0,0.03)',
                        borderRadius: '8px', color: INK, fontSize: '14px', lineHeight: '1.5'
                    }
                }, [v.how_to_practice])
            ]));
        }

        // Full interview transcript, collapsed — this is the "revisit later" part.
        if (v.quiz_answers?.length) {
            const body = el('div', { style: { display: 'none', marginTop: '8px' } },
                v.quiz_answers.map((qa) => el('div', { style: { marginBottom: '10px' } }, [
                    el('div', { style: { color: INK_MUTE, fontSize: '12px' } }, [qa.question]),
                    el('div', { style: { color: INK, fontSize: '14px' } }, [qa.answer || '—'])
                ]))
            );
            const chev = el('span', {
                style: { display: 'inline-block', transition: 'transform 0.15s ease', marginRight: '6px', fontSize: '10px', color: INK_MUTE }
            }, ['▶']);
            const toggle = el('button', {
                type: 'button',
                style: Object.assign({}, linkBtnStyle, { display: 'inline-flex', alignItems: 'center', padding: '4px 0', margin: '10px 0 0' }),
                onclick: () => {
                    const open = body.style.display !== 'none';
                    body.style.display = open ? 'none' : 'block';
                    chev.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
                }
            }, [chev, 'My answers']);
            card.appendChild(toggle);
            card.appendChild(body);
        }

        const actions = el('div', { style: { marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('a', {
                href: v.youtube_url, target: '_blank', rel: 'noopener',
                style: Object.assign({}, linkBtnStyle, { color: 'var(--accent)' })
            }, ['rewatch']),
            el('div', {}, [
                el('button', { type: 'button', style: linkBtnStyle, onclick: () => openForm(v) }, ['edit']),
                el('button', {
                    type: 'button',
                    style: Object.assign({}, linkBtnStyle, { color: '#9b2230' }),
                    onclick: async () => {
                        if (!confirm('Delete this video log?')) return;
                        // Soft delete: it leaves their view immediately, but the row is
                        // kept so a mistap is recoverable and long-term analysis stays whole.
                        await safeWrite({
                            table: 'video_reflections',
                            op: 'update',
                            payload: { deleted_at: new Date().toISOString() },
                            match: { id: v.id }
                        });
                        const i = videos.findIndex((x) => x.id === v.id);
                        if (i >= 0) videos.splice(i, 1);
                        toast('Deleted');
                        renderList();
                    }
                }, ['delete'])
            ])
        ]);
        card.appendChild(actions);

        return card;
    }

    // ------------------------------------------------------------------
    // Entry form
    // ------------------------------------------------------------------
    function openForm(editing) {
        formMount.innerHTML = '';
        const form = el('form', { class: 'card', onsubmit: async (e) => { e.preventDefault(); await save(); } });
        formMount.appendChild(form);

        // The form mounts above the list. Editing an entry further down the page
        // therefore rendered it off-screen, which is why the edit button looked
        // dead - it had worked every time, just somewhere nobody was looking.
        if (editing) {
            form.insertBefore(
                el('div', {
                    style: {
                        fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px',
                        fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'var(--accent)', marginBottom: '10px'
                    }
                }, ['Editing this entry']),
                form.firstChild
            );
        }
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Focus after the scroll so assistive tech and keyboard users land in
        // the form too, not only sighted ones.
        const firstField = form.querySelector('input, select, textarea');
        if (firstField) setTimeout(() => firstField.focus({ preventScroll: true }), 250);

        let videoId = editing?.video_id || null;
        let thumb = editing?.video_thumbnail_url || null;
        let title = editing?.video_title || '';
        let author = editing?.video_author || '';

        // --- link + auto-detect -----------------------------------------
        const urlInput = el('input', {
            type: 'url',
            name: 'youtube_url',
            placeholder: 'paste the YouTube link',
            value: editing?.youtube_url || '',
            required: true,
            style: { color: INK }
        });

        const preview = el('div', { style: { marginTop: '10px' } });
        const fencerA = el('input', { type: 'text', name: 'fencer_a', placeholder: 'fencer 1', value: editing?.fencer_a || '', style: { color: INK } });
        const fencerB = el('input', { type: 'text', name: 'fencer_b', placeholder: 'fencer 2', value: editing?.fencer_b || '', style: { color: INK } });
        const competition = el('input', { type: 'text', name: 'competition', placeholder: 'event / competition', value: editing?.competition || '', style: { color: INK } });

        let winnerSelect = selectField('winner', winnerOptions(), editing?.winner || '');

        function winnerOptions() {
            const a = fencerA.value.trim();
            const b = fencerB.value.trim();
            return [
                { value: '', label: '—' },
                { value: a || 'Fencer 1', label: a || 'Fencer 1' },
                { value: b || 'Fencer 2', label: b || 'Fencer 2' },
                { value: 'not shown', label: "Not shown / didn't finish" }
            ];
        }

        function refreshWinnerOptions() {
            const current = winnerSelect.value;
            const fresh = selectField('winner', winnerOptions(), current);
            winnerSelect.replaceWith(fresh);
            winnerSelect = fresh;
        }
        fencerA.addEventListener('change', refreshWinnerOptions);
        fencerB.addEventListener('change', refreshWinnerOptions);

        function renderPreview() {
            preview.innerHTML = '';
            if (!videoId) return;
            preview.appendChild(el('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, [
                el('img', {
                    src: thumb || thumbnailUrl(videoId), alt: '',
                    style: { width: '120px', maxWidth: '35%', borderRadius: '8px', display: 'block' }
                }),
                el('div', { style: { flex: '1 1 auto', minWidth: '0' } }, [
                    el('div', { style: { color: INK, fontSize: '14px', fontWeight: '600' } }, [title || '(title unavailable)']),
                    author ? el('div', { style: { color: INK_MUTE, fontSize: '12px', marginTop: '2px' } }, [author]) : null
                ])
            ]));
        }

        const status = el('div', { style: { color: INK_MUTE, fontSize: '12px', marginTop: '6px' } }, []);

        async function loadFromUrl() {
            const raw = urlInput.value.trim();
            if (!raw) return;
            const id = parseVideoId(raw);
            if (!id) {
                status.textContent = "That doesn't look like a YouTube link — you can still fill everything in by hand.";
                return;
            }
            videoId = id;
            urlInput.value = canonicalUrl(id);
            thumb = thumbnailUrl(id);
            status.textContent = 'Reading video…';
            renderPreview();

            const meta = await fetchMeta(id);
            if (meta) {
                title = meta.title;
                author = meta.author;
                thumb = meta.thumbnail;
                const f = parseFencers(title);
                // Only auto-fill blanks so a hand-typed correction is never clobbered.
                if (f.a && !fencerA.value.trim()) fencerA.value = f.a;
                if (f.b && !fencerB.value.trim()) fencerB.value = f.b;
                if (f.competition && !competition.value.trim()) competition.value = f.competition;
                refreshWinnerOptions();
                status.textContent = (f.a && f.b)
                    ? 'Found both fencers — fix them if I got it wrong.'
                    : "Couldn't pick out the fencers from the title — type them in.";
            } else {
                status.textContent = "Couldn't read the video (offline or private) — fill in the names by hand.";
            }
            renderPreview();
        }

        urlInput.addEventListener('change', loadFromUrl);
        urlInput.addEventListener('paste', () => setTimeout(loadFromUrl, 50));

        form.appendChild(labelled('YouTube link', urlInput, 'paste it and I will try to pull out who fenced'));
        form.appendChild(preview);
        form.appendChild(status);

        form.appendChild(el('div', { class: 'row', style: { marginTop: '14px' } }, [
            el('div', { class: 'field' }, [el('label', { style: { color: INK_MUTE } }, ['Fencer 1']), fencerA]),
            el('div', { class: 'field' }, [el('label', { style: { color: INK_MUTE } }, ['Fencer 2']), fencerB])
        ]));

        form.appendChild(el('div', { class: 'row' }, [
            el('div', { class: 'field' }, [el('label', { style: { color: INK_MUTE } }, ['Event']), competition]),
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Date watched']),
                el('input', { type: 'date', name: 'watched_date', value: editing?.watched_date || todayISO(), required: true, style: { color: INK } })
            ])
        ]));

        // --- the interview ----------------------------------------------
        form.appendChild(el('div', {
            class: 'label-row',
            style: { marginTop: '22px', paddingTop: '16px', borderTop: '1px solid rgba(0,0,0,0.08)' }
        }, [
            el('span', { class: 'label', style: { color: INK } }, ['What did you see?'])
        ]));

        form.appendChild(labelled('Who won?', winnerSelect));

        form.appendChild(labelled('Final score',
            el('input', { type: 'text', name: 'final_score', placeholder: 'e.g. 15-11', value: editing?.final_score || '', style: { color: INK } })
        ));

        const actionState = new Set(editing?.key_actions || []);
        const actionGroup = chipGroup({
            options: scoringTactics.map((t) => ({ slug: t.slug, label: t.label })),
            selected: actionState
        });
        // An empty chip group is a silent dead end, so say what happened.
        const actionControl = scoringTactics.length
            ? actionGroup
            : el('div', {}, [
                actionGroup,
                el('div', { style: { color: INK_MUTE, fontSize: '12px' } }, [
                    'Action list unavailable right now — the rest of the form still saves.'
                ])
            ]);
        form.appendChild(labelled(
            'Which actions actually scored?',
            actionControl,
            'tap every one you saw work — this is what builds the pattern over time'
        ));

        form.appendChild(labelled('Who controlled the distance?',
            selectField('distance_control', [
                { value: '', label: '—' },
                { value: 'fencer 1', label: 'Fencer 1' },
                { value: 'fencer 2', label: 'Fencer 2' },
                { value: 'back and forth', label: 'It went back and forth' },
                { value: 'not sure', label: 'Not sure yet' }
            ], editing ? answerFor(editing, 'Who controlled the distance?') : ''),
            'who decided when the two of them were close enough to hit'
        ));

        form.appendChild(labelled('When the winner fell behind, what changed?',
            selectField('when_behind', [
                { value: '', label: '—' },
                { value: 'attacked more', label: 'Attacked more' },
                { value: 'defended and waited', label: 'Defended and waited' },
                { value: 'changed the distance', label: 'Changed the distance' },
                { value: 'changed rhythm', label: 'Changed the rhythm / tempo' },
                { value: 'nothing changed', label: 'Nothing changed' },
                { value: 'never behind', label: 'They were never behind' }
            ], editing ? answerFor(editing, 'When the winner fell behind, what changed?') : '')
        ));

        form.appendChild(labelled('What surprised you?',
            el('input', { type: 'text', name: 'surprise', placeholder: 'something you did not expect', value: editing ? answerFor(editing, 'What surprised you?') : '', style: { color: INK } })
        ));

        form.appendChild(labelled('What did you learn?',
            el('textarea', { name: 'what_i_learned', rows: 3, style: { color: INK } }, [editing?.what_i_learned || '']),
            'one idea you want to steal for your own fencing'
        ));

        form.appendChild(labelled('How will you practice it?',
            el('textarea', { name: 'how_to_practice', rows: 3, style: { color: INK } }, [editing?.how_to_practice || '']),
            'be specific — what will you actually do at the next lesson?'
        ));

        const ratingVal = el('span', { class: 'scale-value', style: { color: INK } }, [String(editing?.rating_1_10 ?? 7)]);
        const ratingInput = el('input', {
            type: 'range', min: 1, max: 10, value: editing?.rating_1_10 ?? 7,
            oninput: (e) => { ratingVal.textContent = e.target.value; }
        });
        form.appendChild(labelled('How useful was this video?', el('div', { class: 'scale' }, [ratingInput, ratingVal])));

        form.appendChild(el('div', { class: 'btn-row right', style: { marginTop: '18px' } }, [
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { formMount.innerHTML = ''; } }, ['Cancel']),
            el('button', { type: 'submit', class: 'btn' }, [editing ? 'Save changes' : 'Save video'])
        ]));

        if (editing?.video_id) renderPreview();

        async function save() {
            const fd = new FormData(form);
            const url = (fd.get('youtube_url') || '').toString().trim();
            const id = parseVideoId(url) || videoId;

            const a = fencerA.value.trim();
            const b = fencerB.value.trim();

            // Keep the whole interview verbatim so it reads back like a journal.
            const quiz = [
                { question: 'Who won?', answer: (fd.get('winner') || '').toString() },
                { question: 'Final score', answer: (fd.get('final_score') || '').toString() },
                { question: 'Which actions actually scored?', answer: actionGroup.getValues().map((s) => taxos.tacticBySlug.get(s)?.label || s).join(', ') },
                { question: 'Who controlled the distance?', answer: (fd.get('distance_control') || '').toString() },
                { question: 'When the winner fell behind, what changed?', answer: (fd.get('when_behind') || '').toString() },
                { question: 'What surprised you?', answer: (fd.get('surprise') || '').toString() },
                { question: 'What did you learn?', answer: (fd.get('what_i_learned') || '').toString() },
                { question: 'How will you practice it?', answer: (fd.get('how_to_practice') || '').toString() }
            ];

            const payload = {
                profile_id: profile.id,
                watched_date: fd.get('watched_date'),
                youtube_url: id ? canonicalUrl(id) : url,
                video_id: id,
                video_title: title || null,
                video_author: author || null,
                video_thumbnail_url: (thumb || (id ? thumbnailUrl(id) : null)),
                fencer_a: a || null,
                fencer_b: b || null,
                competition: competition.value.trim() || null,
                winner: (fd.get('winner') || '').toString() || null,
                final_score: (fd.get('final_score') || '').toString().trim() || null,
                key_actions: actionGroup.getValues(),
                what_i_learned: (fd.get('what_i_learned') || '').toString().trim() || null,
                how_to_practice: (fd.get('how_to_practice') || '').toString().trim() || null,
                quiz_answers: quiz,
                rating_1_10: Number(ratingInput.value)
            };

            try {
                if (editing) {
                    await safeWrite({ table: 'video_reflections', op: 'update', payload, match: { id: editing.id } });
                    Object.assign(editing, payload);
                } else {
                    const res = await safeWrite({ table: 'video_reflections', op: 'insert', payload });
                    const saved = res?.data?.[0];
                    videos.unshift(saved || { ...payload, id: 'pending-' + Date.now() });
                }
                toast('Saved');
                formMount.innerHTML = '';
                renderList();
            } catch (e) {
                toast('Save failed: ' + e.message, 'error');
            }
        }
    }

    function answerFor(row, question) {
        const hit = (row.quiz_answers || []).find(
            (qa) => (qa.question || '').toLowerCase() === question.toLowerCase()
        );
        return hit ? (hit.answer || '') : '';
    }
}
