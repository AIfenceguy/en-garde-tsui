// FTL paste parser — extracts pool ROSTERS (not scores).
// Handles iPhone Safari "Select All → Copy" output from FTL pool sheets.
//
// FTL pool sheet format (tab-separated):
//   Pool #N
//   On strip <X>
//   1\t2\t3\t...\tV\tV / M\tTS\tTR\tInd        <- column header (ignored)
//   LEE Abin                                    <- name line
//   LAIFC / Southern California / USA\t1\t...   <- club + position + scores (we only care about club + position)
//   ...
//   Referee(s)                                  <- end-of-pool marker
//
// Returns:
//   { pools: [{ number, strip, fencers: [{position, name, club, country}] }],
//     fencers: <first pool's roster, for back-compat>,
//     bouts: {}, des: [] }

const POOL_HEADER_RE = /^Pool\s*#?\s*(\d+)/i;
const STRIP_RE = /^On\s+strip\s+(\S+)/i;
const SCORE_GRID_HEADER_RE = /^[\d\t \s]+V[\t \s]+V\s*\/\s*M[\t \s]+TS[\t \s]+TR[\t \s]+Ind\s*$/i;
const REFEREE_RE = /^Referee\(?s?\)?$/i;
const FOOTER_RE = /(copyright|fencingtime\.com|terms of use|privacy policy|fencingtimelive)/i;

// Name = ALL-CAPS-ish surname (1+ words) + given name (1+ words, any case).
// Per CLAUDE.md hard rule #7: name matching is case-insensitive — never reject
// a name because of casing. FTL/USFA publishes "WANG sicheng", "LEPAROUX Jean",
// "MARTIN IV Elmer D.", "O'Sullivan", "de la Vega", "BADROEL RIZWAN Uzair".
// Optional DE seed prefix "(1) WEI Winston" or "(27T) TSUI Raedyn Ho Hin".
//
// Strategy: lastname must be a 2+ letter token that starts with a capital and
// contains mostly caps (allow mixed case like "EL BATTI" or "de la Vega"),
// firstname is a 1+ letter token starting with any letter (upper OR lower).
const NAME_RE = /^(?:\(\d+T?\)\s+)?[A-Za-z][A-Za-z\-'. ]{1,}\s+[A-Za-z][a-zA-Z\-'. ]+$/;
const SEED_PREFIX_RE = /^\((\d+T?)\)\s+/;
const DE_TABLEAU_RE = /Table\s+of\s+\d+/i;

// Surname token must have at least one uppercase character (USFA convention)
// to avoid false positives on prose lines like "On strip A1" or "Pool details".
const SURNAME_HAS_UPPER_RE = /^[^a-zA-Z]*[A-Z]/;

export function parseFtlText(text) {
    if (!text || typeof text !== 'string') return emptyResult();
    const lines = text.split(/\r?\n/);

    const pools = [];
    let currentPool = null;
    let pendingName = null;

    for (const rawLine of lines) {
        const line = rawLine.replace(/ /g, ' '); // nbsp → space
        const stripped = line.trim();
        if (!stripped) continue;

        // Pool boundary
        const poolM = stripped.match(POOL_HEADER_RE);
        if (poolM) {
            currentPool = { number: parseInt(poolM[1], 10), strip: null, fencers: [] };
            pools.push(currentPool);
            pendingName = null;
            continue;
        }

        // Strip
        const stripM = stripped.match(STRIP_RE);
        if (stripM && currentPool) {
            currentPool.strip = stripM[1];
            continue;
        }

        // Column header row (numbers + V V/M TS TR Ind) — ignore
        if (SCORE_GRID_HEADER_RE.test(stripped) || /^(1\s+2\s+3|1\t2\t3)/.test(stripped)) {
            pendingName = null;
            continue;
        }
        // Referee section ends a pool's fencer block
        if (REFEREE_RE.test(stripped)) {
            pendingName = null;
            continue;
        }
        if (FOOTER_RE.test(stripped)) {
            pendingName = null;
            continue;
        }

        // Name line — only valid inside a pool
        if (looksLikeName(stripped) && currentPool && !line.includes('\t')) {
            pendingName = stripped;
            continue;
        }

        // Data line: must have tabs + a position number
        if (pendingName && currentPool && line.includes('\t')) {
            const cells = line.split('\t').map(c => c.trim());
            if (cells.length >= 3) {
                const positionStr = cells[1] || '';
                const position = parseInt(positionStr, 10);
                if (Number.isInteger(position) && position >= 1 && position <= 9) {
                    const clubBlob = cells[0] || '';
                    const { club, country } = splitClubBlob(clubBlob);
                    currentPool.fencers.push({
                        position,
                        name: pendingName,
                        club,
                        country
                    });
                    pendingName = null;
                    continue;
                }
            }
            // Data line we couldn't parse — clear pending
            pendingName = null;
            continue;
        }

        // Anything else clears the pending name
        if (!looksLikeName(stripped)) pendingName = null;
    }

    // Sort each pool's fencers by position
    for (const p of pools) {
        p.fencers.sort((a, b) => a.position - b.position);
    }

    // If no pool blocks found, fall back to flat heuristic
    if (!pools.length) {
        const flat = heuristicFlatParse(lines);
        return { pools: [], fencers: flat, bouts: {}, des: [] };
    }

    // Backward-compat: flatten the first pool's fencers into top-level
    const flatFencers = pools[0].fencers.map(f => ({
        name: f.name,
        club: f.club,
        rating: null  // FTL pool sheet doesn't include ratings per fencer
    }));

    return {
        pools,
        fencers: flatFencers,
        bouts: {},
        des: [],
        multiPool: pools.length > 1
    };
}

