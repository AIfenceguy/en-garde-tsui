// Coach picker.
//
// Hardcoded for now because it is one club. When this becomes multi-club these
// move into a `coaches` table keyed by club, and this module reads from there -
// the calling code should not need to change.

import { el } from './util.js';

export const COACHES = ['Kostas', 'Kevin', 'KLod', 'Bohdan', 'Edward'];

const OTHER = '__other__';

const selectStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0,0,0,0.15)',
    background: '#fff',
    color: 'var(--ink, #1A1D24)',
    fontSize: '15px',
    fontFamily: 'inherit'
};

/**
 * Dropdown of the club's coaches, with a free-text fallback so a guest or
 * visiting coach can still be logged rather than silently mis-attributed.
 *
 * Returns an element with getValue(). A previously saved name that is not on
 * the list is preserved as its own option, so editing an old lesson never
 * quietly rewrites who taught it.
 */
export function coachPicker({ name = 'coach', value = '' } = {}) {
    const current = (value || '').trim();
    // Case-insensitive: "kostas" and "Kostas" are the same person.
    const known = COACHES.find((c) => c.toLowerCase() === current.toLowerCase());
    const isUnknownExisting = current && !known;

    const options = [
        el('option', { value: '', style: { color: 'var(--ink, #1A1D24)' } }, ['—']),
        ...COACHES.map((c) => el('option', {
            value: c,
            selected: known === c,
            style: { color: 'var(--ink, #1A1D24)' }
        }, [c])),
        // Keep an off-list name that was saved earlier.
        ...(isUnknownExisting
            ? [el('option', { value: current, selected: true, style: { color: 'var(--ink, #1A1D24)' } }, [current])]
            : []),
        el('option', { value: OTHER, style: { color: 'var(--ink, #1A1D24)' } }, ['Other…'])
    ];

    const other = el('input', {
        type: 'text',
        placeholder: 'coach name',
        style: { color: 'var(--ink, #1A1D24)', marginTop: '8px', display: 'none' }
    });

    const select = el('select', {
        style: selectStyle,
        onchange: () => {
            const showOther = select.value === OTHER;
            other.style.display = showOther ? '' : 'none';
            if (showOther) other.focus();
        }
    }, options);

    const wrap = el('div', {}, [select, other]);
    wrap.getValue = () => {
        if (select.value === OTHER) return other.value.trim() || null;
        return select.value.trim() || null;
    };
    // So callers can keep using FormData-style names if they want to.
    wrap.fieldName = name;
    return wrap;
}
