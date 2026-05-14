// drill-mastery.js
// Five-stage mastery ladder per drill, computed from logged drill_sessions
// (and bout tactics for the highest stage). Used by physical.js to render badges
// and by drill-coach.js to generate weekly synthesis.

import { supa } from './supa.js';

// Stage definitions
export const STAGES = [
    { idx: 0, slug: 'learning',    emoji: '🌱', label: 'Learning',    blurb: 'Just feel it — slow, sloppy is fine.' },
    { idx: 1, slug: 'form',        emoji: '🌿', label: 'Form',        blurb: 'Clean execution at training pace.' },
    { idx: 2, slug: 'tempo',       emoji: '🌳', label: 'Tempo',       blurb: 'Clean at fencing pace — automatic.' },
    { idx: 3, slug: 'pressure',    emoji: '⚔️', label: 'Pressure',    blurb: 'Holds under fatigue and resistance.' },
    { idx: 4, slug: 'match-ready', emoji: '🏆', label: 'Match-ready', blurb: 'Showed up in a real bout.' }
];

export const RATINGS = [
    { val: 1, emoji: '😵‍💫', label: 'sloppy' },
    { val: 2, emoji: '🙂',    label: 'ok' },
    { val: 3, emoji: '💪',    label: 'sharp' },
    { val: 4, emoji: '⚡',    label: 'fast' },
    { val: 5, emoji: '🎯',    label: 'dialled-in' }
];

// Compute mastery stage for a single drill from its session history.
// Auto-advance rules:
//   🌱 → 🌿 : 2 sessions at rating >= 2 (ok)
//   🌿 → 🌳 : 3 of last 5 sessions at rating >= 3 (sharp)
//   🌳 → ⚔️ : 2 sessions at rating >= 4 (fast) within last 14d
//             OR a coach-confirmed pressure context (note contains '#coach')
//   ⚔️ → 🏆 : at least one bout with bout_id set on a winning session
export function computeStage(sessions = []) {
    if (!sessions.length) return STAGES[0];
    // Earliest first for chronological progression
    const chrono = [...sessions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let stage = 0;
    const okCount = chrono.filter(s => s.rating >= 2).length;
    if (okCount >= 2) stage = 1;
    const last5 = chrono.slice(-5);
    const sharpInLast5 = last5.filter(s => s.rating >= 3).length;
    if (stage >= 1 && sharpInLast5 >= 3) stage = 2;
    const cutoff14 = Date.now() - 14 * 86400000;
    const fastRecent = chrono.filter(s => new Date(s.created_at).getTime() >= cutoff14 && s.rating >= 4);
    const coachConfirmed = chrono.some(s => (s.note || '').toLowerCase().includes('#coach'));
    if (stage >= 2 && (fastRecent.length >= 2 || coachConfirmed)) stage = 3;
    const boutLinked = chrono.some(s => s.bout_id);
    if (stage >= 3 && boutLinked) stage = 4;
    return STAGES[stage];
}

// Fetch drill sessions for a profile, optionally filtered by drill_slug or weakness_slug.
export async function listDrillSessions(profileId, { drillSlug, weaknessSlug, sinceDays = 60 } = {}) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    let q = supa.from('drill_sessions')
        .select('*')
        .eq('profile_id', profileId)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
    if (drillSlug) q = q.eq('drill_slug', drillSlug);
    if (weaknessSlug) q = q.eq('weakness_slug', weaknessSlug);
    const { data, error } = await q;
    if (error) { console.warn('[drill-mastery] list failed', error); return []; }
    return data || [];
}

// Save a new drill session.
export async function logDrillSession({ profileId, drillSlug, weaknessSlug, reps, rating, note, boutId }) {
    const payload = {
        profile_id: profileId,
        drill_slug: drillSlug,
        weakness_slug: weaknessSlug,
        reps: reps ?? 0,
        rating: rating ?? 3,
        note: note || null,
        bout_id: boutId || null
    };
    const { data, error } = await supa.from('drill_sessions').insert(payload).select().single();
    if (error) throw error;
    return data;
}

// Bulk-fetch all sessions for a profile (used for dashboard coach card).
export async function listAllDrillSessions(profileId, sinceDays = 14) {
    return listDrillSessions(profileId, { sinceDays });
}

// Helper: slugify a drill tag like '⚔️ BEAT BEFORE YOU LUNGE' → 'beat-before-you-lunge'
export function tagToSlug(tag) {
    if (!tag) return '';
    return String(tag)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')   // drop emojis / punctuation
        .trim()
        .replace(/\s+/g, '-');
}

// Group sessions by drill_slug → { slug: [sessions...] }
export function groupByDrill(sessions) {
    const map = new Map();
    for (const s of sessions) {
        if (!map.has(s.drill_slug)) map.set(s.drill_slug, []);
        map.get(s.drill_slug).push(s);
    }
    return map;
}
