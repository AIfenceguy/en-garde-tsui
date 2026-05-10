// Priority opponent intel for Summer Nationals 2026 prep.
// Pulled from fencingtracker.com on 2026-05-10.
// Bundled as JS so the app reads it without an extra fetch.
//
// Principle: Repeat-loss against same fencer = personal-matchup gap.
// Repeat-loss across multiple fencers from same CLUB = club-style gap.

export const PRIORITY_META = {
    pulled_at: '2026-05-10',
    source: 'fencingtracker.com',
    raedyn_url: 'https://fencingtracker.com/p/100280844/Raedyn%20Ho%20Hin-Tsui',
    kaylan_url: 'https://fencingtracker.com/p/100280845/Kaylan%20Ho%20Sen-Tsui',
    raedyn_total_bouts: 866,
    kaylan_total_bouts: 705
};

// 10-question style-profile interview, keyed by slug.
// Saved into opponents.style_profile (jsonb) keyed by slug.
export const STYLE_QUESTIONS = [
    { slug: 'tempo',                label: 'Tempo',
      hint:  'Fast / patient / variable. How does their rhythm feel from the en-garde line?' },
    { slug: 'distance',             label: 'Distance',
      hint:  'Close / mid / far. Do they want to glue to you or stay outside your prep?' },
    { slug: 'hand',                 label: 'Hand',
      hint:  'Right / left. Note if their handedness reshapes the line.' },
    { slug: 'tells',                label: 'Tells',
      hint:  'Pre-action signals — shoulder dip, blade lift, foot weight shift.' },
    { slug: 'setup',                label: 'Setup',
      hint:  'Their go-to entry — march + flick, beat-attack, false-attack into counter, etc.' },
    { slug: 'defense',              label: 'Defense',
      hint:  'How they defend — parry-riposte, distance, counter-attack into your prep.' },
    { slug: 'adaptation',           label: 'Adaptation',
      hint:  'Do they change after losing 2-3 in a row? Or repeat the same recipe?' },
    { slug: 'pressure',             label: 'Under pressure',
      hint:  'Last-touch / 4-4 / DE — what do they reach for when it matters?' },
    { slug: 'what_worked_for_me',   label: 'What worked for me',
      hint:  'Specific actions that landed — tactic + timing + line.' },
    { slug: 'what_they_land_on_me', label: 'What they land on me',
      hint:  'Where I keep getting hit — pattern, not one-off touch.' }
];
// Per-kid priority intel, keyed by profile.role
export const PRIORITY_TARGETS = {
    raedyn: {
        club_loss_pattern: [
            { club: 'Massialas Foundation (M Team)',                           w: 8,  l: 17, fencers_beat_him: 9,
              tag: 'SYSTEMIC — 9 different M-Team fencers beat him. Single biggest club-style gap.',
              notable_fencers: ['FUKUDA Brando 1-7', 'WEI Winston 0-4'] },
            { club: 'Silicon Valley Fencing Center',                           w: 38, l: 40, fencers_beat_him: 19,
              tag: 'Volume but close to even. 19 fencers beat him here — wide club-style match-up.',
              notable_fencers: ['YANG Charles 1-7', 'CHANG Jonathan 0-7', 'ZHONG Maxwell 0-4'] },
            { club: 'Precision Athletics Fencing Club',                        w: 3,  l: 9,  fencers_beat_him: 5,
              tag: 'Losing 1:3 ratio. Smaller club but consistent style.',
              notable_fencers: ['CHOI Ethan 0-4'] },
            { club: 'LA International Fencing / Orange County Fencing Center', w: 0,  l: 7,  fencers_beat_him: 4,
              tag: '0-7. Has never beaten anyone from this club combo.' },
            { club: 'Orange County International Fencers Club',                w: 7,  l: 11, fencers_beat_him: 5,
              tag: 'Losing net.',
              notable_fencers: ['CHANG Eric Jonathan 1-5'] }
        ],
        never_beaten: [
            { name: 'BIELER Mason',     record: '0-10', club: 'LA International Fencing',                       rating: 'A26', priority: 'high',
              note: 'NOT mentioned in interview. Foil-IQ blind spot — profile this fencer first.' },
            { name: 'CHANG Jeremy',     record: '0-7',  club: 'SoCAL Fencing Center / OC International',         rating: 'C26', priority: 'high',
              note: 'Clubmate at SoCAL — daily training opportunity. Live-bout him weekly.' },
            { name: 'CHANG Jonathan',   record: '0-7',  club: 'Silicon Valley Fencing Center',                   rating: 'A26', priority: 'low',
              note: 'A-rated. Probably aging out of Cadet pool by July.' },
            { name: 'ZHONG Maxwell',    record: '0-4',  club: 'Silicon Valley Fencing Center',                   rating: 'A26', priority: 'med' },
            { name: 'WEI Winston',      record: '0-4',  club: 'Massialas Foundation (M Team)',                   rating: 'B26', priority: 'med' },
            { name: 'CHOI Ethan',       record: '0-4',  club: 'Precision Athletics Fencing Club',                rating: 'B26',    priority: 'med' }
        ],
        winnable: [
            { name: 'LI Daniel',         record: '3-9', club: 'Team Touche Fencing Center',                       rating: 'C26', priority: 'high',
              note: 'Cadet event — Summer Nationals relevant.' },
            { name: 'YANG Charles',      record: '1-7', club: 'Silicon Valley Fencing Center',                    rating: 'C26', priority: 'high',
              note: 'Raedyn cited 7:6 win. That\'s the 1. Confirmation bias — the data says 1-7.' },
            { name: 'YE Jerry',          record: '7-7', club: 'Golubitsky Fencing Center',                        rating: 'E26', priority: 'med',
              note: 'Even-record winnable matchup.' },
            { name: 'LOZANO Veyron J.',  record: '1-7', club: 'LA International Fencing',                         rating: 'A26', priority: 'med' },
            { name: 'FUKUDA Brando',     record: '1-7', club: 'Massialas Foundation (M Team)',                    rating: 'C25', priority: 'med' }
        ]
    },

    kaylan: {
        club_loss_pattern: [
            { club: 'Prime Fencing Academy',                                   w: 4,  l: 7,  fencers_beat_him: 5,
              tag: 'Losing net. 5 different fencers beat him.' },
            { club: 'Orange County International Fencers Club',                w: 1,  l: 6,  fencers_beat_him: 4,
              tag: '1-6. WU Gengze drives this.',
              notable_fencers: ['WU Gengze 3-8'] },
            { club: 'Silicon Valley Fencing Center',                           w: 45, l: 44, fencers_beat_him: 15,
              tag: 'Volume. 15 different fencers beat him — broad club-style overlap.',
              notable_fencers: ['XU Ethan 1-7', 'YANG Steve 2-5', 'RAU Shogun 0-5'] },
            { club: 'Golubitsky Fencing Center',                               w: 46, l: 31, fencers_beat_him: 15,
              tag: 'Net positive but 31 losses across 15 fencers — second-broadest club-style gap.',
              notable_fencers: ['YU ShiYu 0-7', 'HONG Edwin 0-6'] },
            { club: 'Team Touche Fencing Center',                              w: 17, l: 9,  fencers_beat_him: 4,
              tag: 'Net positive overall, but GUDIMETLA owns him.',
              notable_fencers: ['GUDIMETLA Siddhanth 0-6'] }
        ],
        never_beaten: [
            { name: 'YU ShiYu (Henry)',    record: '0-7', club: 'Golubitsky Fencing Center',    rating: 'D25', priority: 'high' },
            { name: 'GUDIMETLA Siddhanth', record: '0-6', club: 'Team Touche Fencing Center',   rating: 'E25', priority: 'high' },
            { name: 'HONG Edwin',          record: '0-6', club: 'Golubitsky Fencing Center',    rating: 'E25', priority: 'high' },
            { name: 'RAU Shogun',          record: '0-5', club: 'Silicon Valley Fencing Center', rating: 'D26', priority: 'med' }
        ],
        winnable: [
            { name: 'WU Gengze (Daniel)', record: '3-8', club: 'Orange County International Fencers Club', rating: 'E26',   priority: 'high',
              note: '3 wins on record — momentum exists.' },
            { name: 'XU Ethan',           record: '1-7', club: 'Silicon Valley Fencing Center',            rating: 'D26', priority: 'high' },
            { name: 'YANG Steve',         record: '2-5', club: 'Silicon Valley Fencing Center',            rating: 'D26', priority: 'med' },
            { name: 'JEON Joohun',        record: '5-5', club: 'Elite International Fencers Club',         rating: 'U',   priority: 'med' },
            { name: 'TURBAT Travis',      record: '4-5', club: 'Precision Athletics Fencing Club',         rating: 'U',   priority: 'med' }
        ]
    }
};

