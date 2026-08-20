// Module 4.1 — Travel (parent view). PLACEHOLDER.
//
// Reserved for the competition flight-price tracker: set an origin,
// destination and date window, then get alerted when the fare bottoms out.
// The layout below is the shell only; nothing is wired to a fares API yet
// because the provider has not been chosen (Amadeus free tier vs SerpAPI
// Google Flights vs scraping). See the note rendered on screen.
//
// Deliberately parent-only — the boys' views should stay about fencing.

import { el } from '../lib/util.js';
import { activeProfile } from '../lib/state.js';

const INK = 'var(--ink, #1A1D24)';
// Literal, not var(--ink-mute): that token composites to ~3.1:1 on white and
// fails AA. #6B7280 measures 4.65:1.
const INK_MUTE = '#6B7280';

export async function mountTravel(root) {
    const profile = activeProfile();

    root.appendChild(el('div', { class: 'section-head' }, [
        el('h2', {}, ['Travel']),
        el('span', { class: 'meta' }, [profile?.name || ''])
    ]));

    if (profile && profile.role !== 'parent') {
        root.appendChild(el('div', { class: 'empty' }, ['Switch to the Parent profile to plan travel.']));
        return;
    }

    root.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'label-row' }, [
            el('span', { class: 'label', style: { color: INK } }, ['Flight price watch'])
        ]),
        el('p', { style: { color: INK_MUTE, fontSize: '14px', lineHeight: '1.5', marginTop: '8px' } }, [
            'Coming next: pick a route and a date window, set the price you want, ',
            'and get a notification when fares drop to it.'
        ]),

        // Shell of the eventual form, shown disabled so the shape is visible.
        el('div', { class: 'row', style: { marginTop: '14px' } }, [
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['From']),
                el('input', { type: 'text', placeholder: 'LAX', disabled: true, style: { color: INK } })
            ]),
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['To']),
                el('input', { type: 'text', placeholder: 'tournament city', disabled: true, style: { color: INK } })
            ])
        ]),
        el('div', { class: 'row' }, [
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Depart']),
                el('input', { type: 'date', disabled: true, style: { color: INK } })
            ]),
            el('div', { class: 'field' }, [
                el('label', { style: { color: INK_MUTE } }, ['Return']),
                el('input', { type: 'date', disabled: true, style: { color: INK } })
            ])
        ]),
        el('div', { class: 'field' }, [
            el('label', { style: { color: INK_MUTE } }, ['Alert me under']),
            el('input', { type: 'number', placeholder: '450', disabled: true, style: { color: INK } })
        ]),

        el('div', {
            class: 'nudge',
            style: { marginTop: '16px', borderColor: 'var(--accent)', background: 'var(--accent-soft)' }
        }, [
            el('div', { class: 'nudge-head', style: { color: 'var(--accent)' } }, ['Needs a decision first']),
            el('p', { style: { color: INK, fontSize: '14px', lineHeight: '1.5', margin: '6px 0 0' } }, [
                'There is no free Google Flights API. The realistic options are ',
                'Amadeus (free tier, ~2k calls/month), SerpAPI\'s Google Flights ',
                'endpoint (paid), or scraping (fragile). Pick one and this gets built ',
                'against it.'
            ])
        ])
    ]));

    root.appendChild(el('div', { class: 'card', style: { marginTop: '12px' } }, [
        el('div', { class: 'label-row' }, [
            el('span', { class: 'label', style: { color: INK } }, ['Hotels'])
        ]),
        el('p', { style: { color: INK_MUTE, fontSize: '14px', marginTop: '8px' } }, ['After flights.'])
    ]));
}
