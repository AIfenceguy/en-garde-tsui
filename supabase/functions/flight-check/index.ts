// flight-check — price every active travel watch on Google Flights (through
// SerpAPI), keep every itinerary seen, record the best one per leg, and raise
// an alert when a fare hits the target, sets a new low, or drops far enough
// below what was already paid to be worth rebooking. A port of
// supabase-backups/flight-check.ps1 that no longer needs a PC awake at 7am.
//
// Each leg is priced as a one-way search: out (origin -> destination over the
// departure window) and, when the watch says so, ret (destination -> origin
// over the return window). A family's preferences decide which itineraries
// "fit": how many stops, and the local hours the flight may take off. The
// cheapest fitting itinerary is the day's fare; everything seen is kept in
// flight_offers so the screen can show the real choices.
//
// Secrets (Supabase project settings -> Edge Functions -> Secrets):
//   SERPAPI_KEY      required to price anything; without it the run is skipped.
//   RESEND_API_KEY   optional; alerts go out through Resend (ALERT_FROM sets the sender).
//   SMTP_USER/PASS   optional; Gmail app password, alerts go out through SMTP.
// Alerts are always written to flight_alerts, sent or not.
//
// Body: { watch_id?: uuid, full_sweep?: boolean, dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";

const SERP = "https://serpapi.com/search";
const DELAY_MS = 400;
const MAX_SEARCHES_PER_RUN = 48;
const OFFERS_KEPT = 8;
const MAX_LAYOVER_MIN = 6 * 60;
const TZ = "America/Los_Angeles";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ptDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const ptWeekday = (d = new Date()) => d.toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86400000);
const money = (n: number) => `$${Math.round(n)}`;
const hhmm = (v: unknown) => { const s = String(v || ""); const m = /(\d{1,2}):(\d{2})/.exec(s.length > 10 ? s.slice(11) : s); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };

function expandDates(start: string | null, end: string | null, fallback: string | null): string[] {
  const s = start || fallback, e = end || fallback;
  if (!s) return [];
  const out: string[] = [];
  for (let d = s; d <= (e || s); d = addDays(d, 1)) { out.push(d); if (out.length > 7) break; }
  return out;
}

// deno-lint-ignore no-explicit-any
type Offer = any;
type Seen = {
  price: number; airline: string; flightNums: string; departAt: string | null; arriveAt: string | null; stops: number;
  duration: number | null; layovers: Offer[] | null; maxLayover: number | null; fits: boolean; raw: Offer;
};

