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

    // ---- Detect starting table size (T64, T128, T256, etc.) from header ----
    // The header row looks like: "Table of 128\tTable of 64\tTable of 32\tTable of 16\tTable of 8\tSemi-Finals\tFinals"
    let startingTable = 64;  // default
    for (const line of lines.slice(0, 20)) {
        const m = line.match(/Table\s+of\s+(\d+)/i);
        if (m) { startingTable = parseInt(m[1], 10); break; }
    }
    // Generate the round-size list: e.g. starting 128 → [128, 64, 32, 16, 8, 4, 2]
    const roundSizes = [];
    for (let s = startingTable; s >= 2; s = Math.floor(s / 2)) roundSizes.push(s);

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
    // Advancer = line with leading whitespace + "(N) NAME" — NOT a top-level name line.
    // The TAB DEPTH (number of leading tabs/spaces in groups) tells us which COLUMN
    // the advancer sits in → which round was just won.
    //   depth 1 → user advanced from starting table (e.g. T128 or T64) to next
    //   depth 2 → user advanced from next round
    //   ...
    function countLeadingTabs(line) {
        // count groups of "\t" or "\t " — FTL pads with optional space after each tab
        let cnt = 0;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '\t') cnt++;
            else if (line[i] === ' ' && i + 1 < line.length && line[i+1] === '\t') continue;  // space before a tab — keep going
            else if (line[i] !== ' ') break;
        }
        return cnt;
    }

    function findAdvancerBetween(blockA, blockB) {
        const from = Math.min(blockA.lineIndex, blockB.lineIndex);
        const to = Math.max(blockA.lineIndex, blockB.lineIndex);
        for (let k = from + 1; k < to; k++) {
            const lk = lines[k];
            if (/^\s+\(\d+T?\)\s+[A-Za-z]/.test(lk) && !lk.includes('—') && !lk.includes('BYE')) {
                const m = lk.match(/\((\d+T?)\)\s+([^\t]+?)(?:\s{2,}|\t|$)/);
                if (m) {
                    return {
                        seed: m[1],
                        name: m[2].trim(),
                        tabDepth: countLeadingTabs(lk)
                    };
                }
            }
        }
        return null;
    }

    // Round inference: tab depth → which column → which round size
    // For a T128 event: column 0 = starting names, column 1 = T128 advancers (won T128, going to T64)
    //                    column 2 = T64 advancers, column 3 = T32 advancers, etc.
    // So a bout at columnDepth N was fenced in round = roundSizes[N-1]
    // (e.g. for T128: depth 1 → T128, depth 2 → T64, depth 3 → T32, ...)
    function roundFromDepth(depth) {
        if (depth < 1) return roundSizes[0];
        const idx = depth - 1;
        return roundSizes[idx] || roundSizes[roundSizes.length - 1];
    }

    // ---- Phase 3: locate user ----
    const userBlocks = blocks.filter(b => b.isUser);
    if (!userBlocks.length) return { isDETableau: true, userFound: false, bouts: [] };
    const userBlock = userBlocks[0];
    const userIdx = blocks.indexOf(userBlock);

    // Find all advancer labels with their tab depth
    const advancers = [];
    for (let k = 0; k < lines.length; k++) {
        const lk = lines[k];
        if (!/^\s+\(\d+T?\)\s+[A-Za-z]/.test(lk)) continue;
        if (lk.includes('—') || lk.includes('BYE')) continue;
        const m = lk.match(/\((\d+T?)\)\s+([^\t]+?)(?:\s{2,}|\t|$)/);
        if (m) {
            advancers.push({
                lineIndex: k,
                seed: m[1],
                name: m[2].trim(),
                tabDepth: countLeadingTabs(lk)
            });
        }
    }

    // Helper: is this advancer the user themselves?
    function advIsUser(adv) {
        if (!adv) return false;
        const n = adv.name.toLowerCase();
        return userTokens.some(t => n.includes(t));
    }

    // ---- Phase 4: build the user's bracket path ----
    // FTL lists blocks in visual top-to-bottom order. Each T64 match = 2 adjacent blocks.
    // Larger sub-brackets nest: T32 = 4 blocks, T16 = 8, T8 = 16, SF = 32, F = 64.
    //
    // For each round R (index into roundSizes), user's sub-bracket at NEXT round
    // size = 2^(R+1) blocks. Opponent at round R+1 = winner of the OTHER half.

    const bouts = [];

    // ---- Round 1 (starting round, T64/T128/T256): adjacent paired block ----
    const pair = blocks[userIdx + 1] && !blocks[userIdx + 1].isUser ? blocks[userIdx + 1]
              : (blocks[userIdx - 1] && !blocks[userIdx - 1].isUser ? blocks[userIdx - 1] : null);
    let userStillAlive = false;
    let lastUserAdvancerDepth = 0;

    if (pair) {
        const adv = findAdvancerBetween(userBlock, pair);
        const userWon = adv ? advIsUser(adv) : null;
        const sObj = pair.score || userBlock.score;
        const sTime = pair.timeStr || userBlock.timeStr;
        if (sObj && userWon !== null) {
            const w = Math.max(sObj.a, sObj.b), l = Math.min(sObj.a, sObj.b);
            bouts.push({
                round: roundSizes[0],
                opponent_name: pair.name,
                opponent_seed: pair.seed,
                opponent_club: pair.club,
                my_score: userWon ? w : l,
                opp_score: userWon ? l : w,
                won: userWon,
                time: sTime,
                status: 'completed'
            });
            userStillAlive = userWon;
            if (userWon) lastUserAdvancerDepth = 1;
        } else {
            // Pre-bout placeholder — no advancer yet
            bouts.push({
                round: roundSizes[0],
                opponent_name: pair.name,
                opponent_seed: pair.seed,
                opponent_club: pair.club,
                my_score: null, opp_score: null, won: null,
                time: sTime, status: 'pending'
            });
            userStillAlive = true;  // not yet eliminated
        }
    }

    // ---- Rounds 2+ : trace bracket forward through advancer chain ----
    if (userStillAlive && roundSizes.length > 1) {
        for (let r = 1; r < roundSizes.length; r++) {
            // Sub-bracket size at this round = 2^(r+1) blocks
            const subSize = Math.pow(2, r + 1);
            const halfSize = subSize / 2;
            // Sub-bracket spans blocks [bStart .. bEnd]
            const bStart = Math.floor(userIdx / subSize) * subSize;
            const bEnd = Math.min(bStart + subSize - 1, blocks.length - 1);
            // User's half vs opponent's half
            const userHalf = userIdx < bStart + halfSize ? 'first' : 'second';
            const oppHalfStart = userHalf === 'first' ? bStart + halfSize : bStart;
            const oppHalfEnd = Math.min(oppHalfStart + halfSize - 1, blocks.length - 1);
            if (oppHalfStart >= blocks.length) break;

            const oppHalfLineStart = blocks[oppHalfStart].lineIndex;
            const oppHalfLineEnd = oppHalfEnd + 1 < blocks.length ? blocks[oppHalfEnd + 1].lineIndex : Infinity;

            // The opponent at this round = advancer at depth r within the opp half.
            // (depth r = winner of round r, i.e. who advances FROM that round TO round r+1)
            const oppHalfAdvancers = advancers.filter(a =>
                a.tabDepth === r &&
                a.lineIndex >= oppHalfLineStart &&
                a.lineIndex < oppHalfLineEnd
            );

            // The expected user-advancer at this round — if present, user won this round
            const userHalfLineStart = blocks[userHalf === 'first' ? bStart : bStart + halfSize].lineIndex;
            const userHalfLineEnd = (userHalf === 'first' ? bStart + halfSize : bEnd + 1) < blocks.length
                ? blocks[(userHalf === 'first' ? bStart + halfSize : bEnd + 1)].lineIndex
                : Infinity;
            const userAdvancerThisRound = advancers.find(a =>
                a.tabDepth === r &&
                a.lineIndex >= userHalfLineStart &&
                a.lineIndex < userHalfLineEnd &&
                advIsUser(a)
            );

            // Opponent identity
            let oppName = null, oppSeed = null;
            if (oppHalfAdvancers.length) {
                // Take the last one (deepest in text = most-finalized)
                const adv = oppHalfAdvancers[oppHalfAdvancers.length - 1];
                oppName = adv.name; oppSeed = adv.seed;
            }

            // Round result: did the user advance from THIS round?
            // Look at depth r+1 user-advancers (means user won round r+1 — past this one)
            const userAdvancerNextRound = advancers.find(a =>
                a.tabDepth === r + 1 && advIsUser(a)
            );

            // Score for THIS round bout (if completed): look near user's block for a score+time
            // matching round r. Simplest: skip score on predicted bouts.
            let status = 'predicted';
            let my_score = null, opp_score = null, won = null, time = null;

            // If user lost in a previous round, no further bouts
            if (!userStillAlive) break;

            // If we have a userAdvancerThisRound, user won this round → completed + V
            // If round r+1 still has user-advancer presence, user won → completed
            // Otherwise → predicted
            if (userAdvancerNextRound && userAdvancerNextRound.tabDepth >= r + 1) {
                // User won at least up through round r+1, so round r was a victory.
                // We don't always have the explicit score on this row — leave null for now.
                status = 'completed';
                won = true;
                userStillAlive = true;
            } else if (userAdvancerThisRound) {
                // User has an advancer at exactly depth r → reached round r+1
                status = 'completed';
                won = true;
                userStillAlive = true;
            } else {
                status = 'predicted';
                userStillAlive = false; // we don't know yet — but stop building deeper predictions
            }

            if (oppName || status === 'predicted') {
                bouts.push({
                    round: roundSizes[r],
                    opponent_name: oppName || '(winner of upper bracket)',
                    opponent_seed: oppSeed,
                    opponent_club: null,
                    my_score, opp_score, won, time,
                    status
                });
            }

            // If predicted, only show 1 hop ahead (don't speculate further)
            if (status === 'predicted') break;
        }
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
