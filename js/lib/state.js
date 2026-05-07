// Tiny pub/sub state container. No dependencies.
// Holds: session (auth user), profiles list, active profile, online status.

const listeners = new Set();
let _state = {
    session: null,
    profiles: [],
    activeProfileId: null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true
};

export function getState() { return _state; }

export function setState(patch) {
    _state = { ..._state, ...patch };
    for (const fn of listeners) {
        try { fn(_state); } catch (e) { console.error(e); }
    }
}

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function activeProfile() {
    if (!_state.activeProfileId) return null;
    return _state.profiles.find((p) => p.id === _state.activeProfileId) || null;
}

if (typeof window !== 'undefined') {
    window.addEventListener('online',  () => setState({ online: true }));
    window.addEventListener('offline', () => setState({ online: false }));
}
