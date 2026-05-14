// FTL paste parser — handles real iPhone-Safari "Select All → Copy" output.
//
// Recognized inputs:
//   1. FTL competitors table  (Status, Name, Club, Division, Country, Rating, Rank)
//   2. FTL pool sheet         (1. NAME CLUB RATING / Pool # headers / scores grid)
//   3. FTL DE bracket / results (PLACE NAME CLUB RATING)
//   4. AskFred event roster   (similar shape)
//   5. Any pasted text where each fencer is on a line with name + optional club + rating
//
// Strategy:
//   • Split on lines AND tabs (an HTML table copy is usually tab-separated)
//   • For each row, try to identify name, club, rating using positional heuristics
//   • Skip headers/navigation/noise rows
//   • Normalize FTL ratings "A2026" → "A26"
//
// Returns: { fencers: [{name, club, rating}], bouts: {}, des: [] }

const NOISE_RE = /^(status|name|club|club\(s\)|division|country|rating|rank|place|earned|qualified for|date|time|sport|event|finished|started|format|pool|round|tableau|results|standings|teams|teams scheduled|checked in|registered|withdrew|my account|log out|sign in|advanced search|home|tournaments|search|next|previous|view all|all|usa|fie|local|national|regional|fencing time|fencingtimelive|english.*|toggle|menu)$/i;

const STATUS_WORDS = /^(checked\s*in|registered|withdrew|scratch(ed)?|present|absent|invited|on\s*deck)$/i;

// FTL rating: A2026, B2026, etc. — also B25, A26 short forms. Plus U (unrated).
const RATING_RE = /\b([A-EUu])\s?(\d{2,4})\b/;

// "Position" like "1.", "2)", "#3", "4 -"
const POSITION_RE = /^\s*#?(\d+)\s*[\.\):\-]*\s*/;

// "#7" rank style
const RANK_HASH_RE = /^#\d+$/;

export function parseFtlText(text) {
    if (!text || typeof text !== 'string') return { fencers: [], bouts: {}, des: [] };

    const rawLines = text.split(/\r?\n/).map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);

    // Each line may be tab-separated (table copy) or space-separated.
    // Try both interpretations and pick whichever yields more fencers.
    const fromTabs = parseAsTabular(rawLines, /\t+/);
    const fromMultiSpace = parseAsTabular(rawLines, / {2,}/);
    const fromHeuristic = parseAsHeuristic(rawLines);

    const candidates = [fromTabs, fromMultiSpace, fromHeuristic];
    candidates.sort((a, b) => b.length - a.length);
    const fencers = dedupe(candidates[0]);

    return { fencers, bouts: {}, des: [] };
}

function dedupe(fencers) {
    const seen = new Set();
    const out = [];
    for (const f of fencers) {
        const key = (f.name || '').toLowerCase().replace(/[^a-z]/g, '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(f);
    }
    return out;
}

function isNoise(s) {
    if (!s) return true;
    const t = s.trim();
    if (t.length < 2) return true;
    if (NOISE_RE.test(t)) return true;
    if (/^\d+$/.test(t)) return true;         // bare number
    if (RANK_HASH_RE.test(t)) return true;    // "#7"
    return false;
}

function looksLikeName(s) {
    if (!s) return false;
    const t = s.trim();
    if (t.length < 3) return false;
    if (!/[A-Za-z]/.test(t)) return false;
    if (NOISE_RE.test(t)) return false;
    if (STATUS_WORDS.test(t)) return false;
    if (/^\d+(\.\d+)?$/.test(t)) return false;
    // Should have at least one letter and either: 2+ words, or all-caps lastname (FTL convention)
    const words = t.split(/\s+/);
    if (words.length === 1 && !/^[A-Z]{2,}$/.test(t)) return false;
    return true;
}

function normalizeRating(s) {
    if (!s) return null;
    const m = String(s).match(RATING_RE);
    if (!m) return null;
    let yr = m[2];
    // FTL gives "A2026" — keep last 2 digits as "26"
    if (yr.length === 4) yr = yr.slice(-2);
    return (m[1].toUpperCase() + yr).toUpperCase();
}

function pluckRating(s) {
    if (!s) return { text: s, rating: null };
    const m = s.match(RATING_RE);
    if (!m) return { text: s, rating: null };
    const yr = m[2].length === 4 ? m[2].slice(-2) : m[2];
    return {
        text: s.replace(RATING_RE, '').replace(/\s+/g, ' ').trim(),
        rating: (m[1].toUpperCase() + yr).toUpperCase()
    };
}

// ============= STRATEGY 1: TABULAR (tab- or multi-space-separated) ==============
function parseAsTabular(lines, sep) {
    const rows = lines.map(l => l.split(sep).map(c => c.trim()).filter(Boolean));
    if (!rows.length) return [];

    // Find header row — has multiple known column names
    let headerRow = -1;
    let columnOrder = null;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const lower = rows[i].map(c => c.toLowerCase());
        const has = (...words) => words.every(w => lower.some(l => l.includes(w)));
        if (has('name') && (has('club') || has('rating') || has('division'))) {
            headerRow = i;
            columnOrder = lower;
            break;
        }
    }

    const out = [];
    const dataRows = headerRow >= 0 ? rows.slice(headerRow + 1) : rows;
    for (const cells of dataRows) {
        if (cells.length < 2) continue;
        // Skip rows that are clearly noise (single cell, all numbers, etc.)
        if (cells.every(c => isNoise(c))) continue;
        const fencer = extractFencerFromCells(cells, columnOrder);
        if (fencer && looksLikeName(fencer.name)) out.push(fencer);
    }
    return out;
}

