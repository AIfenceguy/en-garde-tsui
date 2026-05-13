// Levels & XP — gamified progress for Raedyn / Kaylan.
// Four abilities, each levels up from XP scraped from data they already log:
//   STRIKE  — offensive (touches landed + bout wins)
//   GUARD   — defensive (touches NOT given up)
//   ENGINE  — physical conditioning (sum of reps + recovery bonuses)
//   MIND    — tactical IQ (meditation min + SWOTs + reflections + lesson mastery)
//
// 100 XP = 1 level. Tier colors: bronze 25, silver 50, gold 75, platinum 100.
// Target: Lv 100 in each ability by Summer Nationals (July 1, 2026).

export const ABILITIES = ['strike', 'guard', 'engine', 'mind'];

export const ABILITY_META = {
    strike: { label: 'Strike',  icon: '⚔️', color: '#c0392b' },
    guard:  { label: 'Guard',   icon: '🛡️', color: '#2d6a96' },
    engine: { label: 'Engine',  icon: '⚡', color: '#f1c40f' },
    mind:   { label: 'Mind',    icon: '🧠', color: '#8e44ad' }
};

// Tier thresholds and colors (Lv → tier name)
export function rankFor(level) {
    if (level >= 100) return { tier: 'platinum', color: '#7ec8e3', shimmer: true };
    if (level >= 75)  return { tier: 'gold',     color: '#d4af37', shimmer: false };
    if (level >= 50)  return { tier: 'silver',   color: '#bcc6cc', shimmer: false };
    if (level >= 25)  return { tier: 'bronze',   color: '#cd7f32', shimmer: false };
    return { tier: 'novice', color: '#b0b3b8', shimmer: false };
}

// =====================================================
// XP computation per ability
// =====================================================

export function computeStrike(bouts) {
    let xp = 0;
    for (const b of bouts) {
        xp += Math.max(0, b.my_score || 0);                // 1 XP / landed touch
        if (b.outcome === 'win') xp += 10;                  // bonus per win
    }
    return xp;
}

export function computeGuard(bouts) {
    let xp = 0;
    for (const b of bouts) {
        // Defensive XP: max(0, 15 - opponent score). Caps at 15-point bouts.
        // Holding opponent under 5 = bonus.
        const theirs = b.their_score || 0;
        xp += Math.max(0, 15 - theirs);
        if (theirs <= 5) xp += 5;
    }
    return xp;
}

export function computeEngine(physicalSessions) {
    let xp = 0;
    for (const s of physicalSessions) {
        const drills = s.drills_completed || [];
        for (const d of drills) xp += Math.max(0, d.actual_reps || 0);
        if ((s.energy_1_10 || 0) >= 7 && (s.soreness_severity || 0) <= 3) xp += 20;
        if ((s.sleep_hours || 0) >= 8) xp += 10;
    }
    return xp;
}

export function computeMind(mentalSessions, swots, bouts, privateLessons, groupLessons) {
    let xp = 0;
    for (const m of mentalSessions) {
        xp += Math.max(0, m.meditation_duration_min || 0);
        xp += (m.scenarios_rehearsed || []).length * 5;
    }
    for (const s of swots) {
        const total = (s.strengths || []).length
                    + (s.weaknesses || []).length
                    + (s.opportunities || []).length
                    + (s.threats || []).length;
        xp += total * 5;
    }
    for (const b of bouts) {
        if (b.reflection && b.reflection.trim()) xp += 10;
    }
    for (const lesson of [...privateLessons, ...groupLessons]) {
        const topics = lesson.topics || [];
        for (const t of topics) {
            if ((t.mastery_1_10 || 0) >= 7) xp += 15;
        }
    }
    return xp;
}

// =====================================================
// Per-profile rollup
// =====================================================

/**
 * Take all raw data for one profile and return ability levels.
 * `data` = { bouts, physical_sessions, mental_sessions, opponent_swots, private_lessons, group_lessons }
 */
