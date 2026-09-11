// Taught vs beaten by - the join that turns lessons into an answer.
//
// From the lessons review (2026-09-11): Raedyn lost 1-15 to a fencer who
// waited and caught his blade, and the answer to that fencer had been in his
// own lesson log for a week. Kaylan rated "pull back when they counter, then
// finish" a 9, and was counter-attacked four times three weeks later.
//
// Every way an opponent scored on him in the last 60 days of journaled bouts
// is matched to the lesson topics of the last 45 days through tactic_answers
// (which topic families answer which conceded action). Two lists come out:
// beating him and not yet taught, and taught but not holding yet.

import { el } from './util.js';
import { supa } from './supa.js';

const INK = 'var(--ink, #1A1D24)';
// Literal: var(--ink-mute) composites below AA on the cream surface.
const INK_MUTE = '#6B7280';
const WARN = '#B45309';
const BOUT_DAYS = 60;
const LESSON_DAYS = 45;
const HELD_LABEL = { fed: 'fed', resisted: 'against resistance', bout: 'in a bout' };

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const short = (s) => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

export async function taughtVsBeaten(profile) {
    const sinceB = daysAgo(BOUT_DAYS), sinceL = daysAgo(LESSON_DAYS);
    const [bouts, priv, grp, answers, tactics, topics] = await Promise.all([
        supa.from('bouts').select('date,conceded_actions,failure_patterns').eq('profile_id', profile.id).is('deleted_at', null).gte('date', sinceB).order('date', { ascending: false }).limit(60),
        supa.from('private_lessons').select('date,coach,kind,topics').eq('profile_id', profile.id).is('deleted_at', null).gte('date', sinceL).order('date', { ascending: false }),
        supa.from('group_lessons').select('date,instructor,kind,drills').eq('profile_id', profile.id).is('deleted_at', null).gte('date', sinceL).order('date', { ascending: false }),
        supa.from('tactic_answers').select('failure_slug,families,ask'),
        supa.from('tactic_taxonomy').select('slug,label'),
        supa.from('topic_taxonomy').select('slug,label')
    ]);
    const tacticLabel = new Map((tactics.data || []).map((t) => [t.slug, t.label]));
    const topicLabel = new Map((topics.data || []).map((t) => [t.slug, t.label]));

    // Touches conceded, by the way they were scored.
    const conceded = new Map();
    for (const b of bouts.data || []) {
        if (Array.isArray(b.conceded_actions) && b.conceded_actions.length) {
            for (const c of b.conceded_actions) {
                const slug = String(c.tactic_slug || c.slug || '').toLowerCase();
                if (slug) conceded.set(slug, (conceded.get(slug) || 0) + (Number(c.touches) || 1));
            }
        } else if (Array.isArray(b.failure_patterns)) {
            for (const s of b.failure_patterns) { const slug = String(s).toLowerCase(); conceded.set(slug, (conceded.get(slug) || 0) + 1); }
        }
    }

    // Topics taught, most recent first: private lesson topics and group drills.
    const taught = [];
    for (const l of priv.data || []) for (const t of l.topics || []) {
        taught.push({ slug: String(t.topic_slug || '').toLowerCase(), date: l.date, coach: l.coach, held: t.held || null, mastery: t.mastery_1_10 ?? null, failed: t.failed || '', kind: l.kind || null });
    }
    for (const g of grp.data || []) for (const d of g.drills || []) {
        taught.push({ slug: String(d.drill_slug || '').toLowerCase(), date: g.date, coach: g.instructor, held: d.held || null, mastery: d.comfort_1_10 ?? null, failed: d.failed || '', kind: g.kind || null });
    }

    const byFailure = new Map((answers.data || []).map((a) => [a.failure_slug, a]));
    const matchTaught = (families) => {
        const res = families.map((f) => new RegExp(String(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
        const seen = new Set(); const out = [];
        for (const t of taught) {
            if (!res.some((re) => re.test(t.slug))) continue;
            if (seen.has(t.slug)) continue;      // most recent lesson on that topic wins
            seen.add(t.slug); out.push(t);
        }
        return out;
    };

    const notTaught = [], notHolding = [];
    for (const [slug, touches] of [...conceded.entries()].sort((a, b) => b[1] - a[1])) {
        if (touches < 2) continue;
        const a = byFailure.get(slug);
        const label = tacticLabel.get(slug) || slug.replace(/-/g, ' ');
        if (!a) { notTaught.push({ slug, label, touches, ask: null }); continue; }
        const hits = matchTaught(a.families);
        if (hits.length) notHolding.push({ slug, label, touches, topics: hits });
        else notTaught.push({ slug, label, touches, ask: a.ask });
    }
    return {
        notTaught, notHolding, topicLabel,
        bouts: (bouts.data || []).length, lessons: (priv.data || []).length + (grp.data || []).length,
        sinceB, sinceL, boutsWithTallies: (bouts.data || []).filter((b) => (b.conceded_actions?.length) || (b.failure_patterns?.length)).length
    };
}

export async function renderTaughtVsBeaten(profile) {
    const r = await taughtVsBeaten(profile);
    if (!r.bouts && !r.lessons) return null;
    const card = el('div', { class: 'card', style: { margin: '0 var(--gut) 12px' } });
    card.appendChild(el('div', { class: 'label-row', style: { padding: '0' } }, [
        el('span', { class: 'label' }, ['Taught vs beaten by']),
        el('span', { class: 'label', style: { color: INK_MUTE } }, [`${r.boutsWithTallies} bout${r.boutsWithTallies === 1 ? '' : 's'} tallied · ${r.lessons} lesson${r.lessons === 1 ? '' : 's'}`])
    ]));

    const section = (title, color) => el('div', { style: { fontFamily: 'var(--mono, monospace)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color, margin: '12px 0 6px' } }, [title]);
    const line = (text, color = INK) => el('div', { style: { fontFamily: 'var(--serif)', fontSize: '15px', lineHeight: '1.5', color, margin: '2px 0' } }, [text]);

    if (!r.boutsWithTallies) {
        card.appendChild(line(`No bout in the last ${BOUT_DAYS} days has the opponent's touches tallied. Tally one and this fills in.`, INK_MUTE));
        return card;
    }
    if (r.notTaught.length) {
        card.appendChild(section('Beating him, not yet taught', WARN));
        for (const x of r.notTaught) {
            card.appendChild(el('div', { style: { margin: '4px 0 8px' } }, [
                line(`${x.label} · ${x.touches} touch${x.touches === 1 ? '' : 'es'}`),
                x.ask ? line(`ask for: ${x.ask}`, INK_MUTE) : null
            ]));
        }
    }
    if (r.notHolding.length) {
        card.appendChild(section('Taught, not holding yet', INK));
        for (const x of r.notHolding) {
            const t = x.topics[0];
            const where = t.held ? HELD_LABEL[t.held] || t.held : (t.mastery != null ? `rated ${t.mastery}` : '');
            const more = x.topics.length > 1 ? ` (+${x.topics.length - 1} more)` : '';
            card.appendChild(el('div', { style: { margin: '4px 0 8px' } }, [
                line(`${x.label} · ${x.touches} touch${x.touches === 1 ? '' : 'es'}`),
                line(`taught as ${r.topicLabel.get(t.slug) || t.slug.replace(/-/g, ' ')}${t.coach ? ` by ${t.coach}` : ''} on ${short(t.date)}${where ? `, ${where}` : ''}${t.failed ? ` · failed: ${t.failed}` : ''}${more}`, INK_MUTE)
            ]));
        }
    }
    if (!r.notTaught.length && !r.notHolding.length) {
        card.appendChild(line('Nothing scored on him twice in the last 60 days of tallied bouts.', INK_MUTE));
    }
    card.appendChild(el('div', { class: 'label', style: { color: INK_MUTE, marginTop: '10px' } }, [
        `From ${r.boutsWithTallies} tallied bout${r.boutsWithTallies === 1 ? '' : 's'} since ${short(r.sinceB)} and ${r.lessons} lesson${r.lessons === 1 ? '' : 's'} since ${short(r.sinceL)}.`
    ]));
    return card;
}
