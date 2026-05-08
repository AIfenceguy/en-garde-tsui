// Module 3.4 — Physical training.
// Differentiated daily plans (Raedyn explosive, Kaylan balanced/age-appropriate).
// Advisory taper banner T-5 days before next tournament.
// Advisory knee-pain nudge if knee soreness logged 3+ times in 14 days.

import { el, todayISO, fmtDate, daysUntil, toast } from '../lib/util.js';
import { activeProfile } from '../lib/state.js';
import { getPhysicalForDate, listPhysicalRecent, nextTournament, loadTaxonomies } from '../lib/db.js';
import { safeWrite } from '../lib/offline.js';
import { scaleSlider } from '../lib/chips.js';

const RAEDYN_PLAN = {
    daily: [
        { drill_slug: 'jump-squats', label: 'Jump squats', target_reps: 100, note: '4 × 25, 60s rest' }
    ],
    byDow: {
        1: [
            { drill_slug: 'broad-jumps', label: 'Broad jumps', target_reps: 20 },
            { drill_slug: 'depth-jumps', label: 'Depth jumps', target_reps: 12 },
            { drill_slug: 'core-circuit', label: 'Core circuit', target_reps: 1 },
            { drill_slug: 'footwork-ladder', label: 'Footwork ladder', target_reps: 1 }
        ],
        2: [
            { drill_slug: 'weapon-arm-circuit', label: 'Weapon-arm endurance', target_reps: 1 },
            { drill_slug: 'mobility-flow', label: 'Mobility flow', target_reps: 1 }
        ],
        3: [
            { drill_slug: 'single-leg-bounds', label: 'Single-leg bounds', target_reps: 16 },
            { drill_slug: 'core-circuit', label: 'Core circuit', target_reps: 1 },
            { drill_slug: 'footwork-ladder', label: 'Footwork ladder', target_reps: 1 }
        ],
        4: [
            { drill_slug: 'sprint-intervals', label: 'Sprint intervals (10–20m × 6–8)', target_reps: 8 }
        ],
        5: [
            { drill_slug: 'broad-jumps', label: 'Broad jumps', target_reps: 20 },
            { drill_slug: 'depth-jumps', label: 'Depth jumps', target_reps: 12 },
            { drill_slug: 'core-circuit', label: 'Core circuit', target_reps: 1 },
            { drill_slug: 'footwork-ladder', label: 'Footwork ladder', target_reps: 1 }
        ],
        6: [
            { drill_slug: 'weapon-arm-circuit', label: 'Weapon-arm endurance', target_reps: 1 },
            { drill_slug: 'mobility-flow', label: 'Mobility flow', target_reps: 1 }
        ],
        0: [
            { drill_slug: 'active-recovery', label: 'Active recovery', target_reps: 1 }
        ]
    }
};

const KAYLAN_PLAN = {
    daily: [
        { drill_slug: 'jump-squats', label: 'Jump squats', target_reps: 50, note: '2 × 25' },
        { drill_slug: 'mobility-flow', label: 'Mobility (3 min)', target_reps: 1 }
    ],
    byDow: {
        1: [
            { drill_slug: 'animal-movements', label: 'Animal movements', target_reps: 1 },
            { drill_slug: 'footwork-ladder', label: 'Footwork ladder', target_reps: 1 }
        ],
        2: [{ drill_slug: 'free-play', label: 'Free play / outdoor sport', target_reps: 1 }],
        3: [
            { drill_slug: 'plank-circuit', label: 'Plank circuit', target_reps: 1 },
            { drill_slug: 'footwork-ladder', label: 'Footwork ladder', target_reps: 1 }
        ],
        4: [{ drill_slug: 'free-play', label: 'Free play / outdoor sport', target_reps: 1 }],
        5: [{ drill_slug: 'animal-movements', label: 'Animal movements', target_reps: 1 }],
        6: [{ drill_slug: 'free-play', label: 'Free play / outdoor sport', target_reps: 1 }],
        0: [{ drill_slug: 'full-rest', label: 'Full rest day', target_reps: 1 }]
    }
};

function planForToday(role, isoDate) {
    const dow = new Date(isoDate + 'T00:00:00').getDay();
    const tpl = role === 'raedyn' ? RAEDYN_PLAN : (role === 'kaylan' ? KAYLAN_PLAN : null);
    if (!tpl) return [];
    return [...tpl.daily, ...((tpl.byDow[dow]) || [])];
}

