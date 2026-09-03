// Reusable chip widgets — selectable tags & tactic-tally pills.

import { el, slugify } from './util.js';

/**
 * Multi-select chip group.
 * options: [{ slug, label, kind? }]
 * selected: Set<string> of slugs
 * Returns the container element. selected is mutated in place.
 */
export function chipGroup({ options, selected, allowAdd = false, onChange = null, onAdd = null }) {
    if (!(selected instanceof Set)) selected = new Set(selected || []);

    const container = el('div', { class: 'chips' });

    function rerender() {
        container.innerHTML = '';
        for (const o of options) {
            const isOn = selected.has(o.slug);
            const chip = el('button', {
                type: 'button',
                class: 'chip' + (isOn ? ' on is-on' : '') + (o.kind === 'failure' ? ' failure' : ''),
                'data-slug': o.slug,
                'data-kind': o.kind || '',
                'aria-pressed': String(isOn),
                onclick: () => {
                    if (selected.has(o.slug)) selected.delete(o.slug);
                    else selected.add(o.slug);
                    rerender();
                    onChange?.(Array.from(selected));
                }
            }, [o.label]);
            container.appendChild(chip);
        }
        if (allowAdd) {
            container.appendChild(
                el('button', {
                    type: 'button',
                    class: 'chip chip-add',
                    onclick: async () => {
                        const label = prompt('New tag — short label?');
                        if (!label) return;
                        const slug = slugify(label);
                        if (!slug) return;
                        if (options.some((o) => o.slug === slug)) {
                            selected.add(slug);
                            rerender();
                            onChange?.(Array.from(selected));
                            return;
                        }
                        const created = await onAdd?.({ slug, label });
                        if (created) {
                            options.push(created);
                            options.sort((a, b) => a.label.localeCompare(b.label));
                            selected.add(slug);
                            rerender();
                            onChange?.(Array.from(selected));
                        }
                    }
                }, ['+ add'])
            );
        }
    }

    rerender();
    container._selected = selected;
    container.getValues = () => Array.from(selected);
    return container;
}

/**
 * Tactic tally row — for bout entry, where each tactic has attempts + successes.
 * value: { tactic_slug, attempts, successes }
 * options: [{ slug, label }]
 * Returns container. Use `.getValues()` to read state.
 */