export function computeAbilities(data) {
    const strikeXp = computeStrike(data.bouts || []);
    const guardXp  = computeGuard(data.bouts || []);
    const engineXp = computeEngine(data.physical_sessions || []);
    const mindXp   = computeMind(
        data.mental_sessions || [],
        data.opponent_swots || [],
        data.bouts || [],
        data.private_lessons || [],
        data.group_lessons || []
    );
    return {
        strike: makeAbility(strikeXp),
        guard:  makeAbility(guardXp),
        engine: makeAbility(engineXp),
        mind:   makeAbility(mindXp)
    };
}

function makeAbility(xp) {
    const total = Math.max(0, Math.floor(xp));
    const level = Math.min(100, Math.floor(total / 100));
    const xpToNext = total - level * 100;
    const pctToNext = Math.min(100, xpToNext);   // 0..100
    return {
        totalXp: total,
        level,
        xpToNext,
        pctToNext,
        capped: level >= 100,
        rank: rankFor(level)
    };
}

// =====================================================
// Pace to Summer Nationals (or any target date)
// =====================================================

export function paceProjection(ability, recentDailyXp, targetLevel, daysRemaining) {
    const xpNeeded = Math.max(0, targetLevel * 100 - ability.totalXp);
    const xpPerDay = daysRemaining > 0 ? xpNeeded / daysRemaining : Infinity;
    const onTrackThreshold = xpPerDay;
    let status;
    if (ability.totalXp >= targetLevel * 100) status = 'done';
    else if (ability.totalXp === 0)            status = 'not_started';
    else if (recentDailyXp >= xpPerDay)        status = 'on_track';
    else if (recentDailyXp >= xpPerDay * 0.5)  status = 'close';
    else                                       status = 'behind';
    return {
        xpNeeded,
        xpPerDayNeeded: Math.ceil(xpPerDay),
        recentDailyXp: Math.round(recentDailyXp),
        status,
        daysRemaining
    };
}

// =====================================================
// Recent daily pace — XP added per day over last N days
// =====================================================

export function recentDailyXp(data, days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const since = cutoff.toISOString().slice(0, 10);

    const recentBouts = (data.bouts || []).filter(b => (b.date || '') >= since);
    const recentPhys  = (data.physical_sessions || []).filter(s => (s.date || '') >= since);
    const recentMnt   = (data.mental_sessions  || []).filter(s => (s.date || '') >= since);
    const recentLP    = (data.private_lessons  || []).filter(s => (s.date || '') >= since);
    const recentLG    = (data.group_lessons    || []).filter(s => (s.date || '') >= since);

    const strike = computeStrike(recentBouts) / days;
    const guard  = computeGuard(recentBouts) / days;
    const engine = computeEngine(recentPhys) / days;
    const mind   = computeMind(recentMnt, data.opponent_swots || [], recentBouts, recentLP, recentLG) / days;

    return { strike, guard, engine, mind };
}

export const TARGET_LEVEL = 100;  // legacy fallback
export const TARGET_LEVELS = { strike: 30, guard: 30, engine: 100, mind: 40 };
export const SUMMER_NATIONALS_DATE = '2026-07-01';
export function targetLevelFor(abilityKey) { return TARGET_LEVELS[abilityKey] || TARGET_LEVEL; }

export function daysUntil(isoDate) {
    const target = new Date(isoDate + 'T00:00:00');
    const now = new Date();
    return Math.max(0, Math.ceil((target - now) / 86400000));
}

// =====================================================
// Daily streak — count consecutive days back from today with ANY logged data
// =====================================================
export function computeStreak(data) {
    const days = new Set();
    for (const b of (data.bouts || []))             if (b.date) days.add(b.date);
    for (const s of (data.physical_sessions || [])) if (s.date) days.add(s.date);
    for (const s of (data.mental_sessions || []))   if (s.date) days.add(s.date);
    for (const l of (data.private_lessons || []))   if (l.date) days.add(l.date);
    for (const l of (data.group_lessons || []))     if (l.date) days.add(l.date);

    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
        const iso = d.toISOString().slice(0, 10);
        if (days.has(iso)) { streak++; d.setDate(d.getDate() - 1); }
        else if (i === 0) { d.setDate(d.getDate() - 1); }  // today is OK to skip
        else break;
    }
    return { streak, totalLoggedDays: days.size };
}
