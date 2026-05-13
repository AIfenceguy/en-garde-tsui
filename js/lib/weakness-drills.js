// Prescriptive weakness-drill library.
// Maps each fencer's known weak spots (e.g. CHAOTIC, AGGRESSIVE) to actionable
// 3-part plays (tag / data / game_plan / cue) split across TECHNIQUE and BODY.
//
// This is the same actionable structure the FT Scout panel now uses — keep them
// visually consistent.
//
// To update a fencer's weakness profile, edit WEAKNESS_PROFILE below. Future:
// move this to a Supabase profile column so it can be edited from the UI.

// Slugs MUST match opponents.archetypes taxonomy (opponents.js ARCHETYPES) so
// bout-loss-rate can be computed live from logged data.
const WEAKNESS_PROFILE = {
    raedyn: ['unpredictable', 'aggressive'],
    kaylan: ['unpredictable']
};

const DRILL_BANK = {
    // ──────────────────────────────────────────────────────────────────────
    unpredictable: {
        slug: 'unpredictable',
        label: 'CHAOTIC FENCERS',
        emoji: '🌀',
        opponent_profile: 'Unpredictable, off-rhythm, unconventional blade work. Throws 3+ unknown actions per phrase. Wins by breaking your pattern-recognition, not by being faster or stronger.',
        why_it_hurts: 'You start hesitating because nothing they do "lines up". You either freeze or commit too early.',
        technique: [
            {
                tag: '🎯 EYES-OPEN PARRY DRILL',
                priority: 1,
                data: 'Chaotic fencers throw 3+ random blade actions per phrase. Predicting = losing.',
                game_plan: 'Coach throws random parries (4, 6, 7, 8) with NO pattern. 30 reps × 3 sets. Eyes open, react — never anticipate. Reset to neutral the instant you feel yourself guessing.',
                cue: 'When you feel yourself "expecting" a parry, RESET. The blade tells you what to do — not your head.'
            },
            {
                tag: '🛡️ DISTANCE ANCHOR',
                priority: 1,
                data: "When you can't read them, you BUY TIME with distance.",
                game_plan: 'Partner mixes footwork (advance/retreat/balestra/jump-lunge — random). You mirror at MAX foil distance for 90s. No touch attempts — just hold the gap.',
                cue: 'If you can touch them without lunging, you are TOO CLOSE. Step back. Earn the touch with distance, not desperation.'
            },
            {
                tag: '🚪 ONE-LIGHT POLICY',
                priority: 2,
                data: 'Chaotic fencers cash in on doubles. Force every exchange to be one light.',
                game_plan: 'Bouting drill — score by SINGLE LIGHTS only. Doubles = 0 to both. First to 5 single touches wins. Parry-riposte over counter-attack EVERY time.',
                cue: "Don't counter-attack into chaos. Parry first. Then riposte. ONE light."
            }
        ],
        body: [
            {
                tag: '💪 REACTIVE LADDER',
                priority: 1,
                add_drill: 'footwork-ladder',
                data: 'Chaotic opponents = high cognitive load. Train legs to obey while brain is busy.',
                game_plan: 'Agility ladder 30s — coach calls direction changes mid-step ("LEFT! BACK! RIGHT!"). 4 rounds × 30s on / 30s rest. 3× per week.',
                cue: 'Feet lighter than brain. Stay on the BALLS of your feet — heels never touch.'
            },
            {
                tag: '🧠 VISION + LEGS',
                priority: 2,
                add_drill: 'core-circuit',
                data: 'Tired legs = pattern-matching brain. Separate the two systems.',
                game_plan: 'Wall-sit hold for 60s. Partner flashes 1 or 2 fingers in your peripheral every 3-5s — you call out the number. 3 rounds. Quality over time.',
                cue: 'Quads burn but you miss numbers = you are THINKING with your legs. Slow your breathing, watch the fingers.'
            }
        ]
    },
    // ──────────────────────────────────────────────────────────────────────
    aggressive: {
        slug: 'aggressive',
        label: 'AGGRESSIVE FENCERS',
        emoji: '🔥',
        opponent_profile: 'Fast initiation. Charge attackers. Forward pressure from "Allez". Prep-heavy — they make YOU react first.',
        why_it_hurts: 'You get pushed off the strip mentally before the lights even start counting.',
        technique: [
            {
                tag: '⚡ COUNTER ON THE SECOND STEP',
                priority: 1,
                data: '70% of aggressive attacks start with a tempo break (slow-slow-FAST). Their attack STARTS in their prep — beat them THERE.',
                game_plan: 'Coach charges with advance-lunge × 10 reps × 4 sets. You retreat-retreat-counter (point in line on the SECOND retreat). Score = clean counters where their lunge never reached you.',
                cue: "Don't wait for the lunge. They've already committed by step two. Hit them on the SECOND step."
            },
            {
                tag: '🚧 WALL OF POINT',
                priority: 1,
                data: "Aggressive fencers don't expect a fencer who DOESN'T retreat. They run into stationary points.",
                game_plan: 'Partner advances straight at you. You HOLD point-in-line. Last-moment parry-riposte. 20 reps. Then switch roles to feel the pressure from their side.',
                cue: 'Plant your back foot. Make THEM beat the point. Do not flinch.'
            },
            {
                tag: '🛑 STOP-HIT THE TEMPO',
                priority: 2,
                data: 'The moment their back foot loads = the moment to extend.',
                game_plan: 'Coach does slow-slow-FAST lunges. You stop-hit on the tempo change. 4 sets × 8 reps. Reset on every miss — no momentum points.',
                cue: 'Watch the back foot. Loaded back foot → extend. That is the trigger.'
            }
        ],
        body: [
            {
                tag: '🦵 EXPLOSIVE RETREAT',
                priority: 1,
                add_drill: 'single-leg-bounds',
                data: 'To counter aggression, your retreat must be as fast as their advance.',
                game_plan: '10-yard plyo retreat bounds. 6 rounds × 60s rest. Drive with the FRONT leg push-off — back leg is just a landing zone.',
                cue: "If you feel your back leg working harder than your front, you're stepping — not exploding."
            },
            {
                tag: '🥊 SUB-SECOND PARRY-RIPOSTE',
                priority: 2,
                add_drill: 'weapon-arm-circuit',
                data: 'Average aggressive attack reaches you in 0.8s. Parry-riposte must be ≤ 0.6s.',
                game_plan: 'Wall reaction drill — partner taps your blade at random angles. You parry-riposte to target zone in under 1 second. 30 reps × 3 sets.',
                cue: 'Quick hands beat fast feet. Your blade should already be moving when your eyes confirm the threat.'
            }
        ]
    }
    // Future: add slugs like 'tall', 'lefty', 'patient_counter', 'flicker'.
};

/**
 * Get the prescriptive drill plays for a given profile role.
 * @param {string} role  'raedyn' | 'kaylan' | (future roles)
 * @returns {Array<{slug, label, emoji, opponent_profile, why_it_hurts, technique: [...], body: [...]}>}
 */
export function getWeaknessDrills(role) {
    const slugs = WEAKNESS_PROFILE[role] || [];
    return slugs.map(s => DRILL_BANK[s]).filter(Boolean);
}

/**
 * Get the raw weakness slugs for a profile — for badge rendering, etc.
 */
export function getWeaknessSlugs(role) {
    return WEAKNESS_PROFILE[role] || [];
}

/**
 * Look up one weakness pack by slug.
 */
export function getWeaknessBySlug(slug) {
    return DRILL_BANK[slug] || null;
}

/**
 * All known weakness slugs (for opponent auto-tagging in future).
 */
export function listAllWeaknesses() {
    return Object.keys(DRILL_BANK);
}
