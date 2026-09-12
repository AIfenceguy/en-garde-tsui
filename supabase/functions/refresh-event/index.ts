// Retired 2026-09-12. This function used to read fencingtracker.com at
// runtime; everything it served now comes from our own copy (see the season
// and insight modules and the ft-copy upkeep). Deployed as this stub.
Deno.serve(() => new Response(JSON.stringify({ error: 'retired: served from our copy' }), { status: 410, headers: { 'Content-Type': 'application/json' } }));