function extractFencerFromCells(cells, header) {
    // If we have a header, use it to find column positions
    if (header) {
        const idxOf = (...words) => header.findIndex(h => words.some(w => h.includes(w)));
        const nameI = idxOf('name');
        const clubI = idxOf('club');
        const ratingI = idxOf('rating');
        const name = nameI >= 0 ? cells[nameI] : null;
        if (!name || !looksLikeName(name)) return null;
        return {
            name: cleanName(name),
            club: clubI >= 0 ? (cells[clubI] || null) : null,
            rating: ratingI >= 0 ? normalizeRating(cells[ratingI]) : null
        };
    }
    // No header — heuristic
    // Strip leading status word ("Checked In") and trailing rank ("#7")
    let filtered = cells.filter(c => !STATUS_WORDS.test(c) && !RANK_HASH_RE.test(c));
    if (!filtered.length) return null;
    // First name-like cell = name
    const nameCell = filtered.find(looksLikeName);
    if (!nameCell) return null;
    // Look for rating cell
    let rating = null, clubGuess = null;
    for (const c of filtered) {
        if (c === nameCell) continue;
        const m = c.match(RATING_RE);
        if (m && !rating && c.length <= 8) {
            rating = normalizeRating(c);
            continue;
        }
        if (looksLikeName(c)) continue; // probably another fencer accidentally on same line
        if (!clubGuess && c.length >= 3 && c.length < 80 && /[A-Za-z]/.test(c)) {
            clubGuess = c;
        }
    }
    return {
        name: cleanName(nameCell),
        club: clubGuess,
        rating
    };
}

function cleanName(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(POSITION_RE, '').trim();
}

// ============ STRATEGY 2: HEURISTIC LINE-BY-LINE =============
function parseAsHeuristic(lines) {
    const out = [];
    for (const raw of lines) {
        if (isNoise(raw)) continue;
        // Try to peel position prefix
        const noPos = raw.replace(POSITION_RE, '').trim();
        if (noPos.length < 4) continue;
        // Pluck rating
        const { text: nameAndClub, rating } = pluckRating(noPos);
        // Split name vs club at "·", "•", "—", "–", " - ", multiple spaces
        const parts = nameAndClub.split(/\s+[·•—–-]\s+|  +|\t+/).map(p => p.trim()).filter(Boolean);
        let name, club = null;
        if (parts.length >= 2) {
            name = parts[0];
            club = parts.slice(1).join(' · ');
        } else {
            // Maybe "LASTNAME Firstname Club" — split by first transition from ALL CAPS to Mixed
            const m = nameAndClub.match(/^([A-Z][A-Z\-']+(?:\s+[A-Z][A-Z\-']+)*\s+[A-Z][a-zA-Z\-']+(?:\s+[A-Z][a-zA-Z\-']+)*)\s+(.+)$/);
            if (m) { name = m[1]; club = m[2]; }
            else name = nameAndClub;
        }
        if (!looksLikeName(name)) continue;
        // Filter out status words that snuck through
        if (STATUS_WORDS.test(name)) continue;
        out.push({ name: cleanName(name), club: club || null, rating });
    }
    return out;
}