export const SHARED_PATTERNS = {
    clubs_problematic_for_both: [
        { club: 'Silicon Valley Fencing Center',  raedyn: '38-40', kaylan: '45-44',
          tag: 'Both kids near-even with high-volume losses spread across many fencers — broadest club-style gap that affects both.' },
        { club: 'Golubitsky Fencing Center',      raedyn: '34-33', kaylan: '46-31',
          tag: 'Net positive for both, but persistent loss spread suggests a known club style they both struggle to crack.' },
        { club: 'Massialas Foundation (M Team)',  raedyn: '8-17',  kaylan: '11-8',
          tag: 'Raedyn losing badly (8-17), Kaylan slightly net positive. Style hits Raedyn harder.' },
        { club: 'Team Touche Fencing Center',     raedyn: '29-22', kaylan: '17-9',
          tag: 'Both net positive, but specific fencers (Raedyn:LI Daniel 3-9, Kaylan:GUDIMETLA 0-6) carry the loss weight.' }
    ],
    coaching_implication:
        "Counter-drills built against Silicon Valley FC's fast-blade-work + counter-attack style, OR Golubitsky's tactical-distance style, help BOTH brothers simultaneously. That's coaching efficiency."
};

// Helper — returns priority intel for the active profile's role, or null.
export function priorityFor(role) {
    if (!role) return null;
    return PRIORITY_TARGETS[role] || null;
}

// Helper — flatten all named priority opponents (never_beaten + winnable) for a role.
export function flatPriorityOpponents(role) {
    const intel = priorityFor(role);
    if (!intel) return [];
    const out = [];
    for (const o of intel.never_beaten || []) out.push({ ...o, bucket: 'never_beaten' });
    for (const o of intel.winnable || [])     out.push({ ...o, bucket: 'winnable' });
    return out;
}
