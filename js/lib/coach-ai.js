// AI Coach — rule-based training generator.
// Reads bouts + lessons + scout cards → outputs ranked, quantified drills.
// No external API call; everything runs client-side.

// =====================================================
// Tactic-to-drill prescription table
// =====================================================
const TACTIC_DRILLS = {
    'parry-riposte': {
        name: 'Parry-4 + immediate straight riposte',
        reps: 40, sets: 3, restSec: 30,
        category: 'fencing-technique',
        why: 'Closes the line when opponents push attacks; lands extension-only touches.'
    },
    'parry-riposte-retreating': {
        name: 'Retreat-then-parry-4 drill',
        reps: 30, sets: 3, restSec: 45,
        category: 'fencing-technique',
        why: 'Buys distance while still scoring on their finish.'
    },
    'attack-in-prep': {
        name: 'Catch-the-prep drill — partner steps, you lunge mid-step',
        reps: 20, sets: 4, restSec: 60,
        category: 'fencing-technique',
        why: 'Hits the opponent while they are mid-preparation, exploits their tempo.'
    },
    'beat-attack': {
        name: 'Beat-4 → straight attack',
        reps: 30, sets: 3, restSec: 30,
        category: 'fencing-technique',
        why: 'Disrupts blade-aware fencers who rely on blade contact.'
    },
    'compound-attack': {
        name: 'Feint-disengage-finish (1-2)',
        reps: 25, sets: 3, restSec: 45,
        category: 'fencing-technique',
        why: 'Draws the parry then hits the open line — beats predictable defenders.'
    },
    'counter-attack': {
        name: 'Sixte counter to high attacks',
        reps: 20, sets: 3, restSec: 45,
        category: 'fencing-technique',
        why: 'Lands during their attack when distance is wrong for full parry.'
    },
    'distance-control': {
        name: 'Tip-to-tip pursuit drill (Kevin variation)',
        reps: 30, sets: 3, restSec: 60,
        category: 'footwork',
        why: 'Forces you to find arm-extension distance — Kevin\'s core lesson.'
    },
    'footwork-explosive': {
        name: 'Broad jumps + step-lunges',
        reps: 20, sets: 4, restSec: 45,
        category: 'explosive',
        why: 'Builds the snap that makes "hit-by-extending-the-arm" actually score.'
    },
    'point-control': {
        name: 'Wall point-control: tip-to-target 10x each line',
        reps: 40, sets: 2, restSec: 30,
        category: 'fencing-technique',
        why: 'Sharpens finish quality so attacks don\'t bounce off the guard.'
    }
};

// =====================================================
// Loss-pattern detector
// =====================================================
function losesToFastPushers(bouts) {
    // Lost AND reflection mentions push/march/fast-step/lunge
    return bouts.filter(b => b.outcome === 'loss' && /push|march|fast.*step|lunge|aggressive/i.test(b.reflection || '')).length;
}
function losesToCounterAttackers(bouts) {
    return bouts.filter(b => b.outcome === 'loss' && /counter|counterattack|when.*i.*push.*counter/i.test(b.reflection || '')).length;
}
function losesToFlickers(bouts) {
    return bouts.filter(b => b.outcome === 'loss' && /flick|over.*back|over.*shoulder/i.test(b.reflection || '')).length;
}
function highRatedLossCount(bouts) {
    return bouts.filter(b => b.outcome === 'loss' && /^[AB]\d{2}$/i.test(b.opponent_rating || '')).length;
}
function losesWithoutReflection(bouts) {
    return bouts.filter(b => b.outcome === 'loss' && (!b.reflection || !b.reflection.trim())).length;
}
function tacticsThatFailed(bouts) {
    // Aggregate scoring_actions across all bouts → return tactic slugs with > 50% miss rate
    const agg = new Map();
    for (const b of bouts) {
        for (const sa of (b.scoring_actions || [])) {
            const cur = agg.get(sa.tactic_slug) || { attempts: 0, successes: 0 };
            cur.attempts += sa.attempts || 0;
            cur.successes += sa.successes || 0;
            agg.set(sa.tactic_slug, cur);
        }
    }
    const struggling = [];
    for (const [slug, stat] of agg.entries()) {
        if (stat.attempts >= 2 && stat.successes / stat.attempts < 0.5) {
            struggling.push({ slug, attempts: stat.attempts, successes: stat.successes });
        }
    }
    return struggling;
}

// =====================================================
// Lesson topic priority — low mastery = high priority
// =====================================================
function recentLessonTopics(privateLessons, groupLessons) {
    const all = [];
    for (const l of [...privateLessons, ...groupLessons]) {
        for (const t of (l.topics || [])) {
            all.push({
                slug: t.topic_slug,
                mastery: t.mastery_1_10 || 5,
                lessonDate: l.date,
                coach: l.coach,
                quote: l.coach_quote,
                practicePlan: l.practice_plan,
                notes: t.application_notes
            });
        }
    }
    // Sort by lowest mastery first (those need work)
    return all.sort((a, b) => a.mastery - b.mastery);
}

