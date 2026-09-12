// Tutorial - how to use each screen, in the order a family meets them, and
// what each figure on it means in plain words. Definitions live on the
// Legend; this page is the walk-through. It says what goes into a number
// and what it tells you, never the recipe (Ricky, 2026-09-12: the method is
// ours; make it hard to copy). No data reads.

import { el } from '../lib/util.js';

const INK = 'var(--ink)';
// Literal: var(--ink-mute) composites below AA on the cream surface.
const INK_MUTE = '#6B7280';

// Each screen: why it exists, the steps in order, the figures on it.
const PAGES = [
    {
        route: 'dashboard', name: 'Today',
        why: 'The first screen of the day. It names the one thing the numbers point at this week and shows whether the week\'s sessions are being done.',
        steps: [
            'Read the One Thing card. It is drawn from his own bouts and lessons, and the line under it says which figure put it there.',
            'Check This Week: bouts, body and mind sessions planned against sessions checked in. A zero the week of an event is the thing to fix first.',
            'Switch fencer with the name at the top left. A parent sees every fencer; a fencer\'s own login sees only himself.'
        ],
        fields: [
            ['One Thing', 'The single item with the strongest evidence behind it this week. The sentence under it is the evidence.'],
            ['Sessions this week', 'Planned against done, from the weekly plan and its check-ins.']
        ]
    },
    {
        route: 'bouts', name: 'Bouts',
        why: 'The bout journal. Competition losses arrive by themselves from the results with the facts already filled in; the fencer adds what happened and what he learned.',
        steps: [
            'Open a lost bout waiting for its reflection. Opponent, score, round and event are already there.',
            'Tap the actions that scored on him and the ones he scored with, then write the reflection in his own words.',
            'Read Taught and Beaten By after each competition: what the coach taught that is not holding yet, and what is beating him that has not been taught.'
        ],
        fields: [
            ['Opponent record', 'What that opponent has done recently, from our copy of the results.'],
            ['Taught and beaten by', 'Lesson topics of the last month set against the tactics that scored on him in bouts.']
        ]
    },
    {
        route: 'opponents', name: 'Scout',
        why: 'One page per opponent: his record, the head to head, and the notes a fencer keeps about how he fences.',
        steps: [
            'Pick an opponent from the list, or add one by USA Fencing member number.',
            'Choose the window: last 3, 6, 12 or 24 months, or lifetime. The record changes with it.',
            'Fill in the style profile after fencing him: tempo, distance, favourite actions. That is what no results page holds.'
        ],
        fields: [
            ['Record', 'Bouts and wins in the window, pools and DEs apart, one-touch bouts, and the record against each rating letter.'],
            ['Head to head', 'Every recorded bout between the two, with the score.'],
            ['Our rating', 'Our strength number for him. See the Legend.']
        ]
    },
    {
        route: 'lessons', name: 'Lessons',
        why: 'What the coach covered, in three kinds: private lessons, group classes and video study. This is the input the Train screen turns into a plan.',
        steps: [
            'Log a private lesson the same day: the topics, how each one held (fed, against resistance, or in a bout) and what failed on each.',
            'Mark a lesson as an action or a scenario. Scenarios are the ones that carry into bouts.',
            'For a video, paste the link; the two fencers come off the title. Answer the short interview. A "what I learned" identical to the last one is refused on purpose.'
        ],
        fields: [
            ['Held', 'Fed, against resistance, or in a bout: three states, not a score out of ten.'],
            ['What failed', 'One line per topic, required. It is the most useful thing on the page a month later.']
        ]
    },
    {
        route: 'train', name: 'Train',
        why: 'Given everything logged, what to fix this week and exactly how to work on it tonight.',
        steps: [
            'Read the priority skill at the top and the evidence under it.',
            'Open its drill: set-up, execution, cue, common fault, and what "passed" looks like.',
            'Tap "I did this" after the drill. A drill with no reps logged stays assigned; only logged reps count as done.'
        ],
        fields: [
            ['Priority', 'The skill whose trajectory across lessons is falling or stuck, with the ratings that show it.'],
            ['Assigned and done', 'Assigned is a drill prescribed but not yet logged. Done needs reps.']
        ]
    },
    {
        route: 'physical', name: 'Body',
        why: 'Conditioning: a categorized drill library, a one-tap daily template per fencer, and reps logged against targets.',
        steps: ['Pick the day\'s template or choose drills from the library.', 'Enter reps; a drill is done when reps reach the target.', 'The week of an event, follow the taper it suggests.'],
        fields: [['Done', 'Reps logged at or above the target for that drill.']]
    },
    {
        route: 'mental', name: 'Mind',
        why: 'Daily meditation and visualisation, scenario rehearsal, and a tournament-day checklist that appears in the week before an event.',
        steps: ['Toggle the daily items.', 'Rehearse a scenario before an event: the first three touches, a reset when behind.', 'In the seven days before a tournament, work through the checklist.'],
        fields: [['Check-ins', 'Each rehearsal counts toward the week\'s mind sessions on Today.']]
    },
    {
        route: 'style', name: 'Style',
        why: 'The fencer he wants to fence like, broken into traits he rates himself on, kept over time so the ambition becomes a visible trend.',
        steps: ['Rate each trait honestly, on the day.', 'Come back monthly; the trend is the point, not the number.'],
        fields: [['Trend', 'Self-ratings over time per trait.']]
    },
    {
        route: 'insight', name: 'Insight',
        why: 'Where a fencer is likely to finish at each coming event, and why: his form against the field around his seed.',
        steps: [
            'Read the two strengths side by side: the listed number and how he has actually been finishing. The gap between them is the message.',
            'Open an event to see the fencers around his seed with their recent record and flags.',
            'Use Refresh Their Records to rebuild the tier from our copy, and Brief This Tier for the coach\'s one-page read.'
        ],
        fields: [
            ['Windows', 'Each fencer\'s events and finishes over the last quarter, half year, nine months and year, in that category only.'],
            ['Flags', 'Short words for patterns in a record: rusty, fading in deep fields, form rising or dropping, erratic, a heavy schedule, a thin record. The Legend says what each one means.'],
            ['Coach brief', 'An AI reading of the tier, kept per event.']
        ]
    },
    {
        route: 'season', name: 'Season',
        why: 'Which weekends are worth the money, for each fencer, and why. Every event is sorted by what it does for him: fills a ranking slot, builds confidence, develops, rides along with a sibling, or is not worth going.',
        steps: [
            'Set what he is chasing in the goals card: the category, the secondary ones, who he travels with.',
            'Read the ranking plan: today\'s standing, the marks for top 16, 20 and 32, and which events fill the counted slots.',
            'Mark an event Going or Considering. Going creates the trip and its fare watch on Travel.',
            'Before the weekend, open the event card: the registered field, his seed, the odds of a top 8, the points and the cost per person.',
            'After the weekend, read Recent Bouts: each opponent with our rating and the two tags, upset and gave one away.'
        ],
        fields: [
            ['He\'d start, Top 8, expected finish', 'His seed in the registered field and the odds from a simulated bracket. The Legend explains the basis.'],
            ['Points', 'National points for that finish under USA Fencing\'s own tables, weighted by how likely each finish is.'],
            ['Per person, points per $100', 'Fare, half a room, the entry and half the driving. Multiply by who is going.'],
            ['Elite line', 'At a NAC, whether he makes the Elite bracket on the official entry list and today\'s ranking.'],
            ['Fencers to watch', 'The kids a few places above him: where they are entered and how they placed.'],
            ['Own strength', 'Our rating with its range, the bouts and events behind it, and his activity by quarter.']
        ]
    },
    {
        route: 'travel', name: 'Travel',
        why: 'Fares for each trip, watched daily, so "is today cheap?" becomes "is today cheap compared with the last month?".',
        steps: ['A trip marked Going on Season appears here with its watch.', 'Read the per-person figure: fare, bag and hotel included.', 'Book when the watch says the fare is low against its own history.'],
        fields: [['Effective per person', 'The fare plus the fencing bag and the hotel share, per traveller.']]
    },
    {
        route: 'settings', name: 'Settings',
        why: 'The parent\'s controls: each fencer\'s name, birth year and member number; which screens a fencer\'s own login can see; whether the kids see what a weekend costs.',
        steps: ['Under Parent: fencers, logins for the kids, home ZIP for trip costs, what the kids can see.', 'Under a fencer\'s name: only that fencer\'s own details.'],
        fields: [['Member number', 'His USA Fencing number. It keys his results, standings and entry lists.']]
    }
];

