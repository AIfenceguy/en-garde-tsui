// YouTube helpers for the video watch-log.
// oEmbed needs no API key and is CORS-open, so a pasted link can be turned
// into a title + thumbnail straight from the browser.

// Accepts watch?v=, youtu.be/, /embed/, /shorts/, /live/ — with or without
// extra query params.
export function parseVideoId(url) {
    if (!url) return null;
    const s = String(url).trim();
    const patterns = [
        /[?&]v=([A-Za-z0-9_-]{11})/,
        /youtu\.be\/([A-Za-z0-9_-]{11})/i,
        /\/embed\/([A-Za-z0-9_-]{11})/i,
        /\/shorts\/([A-Za-z0-9_-]{11})/i,
        /\/live\/([A-Za-z0-9_-]{11})/i
    ];
    for (const re of patterns) {
        const m = s.match(re);
        if (m) return m[1];
    }
    // Bare 11-char id pasted on its own
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    return null;
}

export function canonicalUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

export function thumbnailUrl(videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Fetch title + channel via YouTube's oEmbed endpoint.
 * Returns null when offline or the video is private/removed — callers should
 * fall back to letting the fencer type the title in by hand.
 */
export async function fetchMeta(videoId) {
    const endpoint = 'https://www.youtube.com/oembed?format=json&url=' +
        encodeURIComponent(canonicalUrl(videoId));
    try {
        const res = await fetch(endpoint);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            title: data.title || '',
            author: data.author_name || '',
            thumbnail: data.thumbnail_url || thumbnailUrl(videoId)
        };
    } catch (_) {
        return null;
    }
}

// Separators YouTube titles use between the bout and the event name.
const SEGMENT_SPLIT = /\s*[|–—]\s*|\s+-\s+/;

// Trailing noise inside a name: country codes, seed numbers, weapon tags.
const NAME_NOISE = /\((?:[A-Za-z]{2,3}|[^)]{0,12})\)|\[[^\]]*\]|#\d+/g;

function cleanName(raw) {
    if (!raw) return '';
    let s = String(raw)
        .replace(NAME_NOISE, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        // strip dangling punctuation left behind by the split
        .replace(/^[\s,:;.\-–—]+|[\s,:;.\-–—]+$/g, '');
    // Drop an obvious event prefix that survived ("Final ", "T64 ", "Pool 3 ")
    s = s.replace(/^(?:final|semi[- ]?final|semi|quarter[- ]?final|t\d+|pool\s*\d*|round\s*\d*|de)\b[\s:.\-]*/i, '');
    return s.trim();
}

/**
 * Pull the two fencers out of a bout title.
 *
 * Handles the shapes federations and channels actually publish, e.g.
 *   "GEROLDI Tommaso (ITA) vs BRUNETTI Filippo (ITA) | Foil World Cup"
 *   "Men's Foil Final - GAROZZO (ITA) v CHEUNG (HKG)"
 *   "T. LEFORT vs D. GAROZZO"
 *
 * Matching is case-insensitive throughout; the returned names keep whatever
 * casing the source used, since "WANG sicheng" is how it should display.
 * Returns { a, b, competition } with empty strings when nothing parses.
 */
export function parseFencers(title) {
    const empty = { a: '', b: '', competition: '' };
    if (!title) return empty;
    const s = String(title);

    // " vs ", " vs. ", " v ", " v. ", " versus " — case-insensitive.
    const vs = s.match(/^(.*?)\s+(?:vs?\.?|versus)\s+(.*)$/i);
    if (!vs) return { ...empty, competition: s.trim() };

    let left = vs[1];
    let right = vs[2];

    // The fencer sits closest to the "vs": last segment on the left, first on
    // the right. Everything else is event/competition context.
    const leftParts = left.split(SEGMENT_SPLIT).filter((p) => p.trim());
    const rightParts = right.split(SEGMENT_SPLIT).filter((p) => p.trim());

    const a = cleanName(leftParts.length ? leftParts[leftParts.length - 1] : left);
    const b = cleanName(rightParts.length ? rightParts[0] : right);

    const context = []
        .concat(leftParts.slice(0, -1), rightParts.slice(1))
        .map((p) => p.trim())
        .filter(Boolean)
        .join(' | ');

    return { a, b, competition: context };
}
