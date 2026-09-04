// drill-coach.js
// Weekly synthesis: drill sessions + bouts → coaching narrative.
// Per-weakness card with stage transitions, stall warnings, bout signals,
// and a recommended focus for next session.

import { STAGES, computeStage, groupByDrill, listAllDrillSessions, tagToSlug } from './drill-mastery.js';
import { getWeaknessDrills } from './weakness-drills.js';
import { listBouts, listOpponents } from './db.js';

// Build a per-weakness narrative for a profile.
// Returns: [{ weakness, stage_summary, transitions, stall, bout_signal, next_focus }]
export async function buildWeeklyCoachSummary(profile) {
    const weaknesses = getWeaknessDrills(profile.role);
    if (!weaknesses.length) return [];

    // Pull 60 days of sessions + 30 days of bouts so we have enough signal
    const [sessions, bouts, opponents] = await Promise.all([
        listAllDrillSessions(profile.id, 60),
        listBouts({ limit: 60 }),
        listOpponents()
    ]);
    const oppById = new Map(opponents.map(o => [o.id, o]));
    const byDrill = groupByDrill(sessions);

    const now = Date.now();
    const day = 86400000;
    const last7 = now - 7 * day;
    const last30 = now - 30 * day;

    const out = [];
    for (const w of weaknesses) {
        // For this weakness, get all the drills (technique + body) and compute their stages
        const drills = [...(w.technique || []), ...(w.body || [])];
        const drillStages = drills.map(d => {
            const slug = tagToSlug(d.tag);
            const sList = byDrill.get(slug) || [];
            const stage = computeStage(sList);
            const lastSession = sList[0]; // already sorted desc
            return {
                tag: d.tag,
                slug,
                stage,
                sessionsCount: sList.length,
                lastSessionAt: lastSession ? new Date(lastSession.created_at).getTime() : null,
                last7count: sList.filter(s => new Date(s.created_at).getTime() >= last7).length
            };
        });

        // Stage summary: aggregate top stage
        const stageDist = STAGES.map(st => drillStages.filter(d => d.stage.idx === st.idx).length);
        const topStageIdx = drillStages.reduce((m, d) => Math.max(m, d.stage.idx), 0);

        // Detect transitions in the last 7d:
        //   for each drill, check if a session from >7d ago would have given a LOWER stage
        const transitions = [];
        for (const d of drillStages) {
            const sList = byDrill.get(d.slug) || [];
            const olderSessions = sList.filter(s => new Date(s.created_at).getTime() < last7);
            if (olderSessions.length === sList.length) continue;  // no new sessions
            const olderStage = computeStage(olderSessions);
            if (d.stage.idx > olderStage.idx) {
                transitions.push({ drill: d.tag, from: olderStage, to: d.stage });
            }
        }

        // Stall: any drill with >=3 sessions in the last 30d but stage unchanged at <=Form
        const stalls = drillStages.filter(d => {
            const sList = byDrill.get(d.slug) || [];
            const recent = sList.filter(s => new Date(s.created_at).getTime() >= last30);
            return recent.length >= 3 && d.stage.idx <= 1;
        });

        // Bout signal: how many last-30d bouts involved an opponent with this weakness archetype, and W/L
        let wins = 0, losses = 0;
        for (const b of bouts) {
            if (!b.date) continue;
            const bd = new Date(b.date).getTime();
            if (bd < last30) continue;
            const o = oppById.get(b.opponent_id);
            if (!o || !Array.isArray(o.archetypes) || !o.archetypes.includes(w.slug)) continue;
            if (b.outcome === 'win') wins++;
            else if (b.outcome === 'loss') losses++;
        }
        const boutTotal = wins + losses;
        const boutSignal = boutTotal === 0 ? null : {
            wins, losses, pct: Math.round(100 * wins / boutTotal),
            priority: (boutTotal >= 3 && wins / boutTotal < 0.5) ? 'high' : 'normal'
        };

        // Next focus: the lowest-stage drill that has the most recent sessions
        const focusDrill = drillStages
            .filter(d => d.sessionsCount > 0 && d.stage.idx < 4)
            .sort((a, b) => a.stage.idx - b.stage.idx || (b.lastSessionAt || 0) - (a.lastSessionAt || 0))[0]
            || drillStages.find(d => d.sessionsCount === 0)  // un-touched drills
            || drillStages[0];

        out.push({
            weakness: w,
            top_stage: STAGES[topStageIdx],
            stage_dist: stageDist,
            drill_stages: drillStages,
            transitions,
            stalls,
            bout_signal: boutSignal,
            next_focus: focusDrill
        });
    }
    return out;
}

// Render a synthesis card. Returns a DOM element.
export function renderCoachCard(el, summaryList, profile) {
    if (!summaryList.length) return el('div');
    const card = el('section', { class: 'card coach-card', style: { margin: '12px var(--gut)' } });
    card.appendChild(el('div', { class: 'label coach-card-eyebrow' }, [
        `Coach card · ${profile.name.split(' ')[0]} · this week`
    ]));

    for (const s of summaryList) {
        const w = s.weakness;
        const block = el('div', { class: 'coach-block' });

        // Header: weakness + top stage. The archetype data carries an emoji;
        // it is not rendered.
        block.appendChild(el('div', { class: 'coach-block-head' }, [
            el('span', { class: 'coach-block-title' }, [w.label]),
            el('span', { class: 'coach-stage' }, [`top stage · ${s.top_stage.label}`])
        ]));

        for (const t of s.transitions) {
            block.appendChild(el('div', { class: 'coach-line is-good' }, [
                `${t.drill}: ${t.from.label} → ${t.to.label}`
            ]));
        }
        for (const st of s.stalls) {
            block.appendChild(el('div', { class: 'coach-line is-bad' }, [
                `Stalled at ${st.stage.label}: ${String(st.tag).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim()} — try a coach-paced session or raise the rep target.`
            ]));
        }

        if (s.bout_signal) {
            const bs = s.bout_signal;
            const txt = `Last 30 days: ${bs.wins}–${bs.losses} (${bs.pct}%) against ${w.label.toLowerCase()}`;
            block.appendChild(el('div', { class: 'coach-line ' + (bs.priority === 'high' ? 'is-bad' : 'is-mute') }, [
                bs.priority === 'high' ? `${txt} — this is the top drill priority.` : txt
            ]));
        } else {
            block.appendChild(el('div', { class: 'coach-line is-mute' }, [
                'No recent bouts tagged with this archetype — tag opponents to track it.'
            ]));
        }

        if (s.next_focus) {
            block.appendChild(el('div', { class: 'coach-next' }, [
                el('span', { class: 'label' }, ['Next session']),
                el('span', { class: 'coach-next-text' }, [`${String(s.next_focus.tag).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim()} — ${nextFocusBlurb(s.next_focus.stage)}`])
            ]));
        }
        card.appendChild(block);
    }
    return card;
}

function nextFocusBlurb(stage) {
    switch (stage.idx) {
        case 0: return 'log two clean sessions at "ok" or better to reach Form.';
        case 1: return 'log sessions at "sharp" to reach Tempo — three of the next five.';
        case 2: return 'push the pace to "fast" — two fast-rated sessions reach Pressure.';
        case 3: return 'use it in a real bout and tag the bout to reach Match-ready.';
        default: return 'maintain — already match-ready. Use it.';
    }
}
