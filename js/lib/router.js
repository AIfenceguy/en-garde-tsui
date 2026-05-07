// Hash-based router. Modules register their renderer; the router calls it
// with the app root and any URL parameters parsed from the hash.

const routes = new Map();
let _root = null;

export function defineRoot(rootEl) { _root = rootEl; }

export function defineRoute(name, mountFn) {
    routes.set(name, mountFn);
}

export function go(name, params = {}) {
    const search = new URLSearchParams(params).toString();
    location.hash = '#' + name + (search ? '?' + search : '');
}

export function currentRoute() {
    const raw = (location.hash || '#dashboard').slice(1);
    const [name, query] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(query || ''));
    return { name: name || 'dashboard', params };
}

export async function render() {
    if (!_root) return;
    const { name, params } = currentRoute();
    const fn = routes.get(name) || routes.get('dashboard');
    document.querySelectorAll('.bottom-nav a').forEach((a) => {
        a.classList.toggle('active', a.dataset.route === name || a.dataset.route === name.split('/')[0]);
    });
    _root.innerHTML = '';
    try {
        await fn(_root, params);
    } catch (err) {
        console.error('[router] render error', err);
        _root.innerHTML = `<div class="card">
            <h3 style="color:var(--danger)">Something went wrong rendering this view.</h3>
            <pre class="mono dim" style="white-space:pre-wrap">${(err && err.message) || err}</pre>
        </div>`;
    }
}

export function startRouter() {
    window.addEventListener('hashchange', render);
    render();
}