export function tacticTally({ options, values = [], onChange = null, getScore = null }) {
    const map = new Map();
    for (const v of values) map.set(v.tactic_slug, { attempts: v.attempts || 0, successes: v.successes || 0 });

    const container = el('div', { class: 'tactic-tally-list' });
    // Progress against the actual score. Without it there is no way to know
    // when the tally is finished, or that it has drifted away from the score.
    const summary = el('div', {
        style: {
            fontFamily: 'var(--mono)', fontSize: '12px', letterSpacing: '0.06em',
            padding: '8px 0 10px', color: '#6B7280'
        }
    });

    function landed() {
        let n = 0;
        for (const v of map.values()) n += v.successes;
        return n;
    }

    function paintSummary() {
        const done = landed();
        const score = getScore ? Number(getScore()) : null;
        if (!score) {
            summary.textContent = done ? `${done} touch${done === 1 ? '' : 'es'} logged` : '';
            summary.style.color = '#6B7280';
            return;
        }
        if (done === score) {
            summary.textContent = `All ${score} of your touches accounted for`;
            summary.style.color = '#1f7a1f';
        } else if (done > score) {
            summary.textContent = `${done} logged but you scored ${score} - one of these is wrong`;
            summary.style.color = '#9b2230';
        } else {
            summary.textContent = `${done} of your ${score} touches logged - ${score - done} to go`;
            summary.style.color = '#B45309';
        }
    }

    function rerender() {
        container.innerHTML = '';
        container.appendChild(summary);
        for (const o of options) {
            const cur = map.get(o.slug) || { attempts: 0, successes: 0 };
            const missed = Math.max(0, cur.attempts - cur.successes);
            const row = el('div', { class: 'tactic-tally' }, [
                el('div', { class: 'name' }, [o.label]),
                // Words, not symbols. A green tick and a red cross do not say
                // which is "touches this won me" and which is "times I tried it
                // and missed" - and the two rows look interchangeable without a
                // label on each.
                el('div', { class: 'pill ' + (cur.successes > 0 ? 'success' : ''), style: { color: cur.successes > 0 ? '' : '#1A1D24' } }, [
                    el('button', { type: 'button', class: 'delta', 'aria-label': `${o.label} scored, one fewer`, onclick: () => bump(o.slug, 'successes', -1) }, ['−']),
                    el('span', {}, [`${cur.successes} scored`]),
                    el('button', { type: 'button', class: 'delta', 'aria-label': `${o.label} scored, one more`, onclick: () => bump(o.slug, 'successes', +1) }, ['+'])
                ]),
                el('div', { class: 'pill ' + (missed > 0 ? 'fail' : ''), style: { color: missed > 0 ? '' : '#1A1D24' } }, [
                    el('button', { type: 'button', class: 'delta', 'aria-label': `${o.label} missed, one fewer`, onclick: () => bump(o.slug, 'attempts', -1) }, ['−']),
                    el('span', {}, [`${missed} missed`]),
                    el('button', { type: 'button', class: 'delta', 'aria-label': `${o.label} missed, one more`, onclick: () => bump(o.slug, 'attempts', +1) }, ['+'])
                ])
            ]);
            container.appendChild(row);
        }
        paintSummary();
    }

    // The score lives outside this widget, so it has to be told when it moves.
    container.refreshSummary = paintSummary;

    function bump(slug, key, delta) {
        const cur = map.get(slug) || { attempts: 0, successes: 0 };
        cur[key] = Math.max(0, cur[key] + delta);
        // attempts must be >= successes
        if (key === 'successes' && cur.successes > cur.attempts) cur.attempts = cur.successes;
        if (key === 'attempts' && cur.attempts < cur.successes) cur.attempts = cur.successes;
        if (cur.attempts === 0 && cur.successes === 0) map.delete(slug);
        else map.set(slug, cur);
        rerender();
        onChange?.(container.getValues());
    }

    container.getValues = () => Array.from(map.entries()).map(([slug, v]) => ({ tactic_slug: slug, attempts: v.attempts, successes: v.successes }));
    rerender();
    return container;
}

/**
 * Slider with numeric readout.
 */
export function scaleSlider({ value = 5, min = 1, max = 10, onChange = null }) {
    const out = el('span', { class: 'scale-value' }, [String(value)]);
    const input = el('input', {
        type: 'range', min, max, step: 1, value,
        oninput: (e) => {
            out.textContent = e.target.value;
            onChange?.(Number(e.target.value));
        }
    });
    const wrap = el('div', { class: 'scale' }, [input, out]);
    wrap.getValue = () => Number(input.value);
    wrap.setValue = (v) => { input.value = String(v); out.textContent = String(v); };
    return wrap;
}

/**
 * Editable text-array (chips you type into) — used for SWOT and free-form opponent traits.
 */
