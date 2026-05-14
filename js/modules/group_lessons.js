// Module 3.2 — Group lessons.
// List + entry. Drills with comfort slider per drill + application context.

import { el, todayISO, fmtDate, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';
import { listGroupLessons, loadTaxonomies } from '../lib/db.js';
import { safeWrite } from '../lib/offline.js';
import { chipGroup, chipArrayEditor } from '../lib/chips.js';

export async function renderGroupLessonsTab(container) {
    const profile = activeProfile();
    container.innerHTML = '';

    const lessons = await listGroupLessons(20);
    const taxos = await loadTaxonomies();

    container.appendChild(el('div', { class: 'btn-row', style: { marginBottom: '12px' } }, [
        el('button', { class: 'btn', onclick: () => openForm() }, ['+ Log a group lesson'])
    ]));

    const formMount = el('div', {});
    container.appendChild(formMount);

    if (!lessons.length) {
        container.appendChild(el('div', { class: 'empty' }, ['no group lessons logged yet']));
    }
    for (const l of lessons) {
        const card = el('div', { class: 'card bordered-accent' });
        card.appendChild(el('div', { class: 'card-head' }, [
            el('h3', {}, [l.club || l.instructor || 'Group lesson']),
            el('span', { class: 'card-meta' }, [fmtDate(l.date), ' · ', `${l.duration_min || '?'}m`])
        ]));
        if (l.drills?.length) {
            card.appendChild(el('div', { class: 'chips' }, l.drills.map((d) =>
                el('span', { class: 'chip on' }, [
                    taxos.drillBySlug.get(d.drill_slug)?.label || d.drill_slug,
                    el('span', { style: { fontFamily: 'var(--mono)', marginLeft: '6px', color: 'var(--cream-dim)', fontSize: '0.8rem' } }, [`${d.comfort_1_10 || '?'}/10`])
                ])
            )));
        }
        if (l.partners?.length) {
            card.appendChild(el('p', { class: 'kicker', style: { marginTop: '8px' } }, [`partners: ${l.partners.join(', ')}`]));
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
                    await safeWrite({ table: 'group_lessons', op: 'delete', payload: {}, match: { id: l.id } });
                    toast('Deleted');
                    renderGroupLessonsTab(container);
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
            el('div', { class: 'field' }, [el('label', {}, ['Instructor']), el('input', { type: 'text', name: 'instructor', value: editing?.instructor || '' })]),
            el('div', { class: 'field' }, [el('label', {}, ['Minutes']), el('input', { type: 'number', name: 'duration_min', value: editing?.duration_min ?? '' })])
        ]));
        form.appendChild(el('div', { class: 'field' }, [el('label', {}, ['Club']), el('input', { type: 'text', name: 'club', value: editing?.club || '' })]));

        const drillState = new Map((editing?.drills || []).map((d) => [d.drill_slug, d]));
        form.appendChild(el('div', { class: 'field' }, [
            el('label', {}, ['Drills taught']),
            (() => {
                const initial = new Set(drillState.keys());
                const fencingDrills = taxos.drills.filter((d) => d.domain === 'fencing');
                const group = chipGroup({
                    options: fencingDrills.map((d) => ({ slug: d.slug, label: d.label })),
                    selected: initial,
                    allowAdd: true,
                    onChange: (vals) => renderDrillDetails(vals),
                    onAdd: async ({ slug, label }) => {
                        const { data, error } = await supa.from('drill_taxonomy').insert({ slug, label, domain: 'fencing' }).select().single();
                        if (error) { toast('Could not add: ' + error.message, 'error'); return null; }
                        taxos.drills.push(data); taxos.drillBySlug.set(data.slug, data);
                        return { slug: data.slug, label: data.label };
                    }
                });
                form._drillGroup = group;
                return group;
            })()
        ]));
        const drillDetails = el('div', {});
        form.appendChild(drillDetails);

        function renderDrillDetails(slugs) {
            drillDetails.innerHTML = '';
            for (const slug of slugs) {
                const cur = drillState.get(slug) || { drill_slug: slug, comfort_1_10: 5, application_context: '' };
                drillState.set(slug, cur);
                const r = el('input', { type: 'range', min: 1, max: 10, value: cur.comfort_1_10, oninput: (e) => { cur.comfort_1_10 = Number(e.target.value); v.textContent = e.target.value; } });
                const v = el('span', { class: 'scale-value' }, [String(cur.comfort_1_10)]);
                const ctx = el('input', { type: 'text', placeholder: 'when to use it in a real bout', value: cur.application_context || '', onchange: (e) => { cur.application_context = e.target.value.trim(); } });
                drillDetails.appendChild(el('div', { class: 'card', style: { padding: '12px', margin: '8px 0' } }, [
                    el('div', { class: 'kicker' }, [taxos.drillBySlug.get(slug)?.label || slug]),
                    el('div', { class: 'scale' }, [r, v]),
                    el('div', { class: 'field', style: { marginTop: '8px' } }, [ctx])
                ]));
            }
        }
        renderDrillDetails(Array.from(drillState.keys()));
        form._drillGroup.onChange = renderDrillDetails;

        // partners
        form.appendChild(el('div', { class: 'field', style: { marginTop: '12px' } }, [
            el('label', {}, ['Partners drilled with (optional)'])
        ]));
        const partners = chipArrayEditor({ values: editing?.partners || [], placeholder: 'name, then enter' });
        form.appendChild(partners);

        form.appendChild(el('div', { class: 'btn-row right', style: { marginTop: '12px' } }, [
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => formMount.innerHTML = '' }, ['Cancel']),
            el('button', { type: 'submit', class: 'btn' }, [editing ? 'Save changes' : 'Save lesson'])
        ]));

        async function save() {
            const fd = new FormData(form);
            const slugs = form._drillGroup.getValues();
            const drills = slugs.map((s) => drillState.get(s)).filter(Boolean);
            const payload = {
                profile_id: profile.id,
                date: fd.get('date'),
                instructor: (fd.get('instructor') || '').toString().trim() || null,
                duration_min: fd.get('duration_min') ? Number(fd.get('duration_min')) : null,
                club: (fd.get('club') || '').toString().trim() || null,
                drills,
                partners: partners.getValues()
            };
            try {
                if (editing) await safeWrite({ table: 'group_lessons', op: 'update', payload, match: { id: editing.id } });
                else         await safeWrite({ table: 'group_lessons', op: 'insert', payload });
                toast('Saved');
                renderGroupLessonsTab(container);
            } catch (e) { toast('Save failed: ' + e.message, 'error'); }
        }
    }
}