export async function mountTutorial(root) {
    root.innerHTML = '';
    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, ['Tutorial']),
        el('div', { class: 'today-sub' }, [el('span', {}, ['EACH SCREEN, IN ORDER'])])
    ]));
    root.appendChild(el('p', { style: { color: INK_MUTE, fontSize: '14px', lineHeight: '1.6', margin: '0 var(--gut) 12px', maxWidth: '640px' } }, [
        'A season runs through these screens in this order: log what happens, let the app read the results, decide the weekends, then read what the numbers say. Definitions of every figure are on the ',
        el('a', { href: '#legend', style: { color: INK } }, ['Legend']), '.'
    ]));
    // Contents
    root.appendChild(el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '0 var(--gut) 18px' } },
        PAGES.map((p) => el('a', { href: `#tutorial/${p.route}`, class: 'chip', onclick: (e) => { e.preventDefault(); document.getElementById(`tut-${p.route}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, [p.name]))));
    for (const p of PAGES) {
        const card = el('section', { class: 'card', id: `tut-${p.route}`, style: { margin: '0 var(--gut) 18px' } });
        card.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' } }, [
            el('div', { style: { fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: '700', fontSize: '24px', color: INK } }, [p.name]),
            el('a', { href: `#${p.route}`, class: 'label', style: { color: INK_MUTE, textDecoration: 'none' } }, ['Open the screen →'])
        ]));
        card.appendChild(el('p', { style: { color: INK, fontSize: '14px', lineHeight: '1.6', margin: '6px 0 10px' } }, [p.why]));
        card.appendChild(el('div', { class: 'label', style: { color: INK_MUTE, margin: '8px 0 4px' } }, ['How to use it']));
        card.appendChild(el('ol', { style: { margin: '0 0 10px 18px', padding: 0, color: INK, fontSize: '14px', lineHeight: '1.6' } }, p.steps.map((s) => el('li', { style: { marginBottom: '4px' } }, [s]))));
        card.appendChild(el('div', { class: 'label', style: { color: INK_MUTE, margin: '8px 0 4px' } }, ['What the figures mean']));
        for (const [term, text] of p.fields) {
            card.appendChild(el('div', { style: { padding: '8px 0', borderTop: '1px solid var(--rule)' } }, [
                el('div', { class: 'label', style: { color: INK, fontWeight: '700', marginBottom: '3px' } }, [term]),
                el('p', { style: { color: INK, fontSize: '14px', lineHeight: '1.55', margin: 0 } }, [text])
            ]));
        }
        root.appendChild(card);
    }
}
