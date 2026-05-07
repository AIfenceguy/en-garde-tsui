// Shared DB helpers: taxonomy loaders + scoped query factories.

import { supa } from './supa.js';
import { getState, activeProfile } from './state.js';

let _taxoCache = null;

export async function loadTaxonomies(force = false) {
    if (_taxoCache && !force) return _taxoCache;
    const [topics, drills, tactics] = await Promise.all([
        supa.from('topic_taxonomy').select('*').order('label'),
        supa.from('drill_taxonomy').select('*').order('label'),
        supa.from('tactic_taxonomy').select('*').order('label')
    ]);
    if (topics.error) throw topics.error;
    if (drills.error) throw drills.error;
    if (tactics.error) throw tactics.error;
    _taxoCache = {
        topics: topics.data || [],
        drills: drills.data || [],
        tactics: tactics.data || [],
        topicBySlug: new Map((topics.data || []).map((r) => [r.slug, r])),
        drillBySlug: new Map((drills.data || []).map((r) => [r.slug, r])),
        tacticBySlug: new Map((tactics.data || []).map((r) => [r.slug, r]))
    };
    return _taxoCache;
}

export function invalidateTaxonomies() { _taxoCache = null; }

export function activeProfileId() {
    return getState().activeProfileId;
}

export function requireActiveProfile() {
    const p = activeProfile();
    if (!p) throw new Error('No active profile selected.');
    return p;
}

// Bouts
export async function listBouts({ limit = 30, opponentId = null } = {}) {
    const pid = activeProfileId();
    if (!pid) return [];
    let q = supa.from('bouts').select('*').eq('profile_id', pid).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
    if (opponentId) q = q.eq('opponent_id', opponentId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

export async function getBout(id) {
    const { data, error } = await supa.from('bouts').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

// Opponents
export async function listOpponents() {
    const pid = activeProfileId();
    if (!pid) return [];
    const { data, error } = await supa
        .from('opponents')
        .select('*')
        .eq('profile_id', pid)
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function getOpponent(id) {
    const { data, error } = await supa.from('opponents').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
}

export async function findOrCreateOpponent({ name, club = null, rating = null }) {
    const pid = activeProfileId();
    if (!pid) throw new Error('No profile.');
    const trimName = (name || '').trim();
    if (!trimName) return null;
    const { data: existing, error: e1 } = await supa
        .from('opponents')
        .select('*')
        .eq('profile_id', pid)
        .ilike('name', trimName)
        .limit(1);
    if (e1) throw e1;
    if (existing && existing[0]) return existing[0];
    const { data: created, error: e2 } = await supa
        .from('opponents')
        .insert({ profile_id: pid, name: trimName, club, rating })
        .select()
        .single();
    if (e2) throw e2;
    return created;
}

export async function getSwot(opponentId) {
    const { data, error } = await supa
        .from('opponent_swots')
        .select('*')
        .eq('opponent_id', opponentId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function upsertSwot(opponentId, patch) {
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('opponent_swots')
        .upsert({ opponent_id: opponentId, profile_id: pid, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'opponent_id' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// 5W2H scout cards
export async function listScoutCards(opponentId) {
    const { data, error } = await supa
        .from('opponent_5w2h')
        .select('*')
        .eq('opponent_id', opponentId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// Physical
export async function getPhysicalForDate(date) {
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('physical_sessions')
        .select('*')
        .eq('profile_id', pid)
        .eq('date', date)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function listPhysicalRecent(days = 14) {
    const pid = activeProfileId();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const { data, error } = await supa
        .from('physical_sessions')
        .select('*')
        .eq('profile_id', pid)
        .gte('date', cutoff.toISOString().slice(0, 10))
        .order('date', { ascending: false });
    if (error) throw error;
    return data || [];
}

// Mental
export async function getMentalForDate(date) {
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('mental_sessions')
        .select('*')
        .eq('profile_id', pid)
        .eq('date', date)
        .maybeSingle();
    if (error) throw error;
    return data;
}

// Lessons
export async function listPrivateLessons(limit = 30) {
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('private_lessons')
        .select('*')
        .eq('profile_id', pid)
        .order('date', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

export async function listGroupLessons(limit = 30) {
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('group_lessons')
        .select('*')
        .eq('profile_id', pid)
        .order('date', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

// Tournaments
export async function listTournaments() {
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('tournaments')
        .select('*')
        .eq('profile_id', pid)
        .order('start_date');
    if (error) throw error;
    return data || [];
}

export async function nextTournament() {
    const today = new Date().toISOString().slice(0, 10);
    const pid = activeProfileId();
    const { data, error } = await supa
        .from('tournaments')
        .select('*')
        .eq('profile_id', pid)
        .gte('start_date', today)
        .order('start_date')
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}
