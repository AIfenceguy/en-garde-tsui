// Dashboard — "Today" landing.
// Editorial layout per the new design system: italic greeting, caps-mono labels,
// metric-grid for status, bout-card timeline for recent bouts.

import { el, todayISO, fmtDate, fmtDateLong, daysUntil } from '../lib/util.js';
import { activeProfile } from '../lib/state.js';
import {
    nextTournament, getPhysicalForDate, getMentalForDate,
    listBouts, listOpponents
} from '../lib/db.js';

export async function mountDashboard(root) {
    const profile = activeProfile();
    if (!profile) {
        root.appendChild(el('div', { class: 'empty' }, [
            el('p', { class: 'empty-line' }, ['Pick a profile to begin the day.'])
        ]));
        return;
    }

    const date = todayISO();
    const [nextT, phys, ment, recentBouts, opps] = await Promise.all([
        nextTournament(),
        getPhysicalForDate(date),
        getMentalForDate(date),
        listBouts({ limit: 5 }),
        listOpponents()
    ]);

    const heroSubBits = [el('span', {}, [fmtDateLong(date)])];
    if (nextT) {
        const d = daysUntil(nextT.start_date);
        const tName = nextT.name.length > 22 ? nextT.name.slice(0, 20) + '…' : nextT.name;
        heroSubBits.push(el('span', {}, [
            el('b', {}, [tName]),
            ' · ',
            d === 0 ? 'today' : (d === 1 ? '1 day' : `${d} days`)
        ]));
    }
    root.appendChild(el('div', { class: 'today-hero stagger' }, [
        el('h1', { class: 'today-greeting' }, [
            greeting(), ', ',
            el('span', { class: 'accent' }, [profile.name]),
            '.'
        ]),
        el('div', { class: 'today-sub' }, heroSubBits)
    ]));

    const bodyMetric = phys
        ? {
            val: `${(phys.drills_completed || []).filter((d) => d.done).length}/${(phys.drills_completed || []).length || '–'}`,
            foot: phys.energy_1_10 ? `energy ${phys.energy_1_10}/10` : 'logged'
        }
        : { val: '—', foot: 'no log yet' };
    const mindMetric = ment
        ? {
            val: `${[ment.visualization_done, ment.breathing_done, ment.in_bout_cue_practice].filter(Boolean).length}/3`,
            foot: (ment.scenarios_rehearsed || []).length
                ? `${(ment.scenarios_rehearsed || []).length} scenarios rehearsed`
                : 'logged'
        }
        : { val: '—', foot: 'no log yet' };

    root.appendChild(el('div', { class: 'metric-grid' }, [
        metricCell('TODAY · BODY', bodyMetric.val, bodyMetric.foot, '#physical'),
        metricCell('TODAY · MIND', mindMetric.val, mindMetric.foot, '#mental')
    ]));

    if (recentBouts.length) {
        root.appendChild(el('div', { class: 'label-row', style: { marginTop: '28px' } }, [
            el('span', { class: 'label' }, ['Recent bouts']),
            el('a', { href: '#bouts', class: 'label label-gold', style: { textDecoration: 'none' } }, ['VIEW ALL →'])
        ]));
        for (const b of recentBouts) {
            root.appendChild(boutCard(b));
        }
    } else {
        root.appendChild(el('div', { class: 'empty', style: { marginTop: '20px' } }, [
            el('p', { class: 'empty-line' }, ['Today is quiet. The first bout opens the journal.']),
            el('a', { href: '#bouts/new', class: 'btn btn-primary btn-mono-label empty-cta' }, ['Log a bout'])
        ]));
    }

    if (opps.length) {
        root.appendChild(el('div', { class: 'label-row', style: { marginTop: '28px' } }, [
            el('span', { class: 'label' }, ['Scout · recent']),
            el('a', { href: '#opponents', class: 'label label-gold', style: { textDecoration: 'none' } }, ['VIEW ALL →'])
        ]));
        root.appendChild(el('div', { class: 'chip-row', style: { padding: '0 var(--gut)' } }, opps.slice(0, 6).map((o) =>
            el('a', { href: `#opponents/show?id=${o.id}`, class: 'chip', style: { textDecoration: 'none' } }, [o.name])
        )));
    }

    root.appendChild(el('div', { style: { padding: '32px var(--gut) 16px' } }, [
        el('div', { class: 'label', style: { marginBottom: '14px' } }, ['Quick log']),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
            el('a', { href: '#bouts/new', class: 'btn btn-primary btn-mono-label' }, ['+ Bout']),
            el('a', { href: '#physical', class: 'btn btn-ghost btn-mono-label' }, ['Body']),
            el('a', { href: '#mental', class: 'btn btn-ghost btn-mono-label' }, ['Mind']),
            el('a', { href: '#lessons', class: 'btn btn-ghost btn-mono-label' }, ['Lesson'])
        ])
    ]));

    root.appendChild(el('div', { class: 'foil-divider' }));
    root.appendChild(el('div', { style: { display: 'flex', gap: '20px', justifyContent: 'center', padding: '0 var(--gut) 28px' } }, [
        el('a', { href: '#tournaments', class: 'label', style: { textDecoration: 'none' } }, ['Tournaments →']),
        el('a', { href: '#import-v1', class: 'label', style: { textDecoration: 'none' } }, ['Import v1 →'])
    ]));
}

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
}