// =====================================================
// Main generator
// =====================================================
export function generateCoachTips(data) {
    const bouts = data.bouts || [];
    const privates = data.private_lessons || [];
    const groups = data.group_lessons || [];
    const losses = bouts.filter(b => b.outcome === 'loss');
    const tips = [];

    // Diagnose loss patterns
    const fastPusherLosses = losesToFastPushers(bouts);
    const counterLosses = losesToCounterAttackers(bouts);
    const flickLosses = losesToFlickers(bouts);
    const highRatedLosses = highRatedLossCount(bouts);
    const noReflLosses = losesWithoutReflection(bouts);
    const strugglingTactics = tacticsThatFailed(bouts);
    const lessonTopics = recentLessonTopics(privates, groups);

    // === PRIORITY 1: lesson topic with lowest mastery (active focus) ===
    if (lessonTopics.length > 0) {
        const top = lessonTopics[0];
        const drillKey = mapTopicToDrill(top.slug);
        const drill = TACTIC_DRILLS[drillKey] || null;
        tips.push({
            priority: 1,
            label: 'YOUR ACTIVE LESSON FOCUS',
            title: prettifyTopicSlug(top.slug),
            mastery: top.mastery,
            from: `${top.coach || 'Coach'} · ${top.lessonDate}`,
            drill: drill ? {
                name: drill.name,
                reps: drill.reps, sets: drill.sets, restSec: drill.restSec,
                xpPerSession: drill.reps * drill.sets * 1,
                frequency: '5 days/week',
                xpPerWeek: drill.reps * drill.sets * 5
            } : null,
            coachQuote: top.quote,
            why: drill?.why || top.practicePlan?.slice(0, 200) || top.notes
        });
    }

    // === PRIORITY 2: address the most common loss pattern ===
    const patterns = [];
    if (fastPusherLosses >= 1) patterns.push({ count: fastPusherLosses, drill: 'parry-riposte-retreating', reason: 'fast-push attackers' });
    if (counterLosses >= 1)   patterns.push({ count: counterLosses,    drill: 'distance-control',         reason: 'opponents counter-attacking your finish' });
    if (flickLosses >= 1)     patterns.push({ count: flickLosses,      drill: 'point-control',            reason: 'opponents flicking over your guard' });
    if (highRatedLosses >= 1) patterns.push({ count: highRatedLosses,  drill: 'attack-in-prep',           reason: 'higher-rated opponents owning tempo' });
    patterns.sort((a, b) => b.count - a.count);

    if (patterns.length > 0) {
        const top = patterns[0];
        const drill = TACTIC_DRILLS[top.drill];
        tips.push({
            priority: 2,
            label: 'LOSS PATTERN — TRAIN THE ANTIDOTE',
            title: `Beat the ${top.reason}`,
            diagnosis: `${top.count} of your recent losses fit this pattern.`,
            drill: drill ? {
                name: drill.name,
                reps: drill.reps, sets: drill.sets, restSec: drill.restSec,
                xpPerSession: drill.reps * drill.sets * 1,
                frequency: '3 days/week',
                xpPerWeek: drill.reps * drill.sets * 3
            } : null,
            why: drill?.why
        });
    }

    // === PRIORITY 3: a tactic that's failing in your scoring_actions ===
    if (strugglingTactics.length > 0) {
        const top = strugglingTactics.sort((a, b) => b.attempts - a.attempts)[0];
        const drill = TACTIC_DRILLS[top.slug];
        if (drill) {
            tips.push({
                priority: 3,
                label: 'TACTIC TO FIX',
                title: prettifyTopicSlug(top.slug),
                diagnosis: `You\'ve tried "${prettifyTopicSlug(top.slug)}" ${top.attempts} times in recent bouts and only landed ${top.successes}. Miss rate: ${Math.round(100 * (1 - top.successes / top.attempts))}%.`,
                drill: {
                    name: drill.name,
                    reps: drill.reps, sets: drill.sets, restSec: drill.restSec,
                    xpPerSession: drill.reps * drill.sets * 1,
                    frequency: '2 days/week',
                    xpPerWeek: drill.reps * drill.sets * 2
                },
                why: drill.why
            });
        }
    }

    // === REMINDERS / META ===
    const reminders = [];
    if (noReflLosses > 0) reminders.push(`📝 ${noReflLosses} loss(es) have no reflection logged. Fill them in for free MIND XP (+10 each) and better future diagnoses.`);
    if (bouts.length === 0) reminders.push('🎯 Log your first practice bout this week — even informal touches count. STRIKE XP starts ticking the moment data lands.');
    if ((data.opponent_swots || []).length === 0 && bouts.length > 0) reminders.push('🔍 You\'ve fenced opponents but profiled 0 of them. Add 4 SWOT chips per opponent = +20 MIND XP each. That\'s easy levels.');

    // Weekly XP forecast if they follow the plan
    let weeklyXp = 0;
    for (const t of tips) {
        if (t.drill?.xpPerWeek) weeklyXp += t.drill.xpPerWeek;
    }

    return {
        generatedAt: new Date().toISOString(),
        tips,
        reminders,
        weeklyXpForecast: weeklyXp,
        boutCount: bouts.length,
        lossCount: losses.length,
        winCount: bouts.length - losses.length
    };
}

function prettifyTopicSlug(slug) {
    return (slug || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function mapTopicToDrill(slug) {
    const direct = TACTIC_DRILLS[slug] ? slug : null;
    if (direct) return direct;
    // Heuristic fallbacks
    if (/distance/.test(slug)) return 'distance-control';
    if (/parry.*retreat|retreat.*parry/.test(slug)) return 'parry-riposte-retreating';
    if (/parry|riposte/.test(slug)) return 'parry-riposte';
    if (/attack.*prep|prep.*attack/.test(slug)) return 'attack-in-prep';
    if (/beat/.test(slug)) return 'beat-attack';
    if (/compound|disengage/.test(slug)) return 'compound-attack';
    if (/counter/.test(slug)) return 'counter-attack';
    if (/footwork|jump|explosive/.test(slug)) return 'footwork-explosive';
    if (/point|finish/.test(slug)) return 'point-control';
    return 'parry-riposte';  // fallback
}
