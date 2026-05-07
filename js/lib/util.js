// Small utilities: DOM helpers, dates, debounce, toast.

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// Hyperscript-ish DOM creation. el('div', { class: 'x' }, [child, child])
export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') node.innerHTML = v;
        else if (k in node && typeof node[k] !== 'function') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
    }
    appendChildren(node, children);
    return node;
}

export function appendChildren(node, children) {
    if (!children) return;
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
        if (c == null || c === false) continue;
        if (Array.isArray(c)) appendChildren(node, c);
        else if (c instanceof Node) node.appendChild(c);
        else node.appendChild(document.createTextNode(String(c)));
    }
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

export function todayISO() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

export function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDateLong(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysUntil(iso) {
    const target = new Date(iso + 'T00:00:00');
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - start) / 86400000);
}

export function debounce(fn, ms = 250) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
    };
}

export function toast(message, kind = '') {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const node = el('div', { class: `toast ${kind}` }, [message]);
    region.appendChild(node);
    setTimeout(() => {
        node.style.transition = 'opacity 200ms ease';
        node.style.opacity = '0';
        setTimeout(() => node.remove(), 220);
    }, 2400);
}

export function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export function slugify(s) {
    return String(s)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

export function groupBy(arr, key) {
    const map = new Map();
    for (const item of arr) {
        const k = typeof key === 'function' ? key(item) : item[key];
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
}

export function pluralize(n, singular, plural) {
    return `${n} ${n === 1 ? singular : (plural || singular + 's')}`;
}

export function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
