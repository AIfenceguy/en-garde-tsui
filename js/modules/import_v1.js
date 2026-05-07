// v1 importer.
// Expected v1 shape (per brief §10):
// localStorage key 'tsui_brothers_log_v1' →
//   { raedyn: { bouts:[], instincts:[], sessions:[] },
//     kaylan: { bouts:[], ratings:[], sessions:[] } }
//
// Strategy: paste-JSON workflow, preview a row count per category, then
// dispatch to the right tables tied to the matching profile by role.
// Unknown fields are logged and skipped, not aborted (assumption A16).

import { el, toast, todayISO, slugify } from '../lib/util.js';
import { getState } from '../lib/state.js';
import { supa } from '../lib/supa.js';

export async function mountImportV1(root) {
    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Import v1 data']),
        el('span', { class: 'meta' }, ['one-time migration'])
    ]));

    root.appendChild(el('div', { class: 'card' }, [
        el('p', {}, ['Paste the JSON exported from the v1 tracker below. We\'ll map it to the new schema and write rows for each profile (Raedyn, Kaylan) by role.']),
        el('p', { class: 'kicker' }, ['safe to re-run; existing rows with the same date + opponent are not overwritten.'])
    ]));

    const ta = el('textarea', { rows: 12, placeholder: 'Paste v1 JSON here…' });
    const previewBox = el('div', {});

    root.appendChild(el('div', { class: 'card' }, [ta]));
    root.appendChild(el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-ghost', onclick: () => preview() }, ['Preview']),
        el('button', { class: 'btn', onclick: () => doImport() }, ['Import'])
    ]));
    root.appendChild(previewBox);

    function parse() {
        const raw = ta.value.trim();
        if (!raw) return null;
        try { return JSON.parse(raw); }
        catch (e) { toast('Invalid JSON: ' + e.message, 'error'); return null; }
    }

    function preview() {
        const data = parse();
        if (!data) return;
        previewBox.innerHTML = '';
        previewBox.appendChild(el('div', { class: 'card' }, [
            el('h4', {}, ['Preview']),
            section('Raedyn', data.raedyn),
            section('Kaylan', data.kaylan)
        ]));

        function section(name, p) {
            if (!p) return el('p', { class: 'dim italic' }, [`No data for ${name}`]);
            return el('div', { style: { marginBottom: '12px' } }, [
                el('div', { class: 'kicker' }, [name]),
                el('ul', {}, [
                    el('li', {}, [`${(p.bouts || []).length} bouts`]),
                    el('li', {}, [`${(p.sessions || []).length} physical sessions`]),
                    name === 'Raedyn' ? el('li', {}, [`${(p.instincts || []).length} instinct entries`]) : null,
                    name === 'Kaylan' ? el('li', {}, [`${(p.ratings || []).length} speed self-ratings`]) : null
                ])
            ]);
        }
    }

    async function doImport() {
        const data = parse();
        if (!data) return;
        const { profiles } = getState();
        const raedyn = profiles.find((p) => p.role === 'raedyn');
        const kaylan = profiles.find((p) => p.role === 'kaylan');
        if (!raedyn || !kaylan) { toast('Profiles missing — sign out and back in.', 'error'); return; }

        const summary = { bouts: 0, physical: 0, mental: 0, skipped: [] };

        for (const [role, profile] of [['raedyn', raedyn], ['kaylan', kaylan]]) {
            const p = data[role];
            if (!p) continue;

            // bouts
            for (const b of (p.bouts || [])) {
                const payload = mapBout(b, profile.id, summary.skipped);
                if (!payload) continue;
                const exists = await supa.from('bouts').select('id')
                    .eq('profile_id', profile.id)
                    .eq('date', payload.date)
                    .ilike('opponent_name', payload.opponent_name || '')
                    .limit(1);
                if (exists.data && exists.data.length) continue;
                const { error } = await supa.from('bouts').insert(payload);
                if (!error) summary.bouts++;
                else summary.skipped.push(`bout ${payload.date}: ${error.message}`);
            }

            // physical sessions
            for (const s of (p.sessions || [])) {
                const payload = mapSession(s, profile.id, summary.skipped);
                if (!payload) continue;
                const { error } = await supa.from('physical_sessions').upsert(payload, { onConflict: 'profile_id,date' });
                if (!error) summary.physical++;
                else summary.skipped.push(`physical ${payload.date}: ${error.message}`);
            }

            // mental rollup — instincts (raedyn) / ratings (kaylan) get folded into mental_sessions per date
            const mentalByDate = new Map();
            for (const i of (p.instincts || [])) {
                const date = i.date || todayISO();
                if (!mentalByDate.has(date)) mentalByDate.set(date, { instinct_catalog: [] });
                mentalByDate.get(date).instinct_catalog.push({ move: i.move || i.text || String(i) });
            }
            for (const r of (p.ratings || [])) {
                const date = r.date || todayISO();
                if (!mentalByDate.has(date)) mentalByDate.set(date, {});
                mentalByDate.get(date).speed_self_rating = Number(r.value || r.rating || r);
            }
            for (const [date, patch] of mentalByDate) {
                const payload = { profile_id: profile.id, date, ...patch };
                const { error } = await supa.from('mental_sessions').upsert(payload, { onConflict: 'profile_id,date' });
                if (!error) summary.mental++;
                else summary.skipped.push(`mental ${date}: ${error.message}`);
            }
        }

        previewBox.innerHTML = '';
        previewBox.appendChild(el('div', { class: 'card', style: { borderLeft: '3px solid var(--success)' } }, [
            el('h4', {}, ['Import complete']),
            el('ul', {}, [
                el('li', {}, [`${summary.bouts} bouts imported`]),
                el('li', {}, [`${summary.physical} physical sessions imported`]),
                el('li', {}, [`${summary.mental} mental sessions imported`])
            ]),
            summary.skipped.length ? el('details', {}, [
                el('summary', { class: 'kicker', style: { cursor: 'pointer' } }, [`${summary.skipped.length} entries skipped`]),
                el('pre', { class: 'mono dim', style: { whiteSpace: 'pre-wrap', fontSize: '0.78rem' } }, [summary.skipped.join('\n')])
            ]) : null
        ]));
        toast('Import complete');
    }
}

