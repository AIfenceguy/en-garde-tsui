// Module 4.1 — Travel (parent view). Flight price watching.
//
// Kelly checks fares by hand every day. A watch records the route and dates
// once; a daily job records what the fare was. That turns "is today cheap?"
// into "is today cheap compared to the last 30 days?", which is the question
// that actually decides whether to book.
//
// Prices are fetched by a scheduled job outside the browser, because a fares
// API key must never ship in a static site. See tools/flight-check.ps1.

import { el, todayISO, fmtDate, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { getState } from '../lib/state.js';
import { activeProfile } from '../lib/state.js';
import { safeWrite } from '../lib/offline.js';

const INK = 'var(--ink, #1A1D24)';
// Literal, not var(--ink-mute): that token composites to ~3.1:1 on white.
const INK_MUTE = '#6B7280';
const GOOD = '#1f7a1f';
const BAD = '#9b2230';

// Free carrier email-to-SMS gateways, so an alert costs nothing to send.
const CARRIERS = [
    { value: '', label: 'Pick carrier (for free texts)' },
    { value: 'vtext.com', label: 'Verizon' },
    { value: 'txt.att.net', label: 'AT&T' },
    { value: 'tmomail.net', label: 'T-Mobile' },
    { value: 'messaging.sprintpcs.com', label: 'Sprint' },
    { value: 'vmobl.com', label: 'Virgin Mobile' },
    { value: 'mymetropcs.com', label: 'Metro PCS' },
    { value: 'msg.fi.google.com', label: 'Google Fi' },
    { value: 'sms.mycricket.com', label: 'Cricket' }
];

// The airports this family can realistically fly out of. Ontario is the
// default preference; the rest are worth pricing because the saving is often
// larger than the extra drive.
const HOME_AIRPORTS = [
    { code: 'ONT', name: 'Ontario' },
    { code: 'LAX', name: 'Los Angeles' },
    { code: 'SNA', name: 'Santa Ana' },
    { code: 'LGB', name: 'Long Beach' },
    { code: 'BUR', name: 'Burbank' }
];

const inputStyle = { color: INK };
const selectStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.15)', background: '#fff',
    color: INK, fontSize: '15px', fontFamily: 'inherit'
};

function field(label, control, hint) {
    return el('div', { class: 'field', style: { marginTop: '12px' } }, [
        el('label', { style: { color: INK_MUTE } }, [label]),
        hint ? el('div', { style: { color: INK_MUTE, fontSize: '12px', margin: '2px 0 6px' } }, [hint]) : null,
        control
    ]);
}

