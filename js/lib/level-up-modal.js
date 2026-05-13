// Level-up modal — fires when ANY ability crosses 100 XP since last snapshot.
// Stores per-profile XP snapshot in localStorage; compares on each dashboard load.
// Subtle Roblox vibe: glow + scale-up, NO confetti, NO sound (mobile-safe).

import { ABILITY_META, rankFor } from './levels.js';

const KEY = 'en-garde.levelSnapshot.v1';

function loadSnapshot() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function saveSnapshot(snap) {
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) {}
}

/**
 * Check if any ability has leveled up since last snapshot for this profile.
 * If yes, show modal AND update snapshot.
 * `abilities` = { strike, guard, engine, mind } where each has { level, totalXp }
 */
export function maybeShowLevelUp(profileId, abilities) {
    if (!profileId || !abilities) return;
    const snap = loadSnapshot();
    const prior = snap[profileId] || {};
    const newProfileSnap = {};
    const levelUps = [];
    for (const key of Object.keys(abilities)) {
        const cur = abilities[key].level || 0;
        const prev = prior[key] ?? cur;  // first-ever load: assume no change
        newProfileSnap[key] = cur;
        if (cur > prev) {
            levelUps.push({ key, from: prev, to: cur, rank: abilities[key].rank });
        }
    }
    snap[profileId] = newProfileSnap;
    saveSnapshot(snap);
    if (levelUps.length === 0) return;
    showModal(levelUps);
}

function showModal(levelUps) {
    // De-dupe — if multiple, show the highest-tier one
    const best = levelUps.reduce((a, b) => (b.to > a.to ? b : a));
    const meta = ABILITY_META[best.key] || { label: best.key, icon: '⭐' };
    const rank = best.rank || rankFor(best.to);

    const overlay = document.createElement('div');
    overlay.className = 'levelup-overlay';
    overlay.innerHTML = `
        <div class="levelup-modal" role="dialog" aria-modal="true">
            <div class="levelup-banner">LEVEL UP!</div>
            <div class="levelup-icon" style="background: ${rank.color}">${meta.icon}</div>
            <div class="levelup-ability">${meta.label.toUpperCase()}</div>
            <div class="levelup-from-to">
                <span class="levelup-old">Lv ${best.from}</span>
                <span class="levelup-arrow">→</span>
                <span class="levelup-new" style="color: ${rank.color}">Lv ${best.to}</span>
            </div>
            <div class="levelup-rank">${rank.tier.toUpperCase()} rank</div>
            ${levelUps.length > 1 ? `<div class="levelup-extra">+${levelUps.length - 1} other ability leveled up too!</div>` : ''}
            <button class="levelup-close" type="button">Awesome!</button>
        </div>
    `;
    document.body.appendChild(overlay);
    // Force reflow then add class for transition
    void overlay.offsetWidth;
    overlay.classList.add('is-shown');
    const close = () => {
        overlay.classList.remove('is-shown');
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('.levelup-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    // Auto-close after 8s if user doesn't interact
    setTimeout(close, 8000);
}
