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
export function tacticTally({ options, values = [], onChange = null }) {
    const map = new Map();
    for (const v of values) map.set(v.tactic_slug, { attempts: v.attempts || 0, successes: v.successes || 0 });

    const container = el('div', { class: 'tactic-tally-list' });

    function rerender() {
        container.innerHTML = '';
        for (const o of options) {
            const cur = map.get(o.slug) || { attempts: 0, successes: 0 };
            const row = el('div', { class: 'tactic-tally' }, [
                el('div', { class: 'name' }, [o.label]),
                el('div', { class: 'pill ' + (cur.successes > 0 ? 'success' : '') }, [
                    el('button', { type: 'button', class: 'delta', onclick: () => bump(o.slug, 'successes', -1) }, ['−']),
                    el('span', {}, [`${cur.successes} ✓`]),
                    el('button', { type: 'button', class: 'delta', onclick: () => bump(o.slug, 'successes', +1) }, ['+'])
                ]),
                el('div', { class: 'pill ' + (cur.attempts - cur.successes > 0 ? 'fail' : '') }, [
                    el('button', { type: 'button', class: 'delta', onclick: () => bump(o.slug, 'attempts', -1) }, ['−']),
                    el('span', {}, [`${Math.max(0, cur.attempts - cur.successes)} ✗`]),
                    el('button', { type: 'button', class: 'delta', onclick: () => bump(o.slug, 'attempts', +1) }, ['+'])
                ])
            ]);
            container.appendChild(row);
        }
    }

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
        const input = el('input', {
            type: 'text', placeholder,
            style: { background: 'transparent', border: '0', outline: 'none', flex: '1 0 140px', padding: '6px 4px', minHeight: '36px' },
            onkeydown: (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = input.value.trim();
                    if (v) { arr.push(v); rerender(); onChange?.(arr); }
                } else if (e.key === 'Backspace' && !input.value && arr.length) {
                    arr.pop(); rerender(); onChange?.(arr);
                }
            }
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