function mapBout(b, profileId, skipped) {
    if (!b || !b.date) { skipped.push('bout missing date'); return null; }
    const my = b.my_score ?? b.mine ?? b.me ?? null;
    const their = b.their_score ?? b.theirs ?? b.them ?? null;
    const outcome = my != null && their != null ? (my === their ? 'draw' : (my > their ? 'win' : 'loss')) : null;
    return {
        profile_id: profileId,
        date: b.date,
        location: b.location || null,
        context: b.context || null,
        opponent_name: b.opponent_name || b.opponent || b.name || null,
        opponent_rating: b.opponent_rating || b.rating || null,
        opponent_club: b.opponent_club || b.club || null,
        my_score: my,
        their_score: their,
        outcome,
        scoring_actions: Array.isArray(b.scoring_actions) ? b.scoring_actions : [],
        failure_patterns: Array.isArray(b.failure_patterns) ? b.failure_patterns : [],
        reflection: b.reflection || b.notes || null,
        coach_feedback: b.coach_feedback || null
    };
}

function mapSession(s, profileId, skipped) {
    if (!s || !s.date) { skipped.push('session missing date'); return null; }
    const drills = Array.isArray(s.drills_completed) ? s.drills_completed
        : Array.isArray(s.drills) ? s.drills.map((d) => typeof d === 'string'
            ? { drill_slug: slugify(d), label: d, target_reps: 0, actual_reps: 0, done: true }
            : d)
        : [];
    return {
        profile_id: profileId,
        date: s.date,
        drills_completed: drills,
        energy_1_10: s.energy_1_10 ?? s.energy ?? null,
        soreness_location: s.soreness_location || null,
        soreness_severity: s.soreness_severity ?? null,
        sleep_hours: s.sleep_hours ?? null,
        injury_flag: !!s.injury_flag,
        injury_notes: s.injury_notes || null
    };
}
