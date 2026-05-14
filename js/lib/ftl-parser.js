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
    // Parse a pasted FTL tableau page into per-round bouts for the named user.
    // Returns { isDETableau, userFound, bouts: [{round, opp_name, opp_seed, opp_bye,
    //   my_score, opp_score, won, status}], startingTable }
    //
    // Algorithm:
    //   1. Detect starting table size from "Table of N" header.
    //   2. Walk lines tracking tab depth (= bracket column).
    //   3. Collect depth-0 fencer cells in line order → they're the starting bracket
    //      positions, indexed 0..N-1. Standard tableau pairing uses XOR:
    //      fencer at index i is paired vs (i ^ (1 << R)) in round R.
    //   4. Track all fencer cells (incl. higher-depth advancer labels) and score cells.
    //   5. User's max depth → how many rounds they won. Round R bout exists iff R < log2(N).
    //   6. Score for round R bout is nearest depth-(R+1) score cell to midpoint of
    //      user and opp line positions.
    // All comparisons case-INSENSITIVE per CLAUDE.md rule #7.
    if (!text || !DE_TABLEAU_RE.test(text)) return null;
    const lines = text.split(/\r?\n/);
    const userTokens = (userName || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 3);
    if (!userTokens.length) return { isDETableau: true, userFound: false, bouts: [] };

    let startingTable = 64;
    for (const line of lines.slice(0, 20)) {
        const m = line.match(/Table\s+of\s+(\d+)/i);
        if (m) { startingTable = parseInt(m[1], 10); break; }
    }
    const totalRounds = Math.round(Math.log2(startingTable));
    function roundName(R) {
        const n = startingTable >> R;
        if (n === 4) return 'SF';
        if (n === 2) return 'F';
        return 'T' + n;
    }

    function leadingTabs(line) {
        let cnt = 0;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '\t') cnt++;
            else if (line[i] === ' ') continue;
            else break;
        }
        return cnt;
    }

    const depth0 = [];        // [{idx, line, seed, name, bye, aff}]
    const allFencer = [];     // all depth ≥ 0 fencer cells
    const scoreCells = [];    // {depth, line, score: [w, l]}

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const d = leadingTabs(line);
        const fm = line.match(/^[\s]*\(([0-9]+T?)\)\s+(.+?)(?=\s{2,}|\t|$)/);
        if (fm) {
            const seed = fm[1];
            const name = fm[2].trim();
            const bye = /-?\s*BYE\s*-?/i.test(name);
            // Affiliation = next non-tab non-paren non-time continuation line.
            let aff = null;
            const nl = lines[i + 1];
            if (nl && nl.length && !nl.startsWith('\t') && !/^\s*\(/.test(nl) && !/^\s*\d{1,2}:\d{2}/.test(nl.trim())) {
                const t = nl.trim();
                if (t && (t.includes('/') || (t.split(/\s+/).length <= 3 && !/\d{2}\s*-\s*\d{2}/.test(t)))) {
                    aff = t.split('\t')[0].trim();
                }
            }
            const cell = { depth: d, line: i, seed, name, bye, aff };
            allFencer.push(cell);
            if (d === 0) { cell.idx = depth0.length; depth0.push(cell); }
            // Inline score on the affiliation line
            if (nl) {
                const sm = nl.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
                if (sm) {
                    const idx2 = nl.indexOf(sm[0]);
                    // Reject Strip/time mishits
                    if (!/Strip/.test(nl.slice(Math.max(0, idx2 - 10), idx2)) && !/^\s*\d{1,2}:\d{2}/.test(nl.slice(Math.max(0, idx2 - 10)))) {
                        const sd = nl.slice(0, idx2).split('\t').length - 1;
                        scoreCells.push({ depth: sd, line: i + 1, score: [parseInt(sm[1]), parseInt(sm[2])] });
                    }
                }
            }
            continue;
        }
        // Score-only line
        const sm = line.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
        if (sm && !/Strip/.test(line.slice(0, 30))) {
            const idx2 = line.indexOf(sm[0]);
            // Reject time like "10:43 AM" — already in :MM format, score wouldn't have a colon
            const sd = line.slice(0, idx2).split('\t').length - 1;
            scoreCells.push({ depth: sd, line: i, score: [parseInt(sm[1]), parseInt(sm[2])] });
        }
    }

    function userMatch(name) {
        if (!name) return false;
        const n = name.toLowerCase();
        return userTokens.every(t => n.includes(t));
    }

    const meCell = depth0.find(f => !f.bye && userMatch(f.name));
    if (!meCell) return { isDETableau: true, userFound: false, bouts: [], startingTable };
    const meIdx = meCell.idx;
    const maxUserDepth = Math.max(...allFencer.filter(c => !c.bye && userMatch(c.name)).map(c => c.depth), 0);

    // Compute max-appearance-depth per depth-0 fencer (by name normalized).
    // This tells us how far each fencer advanced in the bracket.
    function normName(s) { return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
    const maxDepthByName = new Map();
    for (const c of allFencer) {
        if (c.bye) continue;
        const k = normName(c.name);
        const cur = maxDepthByName.get(k) || 0;
        if (c.depth > cur) maxDepthByName.set(k, c.depth);
    }

    // Round R bout opp = the fencer in the OPPOSITE sub-bracket of size 2^R
    // with the highest max-appearance-depth (they advanced furthest there → they
    // are the round-R competitor from that side).
    function oppForRound(R) {
        if (R === 0) {
            // T128: simple adjacent pair
            const opp = depth0[meIdx ^ 1];
            return opp || null;
        }
        const subSize = 1 << R;
        const userBase = meIdx & ~(subSize - 1);
        const oppBase = userBase ^ subSize;
        const oppEnd = Math.min(oppBase + subSize, depth0.length);
        let best = null, bestDepth = -1;
        for (let i = oppBase; i < oppEnd; i++) {
            const cand = depth0[i];
            if (!cand || cand.bye) continue;
            const d = maxDepthByName.get(normName(cand.name)) || 0;
            // Tie-break: prefer the one with the LOWER seed (top seed advances)
            const seedNum = parseInt((cand.seed || '999').toString().replace(/T/, ''), 10);
            if (d > bestDepth || (d === bestDepth && best && seedNum < parseInt((best.seed || '999').toString().replace(/T/, ''), 10))) {
                best = cand; bestDepth = d;
            }
        }
        return best;
    }

    const bouts = [];
    for (let R = 0; R < totalRounds; R++) {
        const opp = oppForRound(R);
        if (!opp) break;
        const won = maxUserDepth >= R + 1;
        let myScore = null, oppScore = null;
        if (!opp.bye) {
            // Score for round R bout lives at depth-(R+1), within the line range of
            // user's sub-bracket of size 2^(R+1) depth-0 positions.
            const targetDepth = R + 1;
            const subSize = 1 << (R + 1);
            const subBase = meIdx & ~(subSize - 1);
            const subEnd = Math.min(subBase + subSize, depth0.length);
            const lineMin = depth0[subBase].line;
            const lineMax = subEnd < depth0.length ? depth0[subEnd].line : Infinity;
            // (Allow score to be 1-2 lines AFTER lineMax in case of trailing score line.)
            const cands = scoreCells.filter(s =>
                s.depth === targetDepth &&
                s.line >= lineMin &&
                s.line <= lineMax + 3
            );
            // Within the sub-bracket, there should be exactly ONE score at this depth
            // for the round R bout. If multiple, prefer closest to user line.
            cands.sort((a, b) => Math.abs(a.line - meCell.line) - Math.abs(b.line - meCell.line));
            const best = cands[0];
            if (best) {
                const [w, l] = best.score;
                if (won) { myScore = w; oppScore = l; } else { myScore = l; oppScore = w; }
            }
        }
        bouts.push({
            round: roundName(R),
            opponent_name: opp.name,
            opponent_seed: opp.seed,
            opponent_club: null,
            my_score: myScore,
            opp_score: oppScore,
            won,
            time: null,
            status: 'completed'
        });
        if (!won) break;
    }
    return { isDETableau: true, userFound: true, bouts, startingTable };
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