function money(n) {
    return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export async function mountTravel(root) {
    const profile = activeProfile();
    const session = getState().session;

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Travel']),
        el('span', { class: 'meta' }, [profile?.name || ''])
    ]));

    // Parent-only: the boys' views stay about fencing.
    if (profile && profile.role !== 'parent') {
        root.appendChild(el('div', { class: 'empty' }, ['Switch to the Parent profile to plan travel.']));
        return;
    }

    const [{ data, error }, tripsRes] = await Promise.all([
        supa.from('flight_watches')
            .select('*, flight_prices(price, currency, airline, booking_url, stops, origin, observed_at)')
            .is('deleted_at', null)
            .order('depart_date'),
        // What the trip is actually for: the competitions, and the travel
        // constraints derived from their schedule.
        supa.from('trip_overview').select('*').order('event_date')
    ]);
    const tripsByWatch = new Map();
    for (const t of (tripsRes?.data || [])) {
        if (!tripsByWatch.has(t.watch_id)) tripsByWatch.set(t.watch_id, []);
        tripsByWatch.get(t.watch_id).push(t);
    }

    if (error) {
        root.appendChild(el('div', { class: 'card' }, [
            el('p', { style: { color: BAD } }, ['Could not load watches: ' + error.message])
        ]));
        return;
    }
    const watches = data || [];

    root.appendChild(el('div', { class: 'btn-row', style: { margin: '12px 0' } }, [
        el('button', { class: 'btn', onclick: () => openForm() }, ['+ Watch a flight'])
    ]));

    const formMount = el('div', {});
    root.appendChild(formMount);
    const listMount = el('div', {});
    root.appendChild(listMount);
    renderList();

    function renderList() {
        listMount.innerHTML = '';
        if (!watches.length) {
            listMount.appendChild(el('div', { class: 'empty' }, ['no flights being watched yet']));
            return;
        }
        for (const w of watches) listMount.appendChild(watchCard(w));
    }

    function watchCard(w) {
        const prices = (w.flight_prices || [])
            .slice()
            .sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));

        // A single check writes one row per airport, all sharing a timestamp,
        // so "the last row" is arbitrary and was showing the most expensive
        // airport as the headline. What matters is the cheapest fare on the
        // most recent day we looked.
        const dayOf = (p) => String(p.observed_at).slice(0, 10);
        const latestDay = prices.length ? dayOf(prices[prices.length - 1]) : null;
        const latestBatch = prices.filter((p) => dayOf(p) === latestDay);
        const latest = latestBatch.length
            ? latestBatch.reduce((m, p) => (Number(p.price) < Number(m.price) ? p : m), latestBatch[0])
            : null;
        const cheapest = prices.length
            ? prices.reduce((m, p) => (Number(p.price) < Number(m.price) ? p : m), prices[0])
            : null;

        // One point per day (that day's best fare), so the curve tracks the
        // decision instead of zig-zagging between airports.
        const dailyBest = Array.from(
            prices.reduce((map, p) => {
                const d = dayOf(p);
                if (!map.has(d) || Number(p.price) < Number(map.get(d).price)) map.set(d, p);
                return map;
            }, new Map()).entries()
        ).sort((a, b) => a[0].localeCompare(b[0])).map(([, p]) => p);

        const card = el('div', { class: 'card bordered-accent', style: { marginBottom: '10px' } });

        const originList = (w.origins?.length ? w.origins : [w.origin]).filter(Boolean);

        card.appendChild(el('div', { class: 'card-head' }, [
            el('h3', { style: { color: INK } }, [
                `${originList.join('/')} → ${w.destination}`
            ]),
            el('span', { class: 'card-meta' }, [
                fmtDate(w.depart_date), w.return_date ? ` – ${fmtDate(w.return_date)}` : ''
            ])
        ]));

        if (w.label) {
            card.appendChild(el('div', { class: 'kicker', style: { color: INK_MUTE } }, [w.label]));
        }

        // What the trip is for. A price with no purpose attached is the dead end
        // Ricky ran into - this is the competition driving the dates, and the
        // constraints that follow from its schedule.
        const trips = tripsByWatch.get(w.id) || [];
        if (trips.length) {
            const box = el('div', {
                style: {
                    marginTop: '10px', padding: '10px 12px',
                    background: 'rgba(0,0,0,0.03)', borderRadius: '8px'
                }
            });
            box.appendChild(el('div', { class: 'kicker', style: { color: INK_MUTE } }, ['Competing']));
            for (const t of trips) {
                const d = new Date(t.event_date + 'T00:00:00');
                const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                box.appendChild(el('div', { style: { color: INK, fontSize: '14px', marginTop: '4px' } }, [
                    `${when} · ${t.event_name}`,
                    t.fencer ? el('span', { style: { color: INK_MUTE } }, [` — ${t.fencer}`]) : null,
                    t.start_time_is_placeholder
                        ? el('span', { style: { color: INK_MUTE, fontSize: '12px' } }, [' · time TBD, planned as 8am'])
                        : null
                ]));
            }
            // The two constraints that actually decide which flights are legal.
            const first = trips[0];
            const last = trips[trips.length - 1];
            box.appendChild(el('div', { style: { color: INK_MUTE, fontSize: '12px', marginTop: '8px', lineHeight: '1.6' } }, [
                `Be on the ground by ${new Date(first.be_on_ground_by).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
                el('br', {}),
                `No return before ${String(last.no_return_before).slice(0, 5)} on ${new Date(last.event_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            ]));

            // Flag a booked return that lands before the fencer could be finished.
            if (w.return_date && last.event_date === w.return_date) {
                box.appendChild(el('div', {
                    style: { color: BAD, fontSize: '13px', marginTop: '8px', fontWeight: '600' }
                }, [`Return is the same day as ${last.event_name} — only an evening flight works.`]));
            }
            card.appendChild(box);
        }

        if (!prices.length) {
            card.appendChild(el('p', { style: { color: INK_MUTE, fontSize: '13px', margin: '8px 0 0' } }, [
                w.last_checked_at
                    ? 'Checked, but no fares came back yet.'
                    : 'Not checked yet — the daily job has not run for this watch.'
            ]));
        } else {
            const cur = Number(latest.price);
            const min = Number(cheapest.price);
            const isBest = cur <= min;
            const perSeat = cur / (w.passengers || 1);
            const hitTarget = w.target_price && perSeat <= w.target_price;

            card.appendChild(el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '8px' } }, [
                el('span', {
                    style: {
                        color: hitTarget ? GOOD : INK,
                        fontSize: '30px', fontWeight: '700', fontFamily: 'var(--mono)'
                    }
                }, [money(cur / (w.passengers || 1))]),
                // Per seat leads. The API hands back a party total, but nobody
                // books that way - showing $317 for a fare Kelly bought at $159
                // made her own flight unrecognisable.
                (w.passengers > 1)
                    ? el('span', { style: { color: INK_MUTE, fontSize: '13px' } }, [
                        `each · ${money(cur)} for ${w.passengers}`
                    ])
                    : null,
                latest.origin
                    ? el('span', { style: { color: INK, fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: '600' } }, [`from ${latest.origin}`])
                    : null,
                latest.airline ? el('span', { style: { color: INK_MUTE, fontSize: '13px' } }, [latest.airline]) : null,
                typeof latest.stops === 'number'
                    ? el('span', { style: { color: INK_MUTE, fontSize: '13px' } }, [latest.stops === 0 ? 'nonstop' : `${latest.stops} stop${latest.stops === 1 ? '' : 's'}`])
                    : null
            ]));

            // The judgement Kelly actually needs: cheap relative to what we've seen.
            const verdict = isBest
                ? { text: 'Lowest price seen so far', color: GOOD }
                : { text: `${money((cur - min) / (w.passengers || 1))}/seat above the low of ${money(min / (w.passengers || 1))} on ${fmtDate(cheapest.observed_at)}`, color: INK_MUTE };
            card.appendChild(el('div', { style: { color: verdict.color, fontSize: '13px', marginTop: '2px' } }, [verdict.text]));

            if (w.target_price) {
                card.appendChild(el('div', {
                    style: { color: hitTarget ? GOOD : INK_MUTE, fontSize: '13px', marginTop: '2px', fontWeight: hitTarget ? '600' : '400' }
                }, [hitTarget ? `At or below your ${money(w.target_price)}/seat target — book it.` : `Target ${money(w.target_price)}/seat`]));
            }

            // Per-airport comparison: the preferred airport is listed first and
            // labelled, so a $12 saving at a farther airport is obvious rather
            // than hidden behind a single "cheapest" number.
            const pax = w.passengers || 1;
            if (originList.length > 1) {
                const bestBy = new Map();
                for (const p of prices) {
                    if (!p.origin) continue;
                    const cur = bestBy.get(p.origin);
                    if (!cur || Number(p.price) < Number(cur.price)) bestBy.set(p.origin, p);
                }
                if (bestBy.size) {
                    const overall = Math.min(...Array.from(bestBy.values()).map((p) => Number(p.price)));
                    const ordered = Array.from(bestBy.entries()).sort((a, b) => {
                        if (a[0] === w.preferred_origin) return -1;
                        if (b[0] === w.preferred_origin) return 1;
                        return Number(a[1].price) - Number(b[1].price);
                    });
                    const rows = ordered.map(([code, p]) => {
                        const isPref = code === w.preferred_origin;
                        const diff = Number(p.price) - overall;
                        return el('div', {
                            style: {
                                display: 'flex', alignItems: 'baseline', gap: '8px',
                                padding: '3px 0', fontSize: '13px'
                            }
                        }, [
                            el('span', {
                                style: { fontFamily: 'var(--mono)', fontWeight: '700', color: isPref ? 'var(--accent)' : INK, minWidth: '38px' }
                            }, [code]),
                            isPref ? el('span', { style: { color: 'var(--accent)', fontSize: '11px' } }, ['★']) : null,
                            el('span', { style: { color: INK, fontFamily: 'var(--mono)' } }, [money(p.price / pax)]),
                            diff > 0
                                ? el('span', { style: { color: INK_MUTE, fontSize: '12px' } }, [`+${money(diff / pax)}`])
                                : el('span', { style: { color: GOOD, fontSize: '12px' } }, ['cheapest'])
                        ]);
                    });
                    card.appendChild(el('div', { style: { marginTop: '8px' } }, [
                        el('div', { class: 'kicker', style: { color: INK_MUTE } }, ['By airport']),
                        ...rows
                    ]));
                }
            }

            if (dailyBest.length > 1) card.appendChild(sparkline(dailyBest));

            card.appendChild(el('div', { style: { color: INK_MUTE, fontSize: '11px', marginTop: '4px', fontFamily: 'var(--mono)' } }, [
                // days looked, not rows written - one check writes a row per airport
                `checked ${dailyBest.length} day${dailyBest.length === 1 ? '' : 's'}`,
                w.last_checked_at ? ` · last ${fmtDate(w.last_checked_at.slice(0, 10))}` : ''
            ]));

            if (latest.booking_url) {
                card.appendChild(el('a', {
                    href: latest.booking_url, target: '_blank', rel: 'noopener',
                    style: {
                        display: 'inline-block', marginTop: '10px', color: 'var(--accent)',
                        fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px', fontWeight: '700',
                        letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none'
                    }
                }, ['book this →']));
            }
        }

        card.appendChild(el('div', { style: { marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '4px' } }, [
            el('button', {
                type: 'button',
                style: linkBtn(INK_MUTE),
                onclick: async () => {
                    await safeWrite({
                        table: 'flight_watches', op: 'update',
                        payload: { is_active: !w.is_active }, match: { id: w.id }
                    });
                    w.is_active = !w.is_active;
                    toast(w.is_active ? 'Watching again' : 'Paused');
                    renderList();
                }
            }, [w.is_active ? 'pause' : 'resume']),
            el('button', { type: 'button', style: linkBtn(INK_MUTE), onclick: () => openForm(w) }, ['edit']),
            el('button', {
                type: 'button', style: linkBtn(BAD),
                onclick: async () => {
                    if (!confirm('Stop watching this flight?')) return;
                    // Soft delete - the price history stays intact.
                    await safeWrite({
                        table: 'flight_watches', op: 'update',
                        payload: { deleted_at: new Date().toISOString() }, match: { id: w.id }
                    });
                    const i = watches.findIndex((x) => x.id === w.id);
                    if (i >= 0) watches.splice(i, 1);
                    toast('Removed');
                    renderList();
                }
            }, ['remove'])
        ]));

        return card;
    }

    function linkBtn(color) {
        return {
            background: 'transparent', border: 'none', padding: '4px 10px', margin: 0,
            cursor: 'pointer', fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px',
            fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
            color, borderRadius: '4px'
        };
    }

    // Tiny inline price curve — enough to see the shape without a chart library.
    function sparkline(prices) {
        const w = 260, h = 40, pad = 2;
        const vals = prices.map((p) => Number(p.price));
        const min = Math.min(...vals), max = Math.max(...vals);
        const span = max - min || 1;
        const step = vals.length > 1 ? (w - pad * 2) / (vals.length - 1) : 0;
        const pts = vals.map((v, i) => {
            const x = pad + i * step;
            const y = pad + (h - pad * 2) * (1 - (v - min) / span);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(h));
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `Price history: low ${money(min)}, high ${money(max)}`);
        svg.style.marginTop = '8px';
        svg.style.display = 'block';

        if (vals.length > 1) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            line.setAttribute('points', pts);
            line.setAttribute('fill', 'none');
            line.setAttribute('stroke', 'var(--accent, #a82b2b)');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-linejoin', 'round');
            line.setAttribute('stroke-linecap', 'round');
            svg.appendChild(line);
        }
        // Mark the most recent observation.
        const lastX = pad + (vals.length - 1) * step;
        const lastY = pad + (h - pad * 2) * (1 - (vals[vals.length - 1] - min) / span);
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', String(lastX));
        dot.setAttribute('cy', String(lastY));
        dot.setAttribute('r', '3');
        dot.setAttribute('fill', 'var(--accent, #a82b2b)');
        svg.appendChild(dot);
        return svg;
    }

    // ------------------------------------------------------------------
    // Add / edit a watch
    // ------------------------------------------------------------------
    function openForm(editing) {
        formMount.innerHTML = '';
        const form = el('form', { class: 'card', onsubmit: async (e) => { e.preventDefault(); await save(); } });
        formMount.appendChild(form);

        form.appendChild(field('What is this trip?',
            el('input', { type: 'text', name: 'label', placeholder: 'e.g. Summer Nationals', value: editing?.label || '', style: inputStyle })
        ));

        // Multi-origin: tick every airport worth pricing, star the one you want.
        const chosen = new Set(editing?.origins?.length ? editing.origins : ['ONT']);
        let preferred = editing?.preferred_origin || 'ONT';

        const originsBox = el('div', {});
        function renderOrigins() {
            originsBox.innerHTML = '';
            for (const a of HOME_AIRPORTS) {
                const on = chosen.has(a.code);
                const isPref = preferred === a.code;
                originsBox.appendChild(el('div', {
                    style: {
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)'
                    }
                }, [
                    el('input', {
                        type: 'checkbox', checked: on,
                        onchange: (e) => {
                            if (e.target.checked) chosen.add(a.code);
                            else {
                                chosen.delete(a.code);
                                if (preferred === a.code) preferred = chosen.values().next().value || '';
                            }
                            renderOrigins();
                        }
                    }),
                    el('span', { style: { color: INK, fontFamily: 'var(--mono)', fontWeight: '600', minWidth: '40px' } }, [a.code]),
                    el('span', { style: { color: INK_MUTE, fontSize: '13px', flex: '1 1 auto' } }, [a.name]),
                    on ? el('button', {
                        type: 'button',
                        style: {
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px', fontWeight: '700',
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: isPref ? 'var(--accent)' : INK_MUTE
                        },
                        onclick: () => { preferred = a.code; renderOrigins(); }
                    }, [isPref ? '★ preferred' : '☆ prefer']) : null
                ]));
            }
        }
        renderOrigins();

        form.appendChild(field('Fly out of', originsBox,
            'tick every airport worth checking — star the one you would rather use'));

        form.appendChild(field('Fly to',
            el('input', { type: 'text', name: 'destination', placeholder: 'MKE', required: true, maxlength: 3, value: editing?.destination || '', style: Object.assign({ textTransform: 'uppercase' }, inputStyle) }),
            'three-letter airport code'
        ));

        form.appendChild(el('div', { class: 'row', style: { marginTop: '12px' } }, [
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Depart']),
                el('input', { type: 'date', name: 'depart_date', required: true, min: todayISO(), value: editing?.depart_date || '', style: inputStyle })
            ]),
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Return']),
                el('input', { type: 'date', name: 'return_date', min: todayISO(), value: editing?.return_date || '', style: inputStyle })
            ])
        ]));

        form.appendChild(el('div', { class: 'row' }, [
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Travellers']),
                el('input', { type: 'number', name: 'passengers', min: 1, max: 9, value: editing?.passengers ?? 1, style: inputStyle })
            ]),
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Alert under ($ total)']),
                el('input', { type: 'number', name: 'target_price', min: 0, placeholder: '718', value: editing?.target_price ?? '', style: inputStyle })
            ])
        ]));

        const nonstop = el('input', { type: 'checkbox', checked: !!editing?.nonstop_only });
        form.appendChild(el('label', {
            style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '10px', color: INK }
        }, [nonstop, el('span', { style: { color: INK } }, ['Nonstop only'])]));

        form.appendChild(el('div', {
            class: 'label-row',
            style: { marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(0,0,0,0.08)' }
        }, [el('span', { class: 'label', style: { color: INK } }, ['Where to send the alert'])]));

        form.appendChild(field('Mobile number',
            el('input', { type: 'tel', name: 'alert_phone', placeholder: '5551234567', value: editing?.alert_phone || '', style: inputStyle }),
            'digits only, no dashes'
        ));

        form.appendChild(field('Carrier',
            el('select', { name: 'carrier_gateway', style: selectStyle },
                CARRIERS.map((c) => el('option', {
                    value: c.value, selected: c.value === (editing?.carrier_gateway || ''), style: { color: INK }
                }, [c.label]))
            ),
            'texts are sent free through the carrier gateway'
        ));

        form.appendChild(field('Email as well (optional)',
            el('input', { type: 'email', name: 'alert_email', placeholder: 'kelly@…', value: editing?.alert_email || '', style: inputStyle })
        ));

        form.appendChild(el('div', { class: 'btn-row right', style: { marginTop: '18px' } }, [
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { formMount.innerHTML = ''; } }, ['Cancel']),
            el('button', { type: 'submit', class: 'btn' }, [editing ? 'Save changes' : 'Start watching'])
        ]));

        async function save() {
            const fd = new FormData(form);
            const up = (k) => (fd.get(k) || '').toString().trim().toUpperCase();
            const txt = (k) => (fd.get(k) || '').toString().trim() || null;

            const payload = {
                owner_user_id: session.user.id,
                label: txt('label'),
                origins: Array.from(chosen),
                preferred_origin: preferred || Array.from(chosen)[0] || null,
                // legacy single-origin column, kept in step for older readers
                origin: preferred || Array.from(chosen)[0] || null,
                destination: up('destination'),
                depart_date: fd.get('depart_date'),
                return_date: fd.get('return_date') || null,
                passengers: Number(fd.get('passengers')) || 1,
                nonstop_only: !!nonstop.checked,
                target_price: fd.get('target_price') ? Number(fd.get('target_price')) : null,
                alert_phone: (txt('alert_phone') || '').replace(/\D/g, '') || null,
                carrier_gateway: txt('carrier_gateway'),
                alert_email: txt('alert_email')
            };

            if (!payload.origins.length) {
                toast('Pick at least one departure airport', 'error');
                return;
            }
            if (payload.destination.length !== 3) {
                toast('Destination must be a 3-letter airport code', 'error');
                return;
            }

            try {
                if (editing) {
                    await safeWrite({ table: 'flight_watches', op: 'update', payload, match: { id: editing.id } });
                    Object.assign(editing, payload);
                } else {
                    const res = await safeWrite({ table: 'flight_watches', op: 'insert', payload });
                    const saved = res?.data?.[0];
                    watches.push(saved || { ...payload, id: 'pending-' + Date.now(), flight_prices: [] });
                }
                toast('Saved');
                formMount.innerHTML = '';
                renderList();
            } catch (e) {
                toast('Save failed: ' + e.message, 'error');
            }
        }
    }
}
