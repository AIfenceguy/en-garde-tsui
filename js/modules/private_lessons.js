// Module 3.1 — Private lessons.
// List + entry form. Topics multi-select with mastery slider per topic.

import { el, todayISO, fmtDate, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import { listPrivateLessons, loadTaxonomies } from '../lib/db.js';
import { safeWrite } from '../lib/offline.js';
import { chipGroup } from '../lib/chips.js';

export async function renderPrivateLessonsTab(container) {
    const profile = activeProfile();
    container.innerHTML = '';

    const lessons = await listPrivateLessons(20);
    const taxos = await loadTaxonomies();

    // recent topic frequency for "needs reinforcement" badge
    const topicCount = new Map();
    const sixWeeksAgo = new Date(); sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    for (const l of lessons) {
        if (new Date(l.date) < sixWeeksAgo) continue;
        for (const t of (l.topics || [])) {
            topicCount.set(t.topic_slug, (topicCount.get(t.topic_slug) || 0) + 1);
        }
    }
    const needsReinforcement = new Set(
        Array.from(topicCount.entries()).filter(([, c]) => c >= 3).map(([s]) => s)
    );

    container.appendChild(el('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
        el('button', { class: 'btn', onclick: () => openForm() }, ['+ Log a private lesson'])
    ]));

    const formMount = el('div', {});
    container.appendChild(formMount);

    if (needsReinforcement.size) {
        container.appendChild(el('div', { class: 'nudge', style: { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } }, [
            el('div', { class: 'nudge-head', style: { color: 'var(--accent)' } }, ['Needs reinforcement']),
            el('div', { class: 'chips' }, Array.from(needsReinforcement).map((slug) =>
                el('span', { class: 'chip on' }, [taxos.topicBySlug.get(slug)?.label || slug, ` ×${topicCount.get(slug)}`])
            ))
        ]));
    }

    if (!lessons.length) {
        container.appendChild(el('div', { class: 'empty' }, ['no private lessons logged yet']));
    }
    for (const l of lessons) {
        const card = el('div', { class: 'card bordered-accent' });
        card.appendChild(el('div', { class: 'card-head' }, [
            el('h3', {}, [l.coach || 'Coach', ' · ', el('span', { class: 'mono dim' }, [`${l.duration_min || '?'}m`])]),
            el('span', { class: 'card-meta' }, [fmtDate(l.date)])
        ]));
        if (l.new_skill_introduced) card.appendChild(el('span', { class: 'chip on', style: { marginBottom: '8px' } }, ['new skill']));
        if (l.topics?.length) {
            card.appendChild(el('div', { class: 'chips' }, l.topics.map((t) =>
                el('span', { class: 'chip on' }, [
                    taxos.topicBySlug.get(t.topic_slug)?.label || t.topic_slug,
                    el('span', { class: 'count', style: { fontFamily: 'var(--mono)', marginLeft: '6px', color: 'var(--cream-dim)', fontSize: '0.8rem' } }, [`${t.mastery_1_10 || '?'}/10`])
                ])
            )));
        }
        if (l.coach_quote) {
            card.appendChild(el('blockquote', { style: { borderLeft: '2px solid var(--accent)', margin: '12px 0 0', paddingLeft: '12px', fontStyle: 'italic' } }, [l.coach_quote]));
        }
        if (l.practice_plan) {
            const wrap = el('div', { style: { marginTop: '10px' } });
            const body = el('p', {
                style: {
                    margin: '8px 0 0',
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.03)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: 'var(--ink, #1A1D24)',
                    lineHeight: '1.5',
                    display: 'none'
                }
            }, [l.practice_plan]);
            const chev = el('span', {
                style: {
                    display: 'inline-block',
                    transition: 'transform 0.15s ease',
                    marginRight: '6px',
                    fontSize: '10px',
                    color: 'var(--ink-mute, #6B7280)'
                }
            }, ['▶']);
            const toggle = el('button', {
                type: 'button',
                style: {
                    background: 'transparent',
                    border: 'none',
                    padding: '4px 0',
                    cursor: 'pointer',
                    fontFamily: 'var(--eg-mono, monospace)',
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-mute, #6B7280)',
                    display: 'inline-flex',
                    alignItems: 'center'
                },
                onclick: () => {
                    const open = body.style.display !== 'none';
                    body.style.display = open ? 'none' : 'block';
                    chev.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
                }
            }, [chev, 'Practice plan']);
            wrap.appendChild(toggle);
            wrap.appendChild(body);
            card.appendChild(wrap);
        }
        // edit / delete row — clean text-style buttons (no default browser frame)
        {
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
                color: 'var(--ink-mute, #6B7280)',
                textDecoration: 'none',
                borderRadius: '4px'
            };
            const dangerBtnStyle = Object.assign({}, linkBtnStyle, { color: '#9b2230' });
            card.appendChild(el('div', { style: { marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '4px' } }, [
                el('button', { type: 'button', style: linkBtnStyle, onclick: () => openForm(l) }, ['edit']),
                el('button', { type: 'button', style: dangerBtnStyle, onclick: async () => {
                    if (!confirm('Delete this lesson?')) return;
                    await safeWrite({ table: 'private_lessons', op: 'delete', payload: {}, match: { id: l.id } });
                    toast('Deleted');
                    renderPrivateLessonsTab(container);
                } }, ['delete'])
            ]));
        }
        container.appendChild(card);
    }

    function openForm(editing) {
        formMount.innerHTML = '';
        const form = el('form', { class: 'card', onsubmit: async (e) => { e.preventDefault(); await save(); } });
        formMount.appendChild(form);

        form.appendChild(el('div', { class: 'row' }, [
            el('div', { class: 'field' }, [el('label', {}, ['Date']), el('input', { type: 'date', name: 'date', value: editing?.date || todayISO(), required: true })]),
            el('div', { class: 'field' }, [el('label', {}, ['Coach']), el('input', { type: 'text', name: 'coach', value: editing?.coach || '' })]),
            el('div', { class: 'field' }, [el('label', {}, ['Minutes']), el('input', { type: 'number', name: 'duration_min', value: editing?.duration_min ?? '' })])
        ]));

        // topic selection
        form.appendChild(el('div', { class: 'field' }, [
            el('label', {}, ['Topics']),
            (() => {
                const initial = new Set((editing?.topics || []).map((t) => t.topic_slug));
                const group = chipGroup({
                    options: taxos.topics.map((t) => ({ slug: t.slug, label: t.label })),
                    selected: initial,
                    allowAdd: true,
                    onChange: (vals) => renderTopicDetails(vals),
                    onAdd: async ({ slug, label }) => {
                        const { data, error } = await supa.from('topic_taxonomy').insert({ slug, label }).select().single();
                        if (error) { toast('Could not add: ' + error.message, 'error'); return null; }
                        taxos.topics.push(data);
                        taxos.topicBySlug.set(data.slug, data);
                        return { slug: data.slug, label: data.label };
                    }
                });
                form._topicGroup = group;
                return group;
            })()
        ]));
        const topicDetails = el('div', {});
        form.appendChild(topicDetails);
        const topicState = new Map((editing?.topics || []).map((t) => [t.topic_slug, t]));

        function renderTopicDetails(slugs) {
            topicDetails.innerHTML = '';
            for (const slug of slugs) {
                const cur = topicState.get(slug) || { topic_slug: slug, mastery_1_10: 5, application_notes: '' };
                topicState.set(slug, cur);
                const masteryInput = el('input', { type: 'range', min: 1, max: 10, value: cur.mastery_1_10, oninput: (e) => { cur.mastery_1_10 = Number(e.target.value); val.textContent = e.target.value; } });
                const val = el('span', { class: 'scale-value' }, [String(cur.mastery_1_10)]);
                const notes = el('input', { type: 'text', placeholder: 'where in a bout would I use this?', value: cur.application_notes, onchange: (e) => { cur.application_notes = e.target.value.trim(); } });
                topicDetails.appendChild(el('div', { class: 'card', style: { padding: '12px', margin: '8px 0' } }, [
                    el('div', { class: 'kicker' }, [taxos.topicBySlug.get(slug)?.label || slug]),
                    el('div', { class: 'scale' }, [masteryInput, val]),
                    el('div', { class: 'field', style: { marginTop: '8px' } }, [notes])
                ]));
            }
        }
        renderTopicDetails(Array.from(topicState.keys()));
        form._topicGroup.onChange = renderTopicDetails;

        const newSkill = el('input', { type: 'checkbox', checked: !!editing?.new_skill_introduced });
        form.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'none', letterSpacing: 'normal', fontFamily: 'var(--serif)', color: 'var(--cream)', marginBottom: '12px' } }, [newSkill, 'New skill introduced today']));

        form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Coach\'s key quote']), el('input', { type: 'text', name: 'coach_quote', value: editing?.coach_quote || '' })]));
        form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Practice plan']), el('textarea', { name: 'practice_plan' }, [editing?.practice_plan || ''])]));

        form.appendChild(el('div', { class: 'btn-row right' }, [
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => formMount.innerHTML = '' }, ['Cancel']),
            el('button', { type: 'submit', class: 'btn' }, [editing ? 'Save changes' : 'Save lesson'])
        ]));

        async function save() {
            const fd = new FormData(form);
            const slugs = form._topicGroup.getValues();
            const topics = slugs.map((s) => topicState.get(s)).filter(Boolean);
            const payload = {
                profile_id: profile.id,
                date: fd.get('date'),
                coach: (fd.get('coach') || '').toString().trim() || null,
                duration_min: fd.get('duration_min') ? Number(fd.get('duration_min')) : null,
                topics,
                new_skill_introduced: !!newSkill.checked,
                practice_plan: (fd.get('practice_plan') || '').toString().trim() || null,
                coach_quote: (fd.get('coach_quote') || '').toString().trim() || null
            };
            try {
                if (editing) {
                    await safeWrite({ table: 'private_lessons', op: 'update', payload, match: { id: editing.id } });
                } else {
                    await safeWrite({ table: 'private_lessons', op: 'insert', payload });
                }
                toast('Saved');
                renderPrivateLessonsTab(container);
            } catch (e) { toast('Save failed: ' + e.message, 'error'); }
        }
    }
}
