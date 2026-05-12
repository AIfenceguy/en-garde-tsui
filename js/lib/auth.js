// Auth flow. Single family Google account.
// On first sign-in, default profiles (raedyn, kaylan, parent) are auto-created.

import { supa, isConfigured } from './supa.js';
import { setState, getState } from './state.js';
import { REDIRECT_TO } from './config.js';

export async function loadSession() {
    if (!isConfigured()) {
        setState({ session: null });
        return null;
    }
    const { data } = await supa.auth.getSession();
    setState({ session: data.session || null });
    return data.session || null;
}

export async function signInWithGoogle() {
    const redirectTo = REDIRECT_TO || (window.location.origin + window.location.pathname);
    const { error } = await supa.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
    });
    if (error) throw error;
}

export async function signInWithMagicLink(email) {
    const redirectTo = REDIRECT_TO || (window.location.origin + window.location.pathname);
    const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;
}

export async function signInWithPassword(email, password) {
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function setPassword(password) {
    const { data, error } = await supa.auth.updateUser({ password });
    if (error) throw error;
    return data;
}


export async function signOut() {
    await supa.auth.signOut();
    setState({ session: null, profiles: [], activeProfileId: null });
    location.hash = '';
    location.reload();
}

// Default profile rows for a new family.
const DEFAULT_PROFILES = [
    { name: 'Raedyn', role: 'raedyn', birth_year: 2012, primary_weapon: 'foil', accent_hex: '#a82b2b' },
    { name: 'Kaylan', role: 'kaylan', birth_year: 2014, primary_weapon: 'foil', accent_hex: '#d4af37' },
    { name: 'Parent', role: 'parent', accent_hex: '#5a7a8c' }
];

export async function loadOrCreateProfiles(userId) {
    const { data: existing, error } = await supa
        .from('profiles')
        .select('*')
        .order('role');
    if (error) throw error;

    let profiles = existing || [];
    const have = new Set(profiles.map((p) => p.role));
    const missing = DEFAULT_PROFILES.filter((p) => !have.has(p.role));
    if (missing.length) {
        const inserts = missing.map((p) => ({ ...p, owner_user_id: userId }));
        const { data: created, error: e2 } = await supa
            .from('profiles')
            .insert(inserts)
            .select();
        if (e2) throw e2;
        profiles = profiles.concat(created || []);
    }
    profiles.sort((a, b) =>
        ['raedyn', 'kaylan', 'parent'].indexOf(a.role) -
        ['raedyn', 'kaylan', 'parent'].indexOf(b.role)
    );
    setState({ profiles });

    // restore last active profile from localStorage
    const last = localStorage.getItem('en-garde.activeProfileId');
    const validLast = last && profiles.some((p) => p.id === last);
    setState({ activeProfileId: validLast ? last : (profiles[0]?.id || null) });
    applyActiveRole();
    return profiles;
}

export function setActiveProfile(profileId) {
    const { profiles } = getState();
    if (!profiles.some((p) => p.id === profileId)) return;
    setState({ activeProfileId: profileId });
    localStorage.setItem('en-garde.activeProfileId', profileId);
    applyActiveRole();
}

function applyActiveRole() {
    const { profiles, activeProfileId } = getState();
    const p = profiles.find((x) => x.id === activeProfileId);
    document.body.setAttribute('data-active-role', p?.role || '');
}
