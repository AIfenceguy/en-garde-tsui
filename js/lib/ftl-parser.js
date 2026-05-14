// FTL paste parser — forgiving regex-based extractor for pool/DE/tableau text.
//
// FTL pages, AskFred, and most live-scoring exports follow a similar table-ish
// format. This parser doesn't try to perfectly understand any one of them — it
// pulls out fencer-shaped lines (NAME — CLUB — RATING) and any bout scores it
// can find.
//
// Returns: { fencers: [{name, club, rating}], bouts: {"i-j": {...}}, des: [...] }
// (bouts/des are best-effort; on a fresh pool sheet they'll be empty)

const RATING_RE = /\b([A-E])\s?(\d{2,4})\b/;      // A26, B25, etc.
const POSITION_RE = /^\s*(\d+)\s*[\.|:|\-|\)]/;   // "1. ", "2) ", etc.

export function parseFtlText(text) {
    if (!text || typeof text !== 'string') return null;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const fencers = [];
    const seen = new Set();

    for (const raw of lines) {
        // Skip section headers
        if (/^(pool|round|round of|tableau|results|standings|name|status)\b/i.test(raw)) continue;
        if (raw.length < 5) continue;

        const f = extractFencer(raw);
        if (!f) continue;
        const key = f.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        fencers.push(f);
    }

    // Best-effort bout extraction (rare in a pool sheet but available in results)
    const bouts = {};
    // Look for lines like "BLAETZ Isadora 5 - 3 SMITH Jane" or "5-3"
    // For pool sheets, scores live in a matrix, not paste-extractable line-by-line.
    // We'll skip bout extraction for v1 — the user can tap each cell.

    return {
        fencers,
        bouts,
        des: []
    };
}

function extractFencer(line) {
    // Strip leading position number
    let s = line.replace(POSITION_RE, '').trim();
    // Pull rating off the end if present
    let rating = null;
    const ratingMatch = s.match(RATING_RE);
    if (ratingMatch) {
        rating = ratingMatch[1] + ratingMatch[2];
        s = s.replace(RATING_RE, '').trim();
    }
    // Split into name + club using "·" or multiple spaces or " - " or " — "
    let name = s, club = null;
    const splits = s.split(/\s+[·•—–-]\s+|  +|\t+/).map(p => p.trim()).filter(Boolean);
    if (splits.length >= 2) {
        name = splits[0];
        club = splits.slice(1).join(' · ');
    }
    // A name needs at least 2 words OR be all caps
    const nameOk = /[A-Za-z]/.test(name) && (name.split(/\s+/).length >= 2 || /^[A-Z]+$/.test(name));
    if (!nameOk) return null;
    // Filter very common false positives
    if (/^(status|name|club|rating|rank|country|division|place|date|score|wins?|losses?|earned)$/i.test(name)) return null;

    // Normalize name capitalization a bit — keep "BLAETZ Isadora" as-is if uppercase last,
    // but title-case if all caps
    const norm = name.replace(/\s+/g, ' ').trim();
    return { name: norm, club, rating };
}