function applyTaper(plan, daysToTournament) {
    if (daysToTournament == null || daysToTournament < 0 || daysToTournament > 5) return plan;
    return plan.map((d) => {
        const noPlyo = ['broad-jumps', 'depth-jumps', 'single-leg-bounds', 'sprint-intervals', 'jump-squats'].includes(d.drill_slug);
        const newTarget = noPlyo ? Math.max(1, Math.round(d.target_reps * 0.5)) : d.target_reps;
        return { ...d, target_reps: newTarget, _tapered: noPlyo };
    });
}

export async function mountPhysical(root) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, [el('p', { class: 'empty-line' }, ['Pick a profile.'])]));

    const date = todayISO();
    const [existing, recent, nextT] = await Promise.all([
        getPhysicalForDate(date), listPhysicalRecent(14), nextTournament()
    ]);

    const daysToT = nextT ? daysUntil(nextT.start_date) : null;
    const inTaper = daysToT != null && daysToT >= 0 && daysToT <= 5;

    let plan = planForToday(profile.role, date);
    plan = applyTaper(plan, daysToT);

    const completed = new Map((existing?.drills_completed || []).map((d) => [d.drill_slug, d]));
    for (const d of plan) {
        const c = completed.get(d.drill_slug);
        if (c) { d.actual_reps = c.actual_reps; d.done = !!c.done || (c.actual_reps >= d.target_reps); }
        else { d.actual_reps = 0; d.done = false; }
    }
    for (const c of (existing?.drills_completed || [])) {
        if (!plan.find((d) => d.drill_slug === c.drill_slug)) {
            plan.push({ ...c, label: c.label || c.drill_slug, target_reps: c.target_reps || 0, _adhoc: true });
        }
    }

    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, ['Physical']),
        el('div', { class: 'today-sub' }, [
            el('span', {}, [profile.name.toUpperCase()]),
            el('span', {}, [fmtDate(date).toUpperCase()])
        ])
    ]));

    if (inTaper) {
        root.appendChild(el('div', { class: 'card', style: { margin: '0 var(--gut) 16px', borderColor: 'var(--gold-soft)' } }, [
            el('div', { class: 'label', style: { color: 'var(--gold-cream)' } }, [`Taper · ${daysToT === 0 ? 'today' : daysToT + ' days'} to ${nextT.name}`]),
            el('p', { class: 'auth-tagline', style: { fontSize: '14px', margin: '8px 0 0', maxWidth: 'none' } }, ['Plyometric volume reduced ~50% as a guideline. Skip anything that feels heavy in the legs.'])
        ]));
    }

    const kneeHits = recent.filter((s) => s.injury_flag && /knee/i.test(s.soreness_location || '')).length;
    if (kneeHits >= 3) {
        root.appendChild(el('div', { class: 'card', style: { margin: '0 var(--gut) 16px', borderColor: 'rgba(192,138,126,0.3)' } }, [
            el('div', { class: 'label', style: { color: 'var(--loss)' } }, [`Knee soreness flagged ${kneeHits}× in last 14 days`]),
            el('p', { class: 'auth-tagline', style: { fontSize: '14px', margin: '8px 0 0', maxWidth: 'none' } }, ['When jump training overlaps with growth-plate development, rising knee pain is worth a check-in. Advisory only — talk to your coach.'])
        ]));
    }

    root.appendChild(el('div', { class: 'label-row' }, [
        el('span', { class: 'label' }, [`Today's drills · ${dayName(new Date(date + 'T00:00:00').getDay())}`])
    ]));

    for (const d of plan) {
        const repsInput = el('input', {
            type: 'number', min: 0, value: d.actual_reps || 0,
            'aria-label': `actual reps for ${d.label}`,
            class: 'field-input field-numeric',
            style: { textAlign: 'right', maxWidth: '60px' },
            onchange: (e) => { d.actual_reps = Number(e.target.value) || 0; d.done = d.actual_reps >= d.target_reps; rerow(); }
        });
        const row = el('div', { class: 'drill' + (d.done ? ' is-done' : '') }, [
            el('button', {
                type: 'button', class: 'drill-check',
                onclick: () => { d.done = !d.done; if (d.done && (!d.actual_reps || d.actual_reps < d.target_reps)) { d.actual_reps = d.target_reps; repsInput.value = d.target_reps; } rerow(); }
            }, [
                el('svg', { width: '12', height: '12', viewBox: '0 0 12 12', fill: 'none' }, [
                    el('path', { d: 'M2 6 L5 9 L10 3', stroke: '#15140f', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
                ])
            ]),
            el('div', { class: 'drill-body' }, [
                el('div', { class: 'drill-name' }, [
                    d.label,
                    d._tapered ? el('span', { class: 'label', style: { marginLeft: '8px', color: 'var(--gold-cream)' } }, ['TAPERED']) : null,
                    d._adhoc ? el('span', { class: 'label', style: { marginLeft: '8px' } }, ['AD-HOC']) : null
                ]),
                d.note ? el('div', { class: 'drill-meta' }, [d.note]) : null
            ]),
            repsInput
        ]);
        root.appendChild(row);
        function rerow() { row.classList.toggle('is-done', !!d.done); }
    }

    const energy = scaleSlider({ value: existing?.energy_1_10 ?? 7 });
    const sore = scaleSlider({ value: existing?.soreness_severity ?? 0, min: 0 });
    const sleep = el('input', { type: 'number', class: 'field-input field-numeric', step: '0.5', min: 0, max: 14, value: existing?.sleep_hours ?? '', placeholder: 'hours' });
    const soreLoc = el('input', { type: 'text', class: 'field-input', value: existing?.soreness_location || '', placeholder: 'where (optional)' });
    const injuryFlag = el('input', { type: 'checkbox', checked: !!existing?.injury_flag });
    const injuryNotes = el('textarea', { class: 'field-textarea', rows: 3, placeholder: "what's going on (optional)" }, [existing?.injury_notes || '']);

    root.appendChild(el('div', { class: 'label-row', style: { marginTop: '32px' } }, [
        el('span', { class: 'label' }, ["Today's body"])
    ]));
    root.appendChild(el('div', { style: { padding: '0 var(--gut)' } }, [
        el('div', { class: 'field' }, [el('label', { class: 'field-label' }, ['Energy 1–10']), energy]),
        el('div', { class: 'field' }, [el('label', { class: 'field-label' }, ['Soreness 0–10']), sore]),
        el('div', { class: 'field' }, [el('label', { class: 'field-label' }, ['Soreness — where']), soreLoc]),
        el('div', { class: 'field' }, [el('label', { class: 'field-label' }, ['Sleep last night (hrs)']), sleep]),
        el('div', { class: 'field' }, [
            el('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } }, [
                injuryFlag,
                el('span', { class: 'field-label', style: { letterSpacing: '0.18em' } }, ['Flag as injury day'])
            ])
        ]),
        el('div', { class: 'field' }, [el('label', { class: 'field-label' }, ['Injury notes']), injuryNotes])
    ]));

    root.appendChild(el('div', { style: { padding: '20px var(--gut) 16px' } }, [
        el('button', { class: 'btn btn-primary btn-mono-label btn-block', onclick: save }, ['Save today'])
    ]));

    if (recent.length) {
        root.appendChild(el('div', { class: 'label-row', style: { marginTop: '24px' } }, [
            el('span', { class: 'label' }, ['Last 14 days']),
            el('span', { class: 'label', style: { color: 'var(--ink-faint)' } }, [`${recent.length} SESSION${recent.length === 1 ? '' : 'S'}`])
        ]));
        root.appendChild(el('div', { class: 'chip-row', style: { padding: '0 var(--gut) 24px' } }, recent.map((s) =>
            el('span', { class: 'chip ' + (s.injury_flag ? '' : 'is-on'), style: s.injury_flag ? { color: 'var(--loss)', borderColor: 'rgba(192,138,126,0.3)' } : {} }, [
                fmtDate(s.date), ' · ', `${(s.drills_completed || []).length} drill${(s.drills_completed || []).length === 1 ? '' : 's'}`
            ])
        )));
    }

    async function save() {
        const drillsCompleted = plan.map((d) => ({
            drill_slug: d.drill_slug, label: d.label, target_reps: d.target_reps,
            actual_reps: d.actual_reps || 0, done: !!d.done
        }));
        const payload = {
            profile_id: profile.id, date,
            drills_completed: drillsCompleted,
            energy_1_10: energy.getValue(),
            soreness_location: soreLoc.value.trim() || null,
            soreness_severity: sore.getValue(),
            sleep_hours: sleep.value ? Number(sleep.value) : null,
            injury_flag: !!injuryFlag.checked,
            injury_notes: injuryNotes.value.trim() || null
        };
        try {
            await safeWrite({ table: 'physical_sessions', op: 'upsert', payload });
            toast('Saved' + (navigator.onLine ? '' : ' (offline — will sync)'));
        } catch (e) { toast('Save failed: ' + e.message, 'error'); }
    }
}

function dayName(dow) {
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
}