function emptyResult() { return { pools: [], fencers: [], bouts: {}, des: [] }; }

function looksLikeName(s) {
    if (!s) return false;
    if (!NAME_RE.test(s)) return false;
    // Strip optional seed prefix before further checks
    const stripped = s.replace(SEED_PREFIX_RE, '').trim();
    // Surname must contain at least one uppercase letter (avoids false positives
    // on prose lines like "Pool details" or "On strip A1")
    const firstToken = stripped.split(/\s+/)[0] || '';
    if (!SURNAME_HAS_UPPER_RE.test(firstToken)) return false;
    // Heuristic noun-phrase rejection (case-insensitive — per CLAUDE.md #7)
    const lower = stripped.toLowerCase();
    if (/^(pool|round|tableau|event|venue|location|tournament|fencing|status|name|club|rating|rank|date|time|results|standings|sport|round of)\b/.test(lower)) return false;
    return true;
}

// Public: normalize a fencer name for case-insensitive comparison/dedupe.
// "WANG sicheng" / "Wang Sicheng" / "wang sicheng" → "wang sicheng"
// "(27T) TSUI Raedyn Ho Hin" → "tsui raedyn ho hin"
// "O'Sullivan, Brendan" → "osullivan brendan"
export function normalizeName(s) {
    if (!s) return '';
    return String(s)
        .replace(SEED_PREFIX_RE, '')       // strip "(1) " or "(27T) "
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')          // drop punctuation
        .replace(/\s+/g, ' ')
        .trim();
}

// Public: case-insensitive equality check on fencer names
export function namesMatch(a, b) {
    return normalizeName(a) === normalizeName(b);
}

// Public: case-insensitive "name contains lastname" check (for finding a user
// in a pasted roster — "TSUI Raedyn Ho Hin" should match a search for "Tsui")
export function nameContains(haystack, needle) {
    if (!haystack || !needle) return false;
    return normalizeName(haystack).includes(normalizeName(needle));
}

function splitClubBlob(blob) {
    // "LAIFC / Southern California /  USA"  →  club: "LAIFC", country: "USA"
    // "LAIFC /  CHN"                        →  club: "LAIFC", country: "CHN"
    // " MEX"                                →  club: null, country: "MEX"
    const parts = blob.split('/').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return { club: null, country: null };
    // 3-letter all-caps token at end = country
    const last = parts[parts.length - 1];
    const country = /^[A-Z]{3}$/.test(last) ? last : null;
    const clubParts = country ? parts.slice(0, -1) : parts;
    // First part = club abbreviation (most useful)
    const club = clubParts.length ? clubParts.join(' / ') : null;
    return { club, country };
}

/**
 * Parse a DE (Direct Elimination) tableau paste and extract the user's bouts.
 *
 * Heuristic strategy:
 *   1. Find the user's name line ("(27T) TSUI Raedyn Ho Hin")
 *   2. Find the next fencer block (their T64 paired opponent)
 *   3. Read the score on the opponent's data line (winner's POV: e.g. 15-12)
 *   4. Find the "advancer label" between the user's and opponent's blocks
 *      (e.g. "(38) ZHOU jiatong") — this tells us who won
 *   5. If user won, follow the advancer chain to find T32, T16, T8 etc.
 *
 * Returns: { isDETableau: true, userFound: bool, bouts: [{ round, opponent_name, opponent_seed, opponent_club, my_score, opp_score, won, time }] }
 */
