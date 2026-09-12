// Legend - every number in the app, what it is, where it comes from and how
// often it moves. One screen, no data reads: the basis of each figure is the
// same for every family. Written first (Ricky, 2026-09-12: "legend and
// tutorial, then the video"); the tutorial and the video follow it.

import { el } from '../lib/util.js';

const INK = 'var(--ink)';
// Literal: var(--ink-mute) composites below AA on the cream surface.
const INK_MUTE = '#6B7280';

const SECTIONS = [
    {
        title: 'Where the numbers come from',
        intro: 'Three sources, all public facts, gathered slowly and kept in our own copy. Nothing on any screen is read from an outside site while you look at it.',
        items: [
            ['Our copy of the results', 'Every regional, national and international foil event since July 2023: placings, entry lists and each bout with its score. Brought up to date each morning; results usually land the day after an event.'],
            ['USA Fencing', 'The national standings, the tournament calendar and the official entry lists, read a few pages a night at random moments.'],
            ['askFRED', 'Club and local tournaments within 60 miles of home, through their API under our account, once a morning.'],
            ['What you type', 'Lessons, drills, bout reflections, plans and check-ins. Facts the results already know are filled in for you; you type only what happened and what you learned.']
        ]
    },
    {
        title: 'Strength',
        items: [
            ['Own strength', 'Our rating, from every regional-and-up bout he has fenced since July 2023, the win and the score both counting. 400 points apart is ten to one in a 15-touch bout. Shown with a ± range, the bouts and events behind it, and how many events he fenced in the last 3, 6, 9 and 12 months. Needs 12 bouts before it is shown. Wins over fencers far below cannot raise it; losses to fencers far above cannot lower it. Club events do not count. Recomputed each morning.'],
            ['Change over the last year', 'The rating a year ago against today. A later bout can revise an earlier day, so this is a hindsight figure; today\'s number is the stable one.'],
            ['Official DE strength', 'The outside strength number printed on the entry lists we copy, updated every other day in the weeks before an event. A different scale from ours: it runs to about 5000 and starts new fencers at 2500.'],
            ['Form strength', 'His placings in the last three and six months, mapped onto that same outside scale by where he finished in each field, recent events weighing more. "Fencing 285 above his seed" means he has been finishing like a fencer listed 285 higher.'],
            ['Thin', 'A rating from fewer than twelve bouts. Treat it as a guess.']
        ]
    },
    {
        title: 'Season',
        items: [
            ['Field', 'Who is registered, from our copy of the entry list, refreshed every other day in the three weeks before an event. A list we could not read in full is never scored short; it is left out.'],
            ['He\'d start', 'His seed in that field on form strength, with the official seed in brackets. "By pools" is where his pool strength would draw him.'],
            ['Top 8 and expected finish', 'A bracket simulated many times from the seeds, each bout decided on the strength gap. Expected is the median finish.'],
            ['Points', 'National points for that finish under the 2026-27 tables, weighted by how likely each finish is. Youth events pay from the handbook table; an SYC pays 80% of it to the top 40% of the field, at most 64 places. Cadet, Junior and Division I pay from the trial tables; at a NAC the Elite figure is in brackets.'],
            ['Counts toward', 'Every standings list the result feeds. A national Cadet, Junior or Division I result is also a Y14 result.'],
            ['Ranking plan', 'Best four results count for Y14, at most one SYC; best six for Cadet. Today\'s total, the marks for top 16, 20, 32 and 64, and where the plan would leave him. Standings roll twelve months, so old results drop out as new ones land.'],
            ['Elite line', 'At a NAC with 169 or more entries the field splits two weeks out; the Elite bracket takes the ranked entrants. The line is drawn from the official entry list and the current ranking.'],
            ['Per person and points per $100', 'A return fare, half a hotel room per night, the entry and half the driving from home. Multiply by who is going. A live fare from Travel replaces the estimate.'],
            ['Fencers to watch', 'The fencers a few places above him on the standings: where they are entered and their recent placings, from our copy.'],
            ['Recent bouts', 'From the results, with our rating for each opponent. Upset: a win over a fencer 120 or more above him. Gave one away: a loss to one 200 or more below.'],
            ['Local club events', 'Within 60 miles of home, from askFRED. No national points; a Saturday of bouts.']
        ]
    },
    {
        title: 'Insight',
        items: [
            ['Windows', 'For each fencer around his seed: events, median finish as a percentage of the field, best and worst, over 90, 180, 270 and 365 days, in the event\'s own category only.'],
            ['Flags', 'Rusty: 60 days since his last event anywhere. Not here lately: 120 days since this category. Fades in deep fields: median 15 points worse in fields of 100 or more. Form rising or dropping: median moved 12 points over six months, four events or more. Erratic: finishes span 60 points in a year. Heavy schedule: four events here in 90 days. Thin record: one or two events here in a year.'],
            ['Refresh their records', 'Rebuilds the tier from our copy: profile facts and placings, regional and up. Nothing is read from outside.'],
            ['Coach brief', 'One AI reading of the whole tier, kept per event until you refresh it.']
        ]
    },
    {
        title: 'Scout and Bouts',
        items: [
            ['Record', 'Bouts and wins over the last 3, 6, 12, 24 months or lifetime, pools and DEs apart, one-touch bouts, and the record against each rating letter. From our copy, regional and up.'],
            ['Head to head', 'Every recorded bout between the two, with the score, from the results.'],
            ['Lost bouts', 'Competition losses pulled from the results with the facts filled in, waiting for the reflection.'],
            ['Taught and beaten by', 'Lesson topics of the last 30 days against the tactics that scored on him in bouts: what was taught and is not holding yet, and what is beating him and has not been taught.']
        ]
    },
    {
        title: 'Lessons, Train and Today',
        items: [
            ['Held', 'How a topic held in the lesson: fed, against resistance, or in a bout. Each topic also records what failed.'],
            ['Assigned and done', 'A drill with no reps logged is assigned, not done. Done counts only when reps are logged.'],
            ['This week', 'Sessions planned against sessions checked in, for bouts, body and mind. In the week of an event the Season screen says when the check-ins are still at zero.'],
            ['One thing', 'The single item the numbers point at this week, with the figure behind it.']
        ]
    },
    {
        title: 'Travel and standings',
        items: [
            ['Fares', 'Google Flights prices for each watched trip, checked once a day, with the fencing bag and hotel added to reach a per-person figure.'],
            ['Standings', 'USA Fencing\'s national lists, read overnight. Youth from the national points pages, Cadet and Junior from the ranking. The date on each card is the list\'s own date.']
        ]
    }
];

