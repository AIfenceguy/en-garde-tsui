// Retired 2026-09-12. The local calendar now comes from askFRED's API through
// the askfred function (action calendar), under the account token. This read
// of the public CSV export is no longer made.
Deno.serve(() => new Response(JSON.stringify({ error: 'retired: see the askfred function' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