function describe(best: Offer): Omit<Seen, "fits"> {
  const segs: Offer[] = best.flights || [];
  const layovers = Array.isArray(best.layovers) && best.layovers.length ? best.layovers : null;
  return {
    price: Number(best.price), airline: segs[0]?.airline || "", flightNums: segs.map((s: Offer) => s.flight_number).filter(Boolean).join(","),
    departAt: segs[0]?.departure_airport?.time || null, arriveAt: segs[segs.length - 1]?.arrival_airport?.time || null, stops: Math.max(0, segs.length - 1),
    duration: best.total_duration ?? null, layovers, maxLayover: layovers ? Math.max(...layovers.map((l: Offer) => Number(l.duration) || 0)) : null, raw: best,
  };
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-cron-secret" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const auth = req.headers.get("Authorization") || "";
  let allowed = auth === `Bearer ${serviceKey}`;
  if (!allowed) {
    const given = req.headers.get("x-cron-secret") || "";
    if (given) {
      const { data: s } = await db.from("app_secrets").select("value").eq("name", "cron_secret").maybeSingle();
      allowed = Boolean(s?.value) && given === s.value;
    }
  }
  if (!allowed) {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: who } = await anon.auth.getUser();
    if (!who?.user) return json({ error: "sign in first" }, 401);
    const { data: parent } = await anon.rpc("is_parent");
    if (!parent) return json({ error: "parents only" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const fullSweep = body.full_sweep === true;
  const dryRun = body.dry_run === true;
  const serpKey = Deno.env.get("SERPAPI_KEY") || "";
  if (!serpKey) return json({ skipped: true, reason: "SERPAPI_KEY is not set in the function secrets" });

  let q = db.from("flight_watches").select("*").is("deleted_at", null).eq("is_active", true);
  if (body.watch_id) q = q.eq("id", body.watch_id);
  const { data: watches, error: werr } = await q;
  if (werr) return json({ error: werr.message }, 500);
  if (!watches?.length) return json({ watches: 0, note: "no active watches" });

  const today = ptDate();
  const sundaySweep = fullSweep || ptWeekday() === "Sunday";
  let searches = 0;
  const report: Record<string, unknown>[] = [];

  for (const w of watches) {
    const origins: string[] = (Array.isArray(w.origins) && w.origins.length ? w.origins : (w.origin ? [w.origin] : [])).map((x: string) => String(x).toUpperCase());
    if (!origins.length) { report.push({ watch: w.label, skipped: "no origins" }); continue; }
    if (w.depart_date && w.depart_date < today) {
      await db.from("flight_watches").update({ is_active: false }).eq("id", w.id);
      report.push({ watch: w.label, deactivated: `departure ${w.depart_date} has passed` });
      continue;
    }
    const dest = String(w.destination).toUpperCase();
    const pax = Math.max(1, Number(w.passengers) || 1);
    const maxStops: number | null = w.max_stops != null ? Number(w.max_stops) : (w.nonstop_only ? 0 : null);
    const prefs = {
      out: { after: hhmm(w.preferred_depart_after), before: hhmm(w.depart_before) },
      ret: { after: hhmm(w.return_after), before: hhmm(w.return_before) },
    };
    const hotelRate = Number(w.hotel_nightly_rate) || 0;
    const earlyPen = Number(w.early_depart_penalty) || 0;
    const penalties = (w.origin_penalties && typeof w.origin_penalties === "object") ? w.origin_penalties : {};
    // The competition's own constraint: on the last event's day the return
    // must leave after the fencer could be finished.
    const { data: tripRows } = await db.from("trip_overview").select("event_date,no_return_before").eq("watch_id", w.id).order("event_date");
    const lastTrip = tripRows?.length ? tripRows[tripRows.length - 1] : null;
    const noReturnBefore = lastTrip?.no_return_before ? String(lastTrip.no_return_before).slice(0, 5) : null;
    const lastEventDate = lastTrip?.event_date ? String(lastTrip.event_date).slice(0, 10) : null;

    // ---- what to search ---------------------------------------------------
    let departDates = expandDates(w.depart_window_start, w.depart_window_end, w.depart_date);
    let returnDates = expandDates(w.return_window_start, w.return_window_end, w.return_date);
    let originsOut: string[], originsRet: string[], mode: string;
    if (w.booked_at && w.booked_out_origin && !fullSweep) {
      // Booked: watch the held outbound leg for a rebook drop, and the return
      // only if it is watched (a return bought for cash, or one still open).
      originsOut = [String(w.booked_out_origin).toUpperCase()];
      if (w.booked_out_date) departDates = [w.booked_out_date];
      if (w.booked_ret_cash && w.booked_ret_date) { returnDates = [w.booked_ret_date]; originsRet = [String(w.booked_ret_origin || w.booked_out_origin).toUpperCase()]; }
      else if (w.watch_return !== false) originsRet = [String(w.booked_ret_origin || w.booked_out_origin).toUpperCase()];
      else { returnDates = []; originsRet = []; }
      mode = "booked leg";
    } else {
      originsOut = (sundaySweep || !w.preferred_origin) ? origins : [String(w.preferred_origin).toUpperCase()];
      originsRet = w.watch_return === false ? [] : originsOut;
      if (w.watch_return === false) returnDates = [];
      mode = sundaySweep ? "full sweep" : "daily check";
    }
    const baselineOut = [...departDates].sort().pop() || null;   // latest departure: earlier days buy hotel nights
    const baselineRet = [...returnDates].sort()[0] || null;      // earliest return: later days buy hotel nights

    type Found = { leg: string; origin: string; date: string; price: number; effective: number; airline: string; stops: number; url: string; departAt: string; extraNights: number; fits: boolean };
    const found: Found[] = [];
    const errors: string[] = [];
    let offersKept = 0;

    const legs: { leg: "out" | "ret"; origins: string[]; dates: string[] }[] = [
      { leg: "out", origins: originsOut, dates: departDates },
      { leg: "ret", origins: originsRet, dates: returnDates },
    ];
    for (const L of legs) for (const origin of L.origins) for (const date of L.dates) {
      if (searches >= MAX_SEARCHES_PER_RUN) { errors.push("search budget for this run used up"); break; }
      const from = L.leg === "out" ? origin : dest, to = L.leg === "out" ? dest : origin;
      const params = new URLSearchParams({ engine: "google_flights", departure_id: from, arrival_id: to, outbound_date: date, type: "2", currency: "USD", hl: "en", adults: String(pax), sort_by: "2", api_key: serpKey });
      searches += 1;
      let res: Offer;
      try {
        const r = await fetch(`${SERP}?${params}`);
        res = await r.json();
        if (!r.ok || res?.error) { errors.push(`${L.leg} ${from}-${to} ${date}: ${res?.error || r.status}`); await sleep(DELAY_MS); continue; }
      } catch (err) { errors.push(`${L.leg} ${from}-${to} ${date}: ${(err as Error).message}`); await sleep(DELAY_MS); continue; }

      const offers: Offer[] = [...(res.best_flights || []), ...(res.other_flights || [])].filter((o: Offer) => Number(o?.price) > 0);
      if (!offers.length) { errors.push(`${L.leg} ${from}-${to} ${date}: no offers`); await sleep(DELAY_MS); continue; }
      const pref = prefs[L.leg];
      const seen: Seen[] = offers.map((o: Offer) => {
        const d = describe(o);
        const t = hhmm(d.departAt);
        const timeOk = !t || ((!pref.after || t >= pref.after) && (!pref.before || t <= pref.before));
        const stopsOk = maxStops == null || d.stops <= maxStops;
        // Half a day in a hub is not a fare anyone wants, whatever it costs.
        const layoverOk = (d.maxLayover ?? 0) <= MAX_LAYOVER_MIN;
        // A return on the last event's day has to leave after the event could be over.
        const eventOk = !(L.leg === "ret" && noReturnBefore && lastEventDate === date && t && t < noReturnBefore);
        return { ...d, fits: timeOk && stopsOk && layoverOk && eventOk };
      }).sort((a, b) => (Number(b.fits) - Number(a.fits)) || (a.price - b.price));
      // Google prices the whole party at this adults count: a party total.
      const best = seen[0];
      const url = "https://www.google.com/travel/flights?q=" + encodeURIComponent(`flights from ${from} to ${to} on ${date} one way`);

      // True cost, not sticker price: an earlier departure (or a later return)
      // buys hotel nights; a school-hours departure and a longer drive both
      // cost something real.
      const extraNights = L.leg === "out" ? (baselineOut ? Math.max(0, daysBetween(baselineOut, date)) : 0) : (baselineRet ? Math.max(0, daysBetween(date, baselineRet)) : 0);
      const hotelCost = extraNights * hotelRate;
      const timePenalty = best.fits ? 0 : earlyPen;
      const originPenalty = Number(penalties[origin]) || 0;
      const effective = best.price + hotelCost + timePenalty + originPenalty;

      const row = {
        watch_id: w.id, leg: L.leg, origin, price: best.price, currency: "USD", airline: best.airline, flight_numbers: best.flightNums, depart_at: best.departAt, arrive_at: best.arriveAt,
        duration_minutes: best.duration, layovers: best.layovers, max_layover_minutes: best.maxLayover, stops: best.stops, booking_url: url, source: "serpapi-google-flights",
        searched_depart_date: date, searched_return_date: null, effective_cost: effective, price_per_person: Math.round(best.price / pax * 100) / 100, effective_per_person: Math.round(effective / pax * 100) / 100,
        effective_breakdown: { fare: best.price, extra_nights: extraNights, hotel_cost: hotelCost, time_penalty: timePenalty, origin_penalty: originPenalty, effective_cost: effective, fits: best.fits, leg: L.leg }, raw: best.raw,
      };
      const { error } = await db.from("flight_prices").insert(row);
      if (error) errors.push(`${L.leg} ${from}-${to} ${date}: could not save (${error.message})`);
      const offerRows = seen.slice(0, OFFERS_KEPT).map((s, i) => ({
        watch_id: w.id, leg: L.leg, origin, destination: dest, depart_date: date, rank: i + 1, price: s.price, price_per_person: Math.round(s.price / pax * 100) / 100,
        airline: s.airline, flight_numbers: s.flightNums, depart_at: s.departAt, arrive_at: s.arriveAt, stops: s.stops, duration_minutes: s.duration, layovers: s.layovers, max_layover_minutes: s.maxLayover, fits: s.fits, booking_url: url,
      }));
      const { error: oerr } = await db.from("flight_offers").insert(offerRows);
      if (oerr) errors.push(`${L.leg} ${from}-${to} ${date}: offers not saved (${oerr.message})`); else offersKept += offerRows.length;
      found.push({ leg: L.leg, origin, date, price: best.price, effective, airline: best.airline, stops: best.stops, url, departAt: best.departAt || "", extraNights, fits: best.fits });
      await sleep(DELAY_MS);
    }

    await db.from("flight_watches").update({ last_checked_at: new Date().toISOString() }).eq("id", w.id);
    const outs = found.filter((f) => f.leg === "out"), rets = found.filter((f) => f.leg === "ret");
    if (!outs.length && !rets.length) { report.push({ watch: w.label, mode, searches: 0, errors }); continue; }

    const summary: Record<string, unknown> = { watch: w.label, mode, searches: found.length, offers: offersKept, errors };
    let reason: string | null = null;
    let cheapestNow: Found | null = null, cheapestFare: Found | null = null;
    let firstEver = false, crossedNow = false, lowSeat: number | null = null, nowSeat = 0;
    if (outs.length) {
      cheapestNow = [...outs].sort((a, b) => a.effective - b.effective)[0];
      cheapestFare = [...outs].sort((a, b) => a.price - b.price)[0];
      summary.best_per_seat = Math.round(cheapestNow.effective / pax); summary.best_origin = cheapestNow.origin; summary.cheapest_fare_per_seat = Math.round(cheapestFare.price / pax);
      summary.best_fits = cheapestNow.fits;
      const { data: hist } = await db.from("flight_prices").select("price,observed_at,leg").eq("watch_id", w.id).in("leg", ["out", "rt"]).order("price", { ascending: true }).limit(200);
      const prior = (hist || []).filter((h) => ptDate(new Date(h.observed_at)) < today).map((h) => Number(h.price));
      const priorLow = prior.length ? Math.min(...prior) : null;
      nowSeat = cheapestFare.price / pax;
      lowSeat = priorLow != null ? priorLow / pax : null;
      if (w.booked_at) {
        const paidSeat = Number(w.booked_out_cash) || 0, thresh = Number(w.rebook_threshold) || 50, drop = paidSeat - nowSeat;
        if (paidSeat > 0 && drop >= thresh) reason = `outbound ${money(drop)}/seat below the ${money(paidSeat)} you paid, worth rebooking for the credit`;
      } else {
        const newLow = lowSeat != null && nowSeat < lowSeat;
        firstEver = lowSeat == null;
        crossedNow = Boolean(w.target_price) && nowSeat <= Number(w.target_price) && !w.last_alerted_at;
        if (newLow) reason = `a new low, was ${money(lowSeat as number)}/seat`;
        else if (crossedNow) reason = `at or below your ${money(Number(w.target_price))}/seat target`;
      }
    }
    if (rets.length) {
      const bestRet = [...rets].sort((a, b) => a.effective - b.effective)[0];
      summary.return_per_seat = Math.round(bestRet.price / pax); summary.return_origin = bestRet.origin; summary.return_date = bestRet.date; summary.return_fits = bestRet.fits;
      const paidRet = Number(w.booked_ret_cash) || 0;
      if (paidRet > 0 && !reason) { const drop = paidRet - bestRet.price / pax; if (drop >= (Number(w.rebook_threshold) || 50)) reason = `return ${money(drop)}/seat below the ${money(paidRet)} you paid, worth rebooking for the credit`; }
    }
    const alertedRecently = w.last_alerted_at ? (Date.now() - new Date(w.last_alerted_at).getTime()) < 20 * 3600 * 1000 : false;
    if (!reason) { summary.alert = w.booked_at ? "booked, not enough of a drop" : `no alert, prior low ${lowSeat != null ? money(lowSeat) : "none yet"}`; report.push(summary); continue; }
    if (alertedRecently) { summary.alert = `would alert (${reason}) but already sent in the last 20h`; report.push(summary); continue; }
    if (!w.booked_at && firstEver && !crossedNow) { summary.alert = "first reading recorded; nothing to compare yet"; report.push(summary); continue; }

    const lines: string[] = [];
    const lead = cheapestNow || rets[0];
    const partyNote = pax > 1 ? ` (${money(lead.price)} for ${pax})` : "";
    lines.push(`${lead.leg === "out" ? `${lead.origin} ${lead.date} -> ${dest}` : `${dest} ${lead.date} -> ${lead.origin}`} is ${money(lead.price / pax)}/seat${partyNote}, ${reason}.`);
    if (lead.extraNights > 0) lines.push(`${lead.extraNights} extra hotel night(s): ${money(lead.effective / pax)}/seat all-in, still the best option.`);
    if (!lead.fits) lines.push(`Note: this itinerary is outside your stop or time preferences; the fitting options cost more today.`);
    if (cheapestNow && cheapestFare && (cheapestFare.origin !== cheapestNow.origin || cheapestFare.date !== cheapestNow.date)) lines.push(`Cheapest fare was ${cheapestFare.origin} ${cheapestFare.date} at ${money(cheapestFare.price / pax)}/seat, but costs more all-in.`);
    lines.push(`${lead.date}: ${lead.airline}, ${lead.stops === 0 ? "nonstop" : `${lead.stops} stop(s)`}`);
    if (outs.length > 1) {
      const byOrigin = new Map<string, Found>();
      for (const f of outs) { const b = byOrigin.get(f.origin); if (!b || f.effective < b.effective) byOrigin.set(f.origin, f); }
      lines.push("Outbound by airport (per seat): " + [...byOrigin.values()].sort((a, b) => a.effective - b.effective).map((f) => `${f.origin} ${money(f.price / pax)}`).join("  "));
    }
    if (rets.length) { const b = [...rets].sort((a, b) => a.price - b.price)[0]; lines.push(`Return from ${money(b.price / pax)}/seat on ${b.date} (${b.airline}, ${b.stops === 0 ? "nonstop" : `${b.stops} stop(s)`}).`); }
    lines.push(lead.url);
    const message = lines.join("\n");
    const recipients: string[] = [];
    if (w.alert_phone && w.carrier_gateway) recipients.push(`${String(w.alert_phone).replace(/\D/g, "")}@${w.carrier_gateway}`);
    if (w.alert_email) recipients.push(w.alert_email);
    const subject = `Flight ${dest} ${money(lead.price / pax)}/seat`;

    let sentVia: string | null = null, sendError: string | null = null;
    if (w.text_me === false) sendError = "texts are switched off for this trip; alert stored only";
    else if (!dryRun && recipients.length) {
      const resendKey = Deno.env.get("RESEND_API_KEY") || "";
      const smtpUser = Deno.env.get("SMTP_USER") || "", smtpPass = Deno.env.get("SMTP_PASS") || "";
      if (resendKey) {
        try {
          const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: Deno.env.get("ALERT_FROM") || "En Garde <onboarding@resend.dev>", to: recipients, subject, text: message }) });
          if (r.ok) sentVia = "resend"; else sendError = `resend ${r.status}: ${(await r.text()).slice(0, 200)}`;
        } catch (err) { sendError = `resend: ${(err as Error).message}`; }
      } else if (smtpUser && smtpPass) {
        try {
          const nodemailer = await import("npm:nodemailer@6");
          const transport = nodemailer.default.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } });
          await transport.sendMail({ from: smtpUser, to: recipients.join(","), subject, text: message });
          sentVia = "gmail-smtp";
        } catch (err) { sendError = `smtp: ${(err as Error).message}`; }
      } else sendError = "no RESEND_API_KEY or SMTP_USER/SMTP_PASS set; alert stored only";
    } else if (!recipients.length) sendError = "no phone or email on this watch; alert stored only";
    await db.from("flight_alerts").insert({ watch_id: w.id, reason, message, recipients, subject, sent_via: sentVia, error: sendError, dry_run: dryRun });
    if (sentVia) await db.from("flight_watches").update({ last_alerted_at: new Date().toISOString() }).eq("id", w.id);
    summary.alert = sentVia ? `sent via ${sentVia} (${reason})` : `stored (${reason}) ${sendError ? "· " + sendError : ""}`;
    report.push(summary);
  }

  return json({ date: today, sweep: sundaySweep, searches, watches: report });
});
