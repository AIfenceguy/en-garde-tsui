// askfred - our reads of askFRED's API and MCP server (public beta; the
// account token lives in the ASKFRED_TOKEN secret and never leaves here).
//
// Two jobs, both on a schedule, never while a page renders:
//   calendar  - the club and local youth foil tournaments within 60 miles of
//               each household, from the MCP search (the REST listing ignores
//               its filters; the MCP tool honours date_from). Written to
//               local_events for the Season screen. Event lists are cached
//               three days, so a normal day is a handful of requests.
//   household - the account's own fencers, registrations, bouts and
//               tournaments (REST /me/...), kept as askFRED sends them in
//               askfred_records. Empty until fencers are linked in askFRED.
// Plus probe/mcp, service-key only, for looking at response shapes.
//
// Limits (their page, 2026-09-12): per token 25 requests per 5 s tapering to
// ~125/hour; per IP address a hard block above 60/min or 300/hour. We pause
// 1.2 s between calls, stay under 40 calls a run, and stop cold on 429 or 403.
// Only the cron job (x-cron-secret from app_secrets) or the service key may
// call this function.
import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://www.askfred.net/api/v1";
const MCP = "https://www.askfred.net/mcp";
const GEO_UA = "EnGardeInsight/1.0 (+https://aifenceguy.github.io/en-garde-tsui)";
const RADIUS_MI = 60;
const EVENTS_CACHE_DAYS = 3;
const MAX_CALLS = 40;
const PAUSE_MS = 1200;
const YOUTH = new Set(["y8", "y10", "y12", "y14", "cadet", "junior"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Stop extends Error { constructor(public status: number, msg: string) { super(msg); } }

// deno-lint-ignore no-explicit-any
type Any = any;

function makeClient(token: string) {
  let calls = 0;
  let last = 0;
  async function pace() {
    const wait = last + PAUSE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    if (++calls > MAX_CALLS) throw new Stop(0, "call budget for this run used");
  }
  async function rest(path: string, etag?: string | null) {
    await pace();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (etag) headers["If-None-Match"] = etag;
    const r = await fetch(BASE + path, { headers });
    if (r.status === 429 || r.status === 403) throw new Stop(r.status, `askFRED answered ${r.status} on ${path}`);
    if (r.status === 304) return { status: 304, etag, data: null };
    const text = await r.text();
    let data: Any = text;
    try { data = JSON.parse(text); } catch (_) { /* not json */ }
    return { status: r.status, etag: r.headers.get("etag"), data };
  }
  async function mcp(name: string, args: Record<string, unknown>) {
    await pace();
    const r = await fetch(MCP, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    if (r.status === 429 || r.status === 403) throw new Stop(r.status, `askFRED MCP answered ${r.status} on ${name}`);
    let text = await r.text();
    if (/^event:|^data:/m.test(text)) text = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
    const env = JSON.parse(text);
    if (env.error) throw new Error(`MCP ${name}: ${env.error.message || JSON.stringify(env.error)}`);
    const content = env.result?.content?.[0]?.text;
    return content ? JSON.parse(content) : env.result;
  }
  return { rest, mcp, count: () => calls };
}

// ---- geography: a venue city is looked up once for everyone (places) ---------
function haversineMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, toR = (d: number) => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// "…, Santa Ana, CA 92704 USA" or "…, Pomona, California 91768 US": the city
// and the state as written, which the geocoder understands either way.
function cityOf(address: string | null | undefined): string | null {
  const m = String(address || "").match(/,\s*([^,]+?),\s*([A-Za-z .]+?)\s+\d{5}/);
  return m ? `${m[1].trim()}, ${m[2].trim()}` : null;
}
async function cityPoint(db: Any, city: string): Promise<{ lat: number; lng: number } | null> {
  const key = city.toLowerCase().replace(/\s+/g, " ").trim();
  const { data: hit } = await db.from("places").select("lat,lng").eq("key", key).maybeSingle();
  if (hit && hit.lat != null) return { lat: hit.lat, lng: hit.lng };
  await sleep(1100);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(city)}`, { headers: { "User-Agent": GEO_UA, Accept: "application/json" } });
  if (!r.ok) return null;
  const res = await r.json();
  const first = Array.isArray(res) && res[0];
  const row = { key, display_name: first ? String(first.display_name) : null, lat: first ? Number(first.lat) : null, lng: first ? Number(first.lon) : null, fetched_at: new Date().toISOString() };
  await db.from("places").upsert(row);
  return row.lat != null ? { lat: row.lat!, lng: row.lng! } : null;
}

// ---- calendar ------------------------------------------------------------------
async function calendar(db: Any, api: ReturnType<typeof makeClient>) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: homes } = await db.from("household").select("owner_user_id,home_zip,home_lat,home_lng,home_address");
  const out: Record<string, unknown> = {};
  const stale = new Date(Date.now() - EVENTS_CACHE_DAYS * 864e5).toISOString();
  for (const h of homes || []) {
    const zip = h.home_zip || (String(h.home_address || "").match(/\b\d{5}\b/) || [])[0];
    if (!zip || h.home_lat == null || h.home_lng == null) { out[zip || "?"] = "no home point"; continue; }
    const home = { lat: Number(h.home_lat), lng: Number(h.home_lng) };
    // Every foil tournament within the radius, not yet finished, holding a
    // youth, cadet or junior event. The search takes one age group at a
    // time (its combined values answer nothing), so three searches, one list.
    const seen = new Set<string>();
    const tournaments: Any[] = [];
    for (const age of ["youth", "cadet", "junior"]) {
      for (let page = 1; page <= 4; page++) {
        const res = await api.mcp("search_tournaments", { latitude: home.lat, longitude: home.lng, radius_miles: RADIUS_MI, weapon: "foil", age, date_from: today, status: "upcoming", page, per_page: 50 });
        for (const t of res.data || []) if (!seen.has(t.id)) { seen.add(t.id); tournaments.push(t); }
        if (!res.metadata || page >= Number(res.metadata.last_page || 1)) break;
      }
    }
    const rows: Any[] = [];
    let cached = 0, read = 0;
    for (const t of tournaments) {
      const a = t.attributes || {};
      if (a.is_cancelled || (a.tournament_type && a.tournament_type !== "tournament")) continue;
      const cacheUrl = `mcp:list_tournament_events:${t.id}`;
      const { data: c } = await db.from("askfred_cache").select("body,fetched_at").eq("url", cacheUrl).maybeSingle();
      let events: Any[];
      if (c?.body && c.fetched_at >= stale) { events = c.body; cached++; }
      else {
        events = [];
        for (let page = 1; page <= 3; page++) {
          const res = await api.mcp("list_tournament_events", { tournament_id: t.id, weapon: "foil", page, per_page: 50 });
          events.push(...(res.data || []));
          if (!res.metadata || page >= Number(res.metadata.last_page || 1)) break;
        }
        read++;
        await db.from("askfred_cache").upsert({ url: cacheUrl, etag: null, body: events, status: 200, fetched_at: new Date().toISOString() });
      }
      const kept = events.map((e) => e.attributes || {})
        .filter((e) => String(e.weapon || "").toLowerCase() === "foil" && String(e.gender || "").toLowerCase() !== "women" && YOUTH.has(String(e.age_limit || "").toLowerCase()))
        .map((e) => ({ event: e.full_name || e.short_name, age: e.age_limit, gender: String(e.gender || "").toLowerCase(), rating_limit: e.rating_limit, close: String(e.close_of_registration || "").slice(0, 10) || null }));
      if (!kept.length) continue;
      const city = cityOf(a.venue_address);
      const pt = city ? await cityPoint(db, city) : null;
      const location = [a.venue_name, String(a.venue_address || "").replace(/,?\s*(USA?|US)\s*$/i, "").replace(/\s+\d{5}(-\d{4})?\s*$/, "")].filter(Boolean).join(" · ");
      rows.push({
        zip, tournament: a.name, first_date: a.start_date, location,
        distance_mi: pt ? Math.round(haversineMi(home, pt)) : null,
        events: kept, fetched_at: new Date().toISOString(),
      });
    }
    await db.from("local_events").delete().eq("zip", zip);
    if (rows.length) await db.from("local_events").insert(rows);
    out[zip] = { tournaments: tournaments.length, listed: rows.length, event_lists_read: read, from_cache: cached };
  }
  return out;
}

// ---- household -----------------------------------------------------------------
async function household(db: Any, api: ReturnType<typeof makeClient>) {
  const { data: parent } = await db.from("profiles").select("owner_user_id").eq("kind", "parent").limit(1).maybeSingle();
  const owner = parent?.owner_user_id || null;
  const now = new Date().toISOString();
  const fencers = await api.rest("/me/fencers");
  const list: Any[] = fencers.data?.data || [];
  const out: Record<string, unknown> = { fencers: list.length };
  for (const f of list) {
    await db.from("askfred_records").upsert({ kind: "fencer", id: f.id, owner_user_id: owner, attributes: f.attributes || {}, relationships: f.relationships || null, fetched_at: now });
    for (const kind of ["events", "bouts", "tournaments"]) {
      let n = 0;
      for (let page = 1; page <= 10; page++) {
        const res = await api.rest(`/me/fencer/${f.id}/${kind}?page=${page}&per_page=50`);
        const items: Any[] = res.data?.data || [];
        for (const it of items) {
          await db.from("askfred_records").upsert({ kind: kind.replace(/s$/, ""), id: it.id, owner_user_id: owner, attributes: { ...(it.attributes || {}), fencer_id: f.id }, relationships: it.relationships || null, fetched_at: now });
          n++;
        }
        const meta = res.data?.metadata;
        if (!meta || page >= Number(meta.last_page || 1)) break;
      }
      out[`${f.id}:${kind}`] = n;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const auth = req.headers.get("Authorization") || "";
  const isService = auth === `Bearer ${serviceKey}`;
  if (!isService) {
    const given = req.headers.get("x-cron-secret") || "";
    const { data: s } = await db.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
    if (!given || !s?.value || given !== s.value) return json({ error: "not allowed" }, 403);
  }
  const token = Deno.env.get("ASKFRED_TOKEN");
  if (!token) return json({ error: "ASKFRED_TOKEN not set" }, 500);
  let body: { action?: string; path?: string; method?: string; params?: unknown; name?: string; arguments?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch (_) { /* empty */ }
  const action = body.action || "calendar";
  const api = makeClient(token);

  if (action === "probe" || action === "mcp") {
    if (!isService) return json({ error: "service key only" }, 403);
    try {
      if (action === "probe" && body.path) return json(await api.rest(body.path.startsWith("/") ? body.path : "/" + body.path));
      if (action === "mcp" && body.name) return json(await api.mcp(body.name, body.arguments || {}));
      return json({ error: "path or name required" }, 400);
    } catch (e) { return json({ error: String((e as Error).message || e) }, 502); }
  }

  const { data: run } = await db.from("askfred_runs").insert({ action }).select("id").single();
  let result: unknown = null, error: string | null = null;
  try {
    if (action === "calendar") result = await calendar(db, api);
    else if (action === "household") result = await household(db, api);
    else return json({ error: "unknown action" }, 400);
  } catch (e) {
    error = e instanceof Stop ? `stopped: ${e.message}` : String((e as Error).message || e);
  }
  await db.from("askfred_runs").update({ finished_at: new Date().toISOString(), requests: api.count(), notes: { result, error } }).eq("id", run?.id);
  return json({ action, requests: api.count(), result, error }, error ? 502 : 200);
});