export function chipArrayEditor({ values = [], onChange = null, placeholder = 'add and press Enter' }) {
    const container = el('div', { class: 'chips' });
    let arr = [...values];

    function rerender() {
        container.innerHTML = '';
        for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            container.appendChild(
                el('span', { class: 'chip on', onclick: () => { arr.splice(i, 1); rerender(); onChange?.(arr); } }, [v, ' ', el('span', { class: 'x' }, ['×'])])
            );
        }
        const commit = () => {
            const v = input.value.trim();
            if (v) { arr.push(v); rerender(); onChange?.(arr); }
        };
        const input = el('input', {
            type: 'text', placeholder,
            // flex-basis 100% so the input ALWAYS takes a full row — placeholders
            // like "what HE struggles with — e.g. slow recover" need the width.
            style: { background: 'transparent', border: '0', outline: 'none', flex: '1 1 100%', padding: '8px 4px', minHeight: '36px', minWidth: '200px', fontSize: '14px' },
            onkeydown: (e) => {
                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    commit();
                } else if (e.key === 'Backspace' && !input.value && arr.length) {
                    arr.pop(); rerender(); onChange?.(arr);
                }
            },
            onblur: () => { commit(); }
        });
        container.appendChild(input);
        // refocus when user added an item
        if (arr.length && document.activeElement !== input) {
            // intentionally do not steal focus on initial render
        }
    }
    rerender();
    container.getValues = () => [...arr];
    container.setValues = (v) => { arr = [...(v || [])]; rerender(); };
    return container;
}

// How the OPPONENT scored. Deliberately a single counter per action, not the
// scored/missed pair used for the fencer's own touches: you know what beat you,
// but you cannot reliably count the attacks your opponent tried and missed.
// Same shape and same running total as the other tally, so the two halves of a
// bout read as two halves of one thing.
export function concededTally({ options, values = [], onChange = null, getScore = null }) {
    const map = new Map();
    for (const v of values) map.set(v.tactic_slug, Number(v.touches) || 0);

    const container = el('div', { class: 'tactic-tally-list' });
    const summary = el('div', {
        style: {
            fontFamily: 'var(--mono)', fontSize: '12px', letterSpacing: '0.06em',
            padding: '8px 0 10px', color: '#6B7280'
        }
    });

    function total() {
        let n = 0;
        for (const v of map.values()) n += v;
        return n;
    }

    function paintSummary() {
        const done = total();
        const score = getScore ? Number(getScore()) : null;
        if (!score) {
            summary.textContent = done ? `${done} touch${done === 1 ? '' : 'es'} logged` : '';
            summary.style.color = '#6B7280';
            return;
        }
        if (done === score) {
            summary.textContent = `All ${score} of their touches accounted for`;
            summary.style.color = '#1f7a1f';
        } else if (done > score) {
            summary.textContent = `${done} logged but they scored ${score} - one of these is wrong`;
            summary.style.color = '#9b2230';
        } else {
            summary.textContent = `${done} of their ${score} touches logged - ${score - done} to go`;
            summary.style.color = '#B45309';
        }
    }

    function bump(slug, delta) {
        const cur = map.get(slug) || 0;
        const next = Math.max(0, cur + delta);
        if (next === 0) map.delete(slug); else map.set(slug, next);
        rerender();
        onChange?.(container.getValues());
    }

    function rerender() {
        container.innerHTML = '';
        container.appendChild(summary);
        for (const o of options) {
            const n = map.get(o.slug) || 0;
            container.appendChild(el('div', { class: 'tactic-tally' }, [
                el('div', { class: 'name' }, [o.label]),
                el('div', {
                    class: 'pill ' + (n > 0 ? 'fail' : ''),
                    style: { color: n > 0 ? '' : '#1A1D24' }
                }, [
                    el('button', { type: 'button', class: 'delta', 'aria-label': `${o.label}, one fewer`, onclick: () => bump(o.slug, -1) }, ['\u2212']),
                    el('span', {}, [`${n} touch${n === 1 ? '' : 'es'}`]),
                    el('button', { type: 'button', class: 'delta', 'aria-label': `${o.label}, one more`, onclick: () => bump(o.slug, +1) }, ['+'])
                ])
            ]));
        }
        paintSummary();
    }

    container.refreshSummary = paintSummary;
    container.getValues = () => Array.from(map.entries()).map(([slug, touches]) => ({ tactic_slug: slug, touches }));
    // Flat slug list, so failure_patterns keeps working for anything reading it.
    container.getSlugs = () => Array.from(map.keys());
    rerender();
    return container;
}
