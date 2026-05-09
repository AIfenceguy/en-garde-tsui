// Atelier Tsui — Claude coaching client
// Wraps the `claude-coach` Supabase Edge Function so the rest of the app
// can just call `coach.boutDebrief(boutId)` etc.

import { supa } from './supa.js';
import { activeProfileId } from './db.js';

const FN_NAME = 'claude-coach';

async function invoke(action, payload = {}) {
    const profile_id = activeProfileId();
    if (!profile_id) throw new Error('No active profile.');

    const { data, error } = await supa.functions.invoke(FN_NAME, {
        body: { action, profile_id, ...payload }
    });

    if (error) throw new Error(error.message || 'Edge function failed');
    if (data?.error) throw new Error(data.error);
    return data;
}

export async function boutDebrief(boutId) {
    return invoke('bout-debrief', { bout_id: boutId });
}

export async function todayCoachCard() {
    return invoke('today-coach-card');
}

export async function opponentProfiler(opponentId) {
    return invoke('opponent-profiler', { opponent_id: opponentId });
}

// Read prior coach notes for a profile/bout/opponent
export async function listCoachNotes({ kind = null, boutId = null, opponentId = null, limit = 10 } = {}) {
    const profile_id = activeProfileId();
    if (!profile_id) return [];
    let q = supa
        .from('coach_notes')
        .select('*')
        .eq('profile_id', profile_id)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (kind) q = q.eq('kind', kind);
    if (boutId) q = q.eq('bout_id', boutId);
    if (opponentId) q = q.eq('opponent_id', opponentId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

// =============================================================================
// profile_context helpers — long-term priors
// =============================================================================
export async function getContext(kind) {
    const profile_id = activeProfileId();
    if (!profile_id) return null;
    const { data } = await supa
        .from('profile_context')
        .select('*')
        .eq('profile_id', profile_id)
        .eq('kind', kind)
        .maybeSingle();
    return data;
}

export async function upsertContext(kind, content) {
    const profile_id = activeProfileId();
    if (!profile_id) throw new Error('No active profile.');
    const { data, error } = await supa
        .from('profile_context')
        .upsert(
            { profile_id, kind, content, updated_at: new Date().toISOString() },
            { onConflict: 'profile_id,kind' }
        )
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function listContext() {
    const profile_id = activeProfileId();
    if (!profile_id) return [];
    const { data, error } = await supa
        .from('profile_context')
        .select('*')
        .eq('profile_id', profile_id);
    if (error) throw error;
    return data || [];
}