function metricCell(label, val, foot, href) {
    return el('a', { href, class: 'metric', style: { textDecoration: 'none', color: 'inherit' } }, [
        el('div', { class: 'metric-label' }, [label]),
        el('div', { class: 'metric-val' }, [val]),
        el('div', { class: 'metric-foot' }, [foot])
    ]);
}

function boutCard(b) {
    const my = b.my_score ?? 0;
    const their = b.their_score ?? 0;
    const isWin = b.outcome === 'win';
    const isLoss = b.outcome === 'loss';

    const total = my + their;
    const ticks = [];
    for (let i = 0; i < total; i++) {
        ticks.push(el('span', { class: i < my ? 'touch-tick is-scored' : 'touch-tick' }));
    }
    const acts = Array.isArray(b.scoring_actions) ? b.scoring_actions : [];
    const lastAct = acts.length ? acts[acts.length - 1] : null;
    if (lastAct && /flick/i.test(lastAct.tactic_slug || '') && my > 0) {
        if (ticks[my - 1]) {
            ticks[my - 1] = el('span', { class: 'touch-tick is-flick' });
        }
    }

    const tags = [];
    if (b.opponent_rating) tags.push(el('span', { class: 'bout-card-opp-tag' }, [b.opponent_rating]));
    (b.opponent_archetypes || []).forEach((a) => tags.push(el('span', { class: 'bout-card-opp-tag' }, [a])));
    if (b.opponent_club) tags.push(el('span', { class: 'bout-card-opp-tag' }, [b.opponent_club]));

    const meta = [];
    meta.push(el('span', {}, [fmtDate(b.date).toUpperCase()]));
    if (b.context) meta.push(el('span', {}, [String(b.context).replace(/_/g, ' ').toUpperCase()]));
    if (b.location) meta.push(el('span', {}, [b.location.toUpperCase()]));

    return el('a', {
        href: `#bouts/show?id=${b.id}`,
        class: 'bout-card',
        style: { textDecoration: 'none', color: 'inherit', display: 'flex' }
    }, [
        el('div', { class: 'bout-card-head' }, [
            el('div', { class: 'bout-card-opp' }, [
                el('div', { class: 'bout-card-opp-name' }, [b.opponent_name || '—']),
                tags.length ? el('div', { class: 'bout-card-opp-tags' }, tags) : null
            ]),
            el('div', { style: { textAlign: 'right' } }, [
                el('div', { class: 'scoreline', style: { justifyContent: 'flex-end' } }, [
                    el('span', { class: `scoreline-num ${isWin ? 'is-win' : (isLoss ? 'is-loss' : '')}` }, [String(my)]),
                    el('span', { class: 'scoreline-sep' }, ['—']),
                    el('span', { class: 'scoreline-num' }, [String(their)])
                ]),
                ticks.length ? el('div', { class: 'touch-strip', style: { justifyContent: 'flex-end' } }, ticks) : null
            ])
        ]),
        b.reflection ? el('div', { class: 'bout-card-quote' }, [b.reflection]) : null,
        meta.length ? el('div', { class: 'bout-card-meta' }, meta) : null
    ]);
}
