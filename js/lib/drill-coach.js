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
    const card = el('section', { class: 'card', style: { margin: '12px var(--gut)' } });
    card.appendChild(el('div', {
        style: 'font-family:var(--eg-mono,monospace);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;margin-bottom:8px;'
    }, [`🧠 Coach card · ${profile.name.split(' ')[0]} · this week`]));

    for (const s of summaryList) {
        const w = s.weakness;
        const block = el('div', { style: 'padding:10px 0;border-top:1px solid rgba(0,0,0,0.06);' });

        // Header: weakness + top stage
        block.appendChild(el('div', {
            style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px;'
        }, [
            el('strong', { style: 'font-size:14px;' }, [`${w.emoji} ${w.label}`]),
            el('span', {
                style: 'font-family:var(--eg-mono,monospace);font-size:11px;color:#6B7280;'
            }, [`top stage: ${s.top_stage.emoji} ${s.top_stage.label}`])
        ]));

        // Transitions
        for (const t of s.transitions) {
            block.appendChild(el('div', {
                style: 'font-size:13px;color:#1f7a1f;margin:2px 0;'
            }, [`✓ ${t.drill}: ${t.from.emoji} ${t.from.label} → ${t.to.emoji} ${t.to.label}`]));
        }

        // Stalls
        for (const st of s.stalls) {
            block.appendChild(el('div', {
                style: 'font-size:13px;color:#9b2230;margin:2px 0;'
            }, [`⚠ Stalled at ${st.stage.emoji} ${st.stage.label}: ${st.tag} — try a coach-paced session or up the rep target.`]));
        }

        // Bout signal
        if (s.bout_signal) {
            const bs = s.bout_signal;
            const txt = `Bout signal (30d): ${bs.wins}-${bs.losses} (${bs.pct}%) vs ${w.label.toLowerCase()}`;
            block.appendChild(el('div', {
                style: `font-size:13px;color:${bs.priority === 'high' ? '#9b2230' : '#6B7280'};margin:2px 0;`
            }, [bs.priority === 'high' ? `🎯 ${txt} — this is your top drill priority.` : `· ${txt}`]));
        } else {
            block.appendChild(el('div', {
                style: 'font-size:12px;color:#6B7280;margin:2px 0;'
            }, ['· No recent bouts tagged with this archetype — tag opponents to track.']));
        }

        // Next focus
        if (s.next_focus) {
            block.appendChild(el('div', {
                style: 'font-size:13px;color:#1A1D24;margin-top:4px;'
            }, [
                el('strong', { style: 'font-weight:700;' }, ['Next session: ']),
                `${s.next_focus.tag} — ${nextFocusBlurb(s.next_focus.stage)}`
            ]));
        }

        card.appendChild(block);
    }
    return card;
}

function nextFocusBlurb(stage) {
    switch (stage.idx) {
        case 0: return 'get 2 clean sessions logged at "ok" or better to unlock 🌿 Form.';
        case 1: return 'rack up sessions at "sharp" to reach 🌳 Tempo. Aim for 3 of next 5 at 💪+.';
        case 2: return 'push pace to "fast". 2 fast-rated sessions unlock ⚔️ Pressure.';
        case 3: return 'use this in a real bout and tag it to unlock 🏆 Match-ready.';
        default: return 'maintain — already match-ready. Use it.';
    }
}