export async function mountLegend(root) {
    root.innerHTML = '';
    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, ['Legend']),
        el('div', { class: 'today-sub' }, [el('span', {}, ['EVERY NUMBER, ITS BASIS'])])
    ]));
    root.appendChild(el('p', { style: { color: INK_MUTE, fontSize: '14px', lineHeight: '1.6', margin: '0 var(--gut) 18px', maxWidth: '640px' } }, [
        'No figure on any screen is shown without the facts behind it. This page says, for each one, what it is, where it comes from and how often it moves. A number we cannot stand behind is not shown at all.'
    ]));
    for (const s of SECTIONS) {
        const card = el('section', { class: 'card', style: { margin: '0 var(--gut) 18px' } });
        card.appendChild(el('div', { style: { fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: '700', fontSize: '24px', color: INK, margin: '0 0 6px' } }, [s.title]));
        if (s.intro) card.appendChild(el('p', { style: { color: INK_MUTE, fontSize: '13px', lineHeight: '1.55', margin: '0 0 10px' } }, [s.intro]));
        for (const [term, text] of s.items) {
            card.appendChild(el('div', { style: { padding: '10px 0', borderTop: '1px solid var(--rule)' } }, [
                el('div', { class: 'label', style: { color: INK, fontWeight: '700', marginBottom: '4px' } }, [term]),
                el('p', { style: { color: INK, fontSize: '14px', lineHeight: '1.6', margin: 0 } }, [text])
            ]));
        }
        root.appendChild(card);
    }
}