export function parseFtlDETableau(text, userName) {
    if (!text || !DE_TABLEAU_RE.test(text)) return null;
    const lines = text.split(/\r?\n/);
    const userTokens = (userName ? userName.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3) : []);
    if (!userTokens.length) return { isDETableau: true, userFound: false, bouts: [] };

    // ---- Phase 1: collect fencer blocks ----
    // A block: name line "(seed) NAME" → optional data line (club + tabs + score) + ref/time lines
    const blocks = [];
    for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (!stripped) continue;
        if (lines[i].includes('\t')) continue;
        const seedM = stripped.match(/^\((\d+T?)\)\s+(.+)$/);
        if (!seedM) continue;
        const seed = seedM[1];
        const name = seedM[2];
        if (name.includes('BYE')) continue;
        // Skip "advancer" labels — these appear with leading tabs/spaces in raw line
        if (/^\s+\(/.test(lines[i])) continue;
        // Collect data + ref + time on following lines (up to next blank or next name line)
        let club = null, score = null, timeStr = null;
        for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
            const dl = lines[j];
            const ds = dl.trim();
            if (!ds) break;
            // Stop at next name line
            if (!dl.includes('\t') && /^\(\d+T?\)/.test(ds)) break;
            // Time line
            const tm = ds.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
            if (tm) timeStr = tm[1];
            // Ref line — skip
            if (ds.startsWith('Ref ')) continue;
            // Data line — has tab, may contain score
            if (dl.includes('\t')) {
                const cells = dl.split('\t').map(c => c.trim());
                if (!club && cells[0]) club = cells[0];
                const scoreM = ds.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
                if (scoreM && !score) score = { a: parseInt(scoreM[1]), b: parseInt(scoreM[2]) };
            }
        }
        const nameLower = name.toLowerCase().replace(/[^a-z\s]/g, ' ');
        const isUser = userTokens.some(t => nameLower.includes(t));
        blocks.push({
            lineIndex: i, seed, name, club, score, timeStr, isUser
        });
    }

    // ---- Phase 2: find advancer labels between blocks ----
    // Advancer label = line starting with whitespace + "(seed) NAME" between two adjacent blocks
    function findAdvancerBetween(blockA, blockB) {
        const from = Math.min(blockA.lineIndex, blockB.lineIndex);
        const to = Math.max(blockA.lineIndex, blockB.lineIndex);
        for (let k = from + 1; k < to; k++) {
            const lk = lines[k];
            // Advancer lines start with whitespace then "(N) NAME" — different from name lines (no leading ws)
            if (/^\s+\(\d+T?\)\s+[A-Za-z]/.test(lk) && !lk.includes('—') && !lk.includes('BYE')) {
                const m = lk.match(/\((\d+T?)\)\s+([^\t]+?)(?:\s{2,}|\t|$)/);
                if (m) return { seed: m[1], name: m[2].trim() };
            }
        }
        return null;
    }

    // Time → round mapping (heuristic — typical FTL Cadet schedule)
    function inferRound(time) {
        if (!time) return null;
        const m = time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!m) return null;
        let h = parseInt(m[1]); const mn = parseInt(m[2]);
        if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
        const t = h * 60 + mn;
        if (t < 16 * 60 + 0) return 64;        // before 16:00 → T64
        if (t < 16 * 60 + 40) return 32;       // 16:00-16:39 → T32
        if (t < 17 * 60 + 30) return 16;       // 16:40-17:29 → T16
        if (t < 18 * 60 + 0) return 8;         // 17:30-17:59 → T8
        if (t < 18 * 60 + 30) return 4;        // 18:00-18:29 → SF
        return 2;
    }

    // ---- Phase 3: for each user block, find paired opponent + advancer ----
    const userBlocks = blocks.filter(b => b.isUser);
    if (!userBlocks.length) return { isDETableau: true, userFound: false, bouts: [] };

    const bouts = [];
    const seenPairs = new Set();
    for (const ub of userBlocks) {
        const ubIdx = blocks.indexOf(ub);
        for (const offset of [1, -1]) {
            const opp = blocks[ubIdx + offset];
            if (!opp || opp.isUser) continue;
            const pairKey = [ub.lineIndex, opp.lineIndex].sort().join('-');
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const advancer = findAdvancerBetween(ub, opp);
            let userWon = null;
            if (advancer) {
                const advNorm = advancer.name.toLowerCase();
                userWon = userTokens.some(t => advNorm.includes(t));
            }

            // The T64 bout score lives on the OPPONENT's data line in FTL (winner-POV)
            // because the spatial layout pushes the user's first bout score to their column.
            // Fallback to user's score if opp has none.
            const sObj = opp.score || ub.score;
            const sTime = opp.timeStr || ub.timeStr;
            const round = inferRound(sTime) || 64;

            if (sObj && userWon !== null) {
                const winner = Math.max(sObj.a, sObj.b);
                const loser = Math.min(sObj.a, sObj.b);
                bouts.push({
                    round,
                    opponent_name: opp.name,
                    opponent_seed: opp.seed,
                    opponent_club: opp.club,
                    my_score: userWon ? winner : loser,
                    opp_score: userWon ? loser : winner,
                    won: userWon,
                    time: sTime
                });
            }
            break;
        }
    }

    return { isDETableau: true, userFound: true, bouts };
}

// Fallback for non-pool-sheet pastes (legacy paths)
function heuristicFlatParse(lines) {
    const out = [];
    const seen = new Set();
    for (const raw of lines) {
        const s = raw.trim();
        if (!s) continue;
        if (POOL_HEADER_RE.test(s) || REFEREE_RE.test(s) || FOOTER_RE.test(s)) continue;
        if (SCORE_GRID_HEADER_RE.test(s)) continue;
        if (looksLikeName(s)) {
            const key = s.toLowerCase().replace(/\s+/g, '');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ name: s, club: null, rating: null });
        }
    }
    return out;
}
