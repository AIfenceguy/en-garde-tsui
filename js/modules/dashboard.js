// Dashboard — "Today" landing.
// Shows: greeting, countdown to next tournament, today's body/mental status,
// recent bouts, quick actions.

import { el, todayISO, fmtDate, fmtDateLong, daysUntil } from '../lib/util.js';
import { activeProfile } from '../lib/state.js';
import {
    nextTournament, getPhysicalForDate, getMentalForDate,
    listBouts, listOpponents
} from '../lib/db.js';

export async function mountDashboard(root) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, ['Pick a profile to begin.']));

    const date = todayISO();
    const [nextT, phys, ment, recentBouts, opps] = await Promise.all([
        nextTournament(),
        getPhysicalForDate(date),
        getMentalForDate(date),
        listBouts({ limit: 5 }),
        listOpponents()
    ]);

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, [`${greeting()}, ${profile.name}.`]),
        el('span', { class: 'meta' }, [fmtDateLong(date)])
    ]));

    // countdown card
    if (nextT) {
        const d = daysUntil(nextT.start_date);
        const inWindow = d >= 0 && d <= 7;
        const tone = d <= 5 ? 'taper' : '';
        root.appendChild(el('div', { class: `card ${inWindow ? 'bordered-accent' : ''}` }, [
            el('div', { class: 'card-head' }, [
                el('h3', {}, [nextT.name]),
                el('span', { class: 'card-meta' }, [d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`])
            ]),
            el('p', { class: 'kicker' }, [
                fmtDate(nextT.start_date),
                nextT.end_date && nextT.end_date !== nextT.start_date ? ' – ' + fmtDate(nextT.end_date) : '',
                nextT.location ? ' · ' + nextT.location : ''
            ]),
            (nextT.events || []).length
                ? el('div', { class: 'chips', style: { marginTop: '8px' } }, nextT.events.map((e) => el('span', { class: 'chip on' }, [e])))
                : null
        ]));
    } else {
        root.appendChild(el('div', { class: 'card' }, [
            el('p', { class: 'muted italic' }, ['No upcoming tournament on file.']),
            el('a', { href: '#tournaments', class: 'btn-link' }, ['Add tournament →'])
        ]));
    }

    // today's status meters
    root.appendChild(el('div', { class: 'card' }, [
        el('h4', {}, ['Today\'s status']),
        meter('Body', phys
            ? `${(phys.drills_completed || []).filter((d) => d.done).length} / ${(phys.drills_completed || []).length} drills · energy ${phys.energy_1_10 || '–'} / 10`
            : 'no log yet',
            '#physical', phys ? 'logged' : 'log →'),
        meter('Mind', ment
            ? `${[ment.visualization_done, ment.breathing_done, ment.in_bout_cue_practice].filter(Boolean).length} / 3 daily reps · ${(ment.scenarios_rehearsed || []).length} scenarios`
            : 'no log yet',
            '#mental', ment ? 'logged' : 'log →')
    ]));

    // recent bouts
    if (recentBouts.length) {
        root.appendChild(el('div', { class: 'section-head', style: { marginTop: '24px' } }, [
            el('h2', {}, ['Recent bouts']),
            el('a', { href: '#bouts', class: 'btn-link' }, ['view all →'])
        ]));
        for (const b of recentBouts) {
            root.appendChild(el('a', {
                href: `#bouts/show?id=${b.id}`,
                class: `bout-row ${b.outcome || ''}`,
                style: { textDecoration: 'none' }
            }, [
                el('div', { class: 'bout-date' }, [fmtDate(b.date)]),
                el('div', {}, [
                    el('div', { class: 'bout-opponent' }, [b.opponent_name || '—']),
                    el('div', { class: 'bout-context' }, [b.context || ''])
                ]),
                el('div', { class: 'bout-score' }, [
                    el('span', { class: 'you' }, [String(b.my_score ?? '–')]),
                    ' – ', String(b.their_score ?? '–')
                ])
            ]));
        }
    } else {
        root.appendChild(el('div', { class: 'card', style: { marginTop: '24px' } }, [
            el('p', { class: 'muted italic' }, ['No bouts yet.']),
            el('a', { href: '#bouts/new', class: 'btn-link' }, ['Log a bout →'])
        ]));
    }

    // scout quick-look
    if (opps.length) {
        root.appendChild(el('div', { class: 'section-head', style: { marginTop: '24px' } }, [
            el('h2', {}, ['Scouts']),
            el('a', { href: '#opponents', class: 'btn-link' }, ['view all →'])
        ]));
        const top = opps.slice(0, 6);
        root.appendChild(el('div', { class: 'chips' }, top.map((o) =>
            el('a', { href: `#opponents/show?id=${o.id}`, class: 'chip' }, [o.name])
        )));
    }

    // quick actions
    root.appendChild(el('div', { style: { marginTop: '24px' } }, [
        el('h4', {}, ['Quick log']),
        el('div', { class: 'btn-row' }, [
            el('a', { href: '#bouts/new', class: 'btn' }, ['Bout']),
            el('a', { href: '#physical', class: 'btn btn-ghost' }, ['Body']),
            el('a', { href: '#mental', class: 'btn btn-ghost' }, ['Mind']),
            el('a', { href: '#lessons', class: 'btn btn-ghost' }, ['Lesson'])
        ])
    ]));

    // settings shortcut
    root.appendChild(el('div', { class: 'divider' }));
    root.appendChild(el('div', { class: 'btn-row' }, [
        el('a', { href: '#tournaments', class: 'btn-link' }, ['Tournaments →']),
        el('a', { href: '#import-v1', class: 'btn-link' }, ['Import v1 data →'])
    ]));
}

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
}

function meter(label, data, href, action) {
    return el('div', { class: 'meter' }, [
        el('div', {}, [
            el('div', { class: 'meter-label' }, [label]),
            el('div', { class: 'kicker' }, [data])
        ]),
        el('a', { href, class: 'btn-link' }, [action])
    ]);
}
