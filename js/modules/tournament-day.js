// Tournament Day Mode — fast bout entry at a real competition.
//
// Workflow:
//   1. Pick the tournament from the Tournaments page → tap "Start Day"
//   2. Set up your pool: enter 5-7 fencers (by hand, FTL paste, or — future — Worker live-fetch)
//   3. Each cell in the pool grid is one bout — tap to log score (5-3, V or D)
//   4. App auto-totals V / TS-TR / indicator for your row
//   5. After pool, "+ Add DE round" lets you log DE bouts as they happen
//
// Each saved bout writes to the existing `bouts` table with a JSON blob in
// `notes` carrying { tournament_id, pool_num, pool_pos, de_round } so the
// dashboard / coach / weak-spot panel keeps working unchanged.

import { el, todayISO, fmtDate, fmtDateLong, toast } from '../lib/util.js';
import { activeProfile } from '../lib/state.js';
import {
    listTournaments, listBouts, listOpponents,
    findOrCreateOpponent
} from '../lib/db.js';
import { safeWrite } from '../lib/offline.js';
import { getIntel } from '../lib/fencer-intel.js';
import { parseFtlText, normalizeName } from '../lib/ftl-parser.js';

export async function mountTournamentDay(root, params) {
    const profile = activeProfile();
    if (!profile) return root.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));

    const tournaments = await listTournaments();
    const tournament = tournaments.find(t => t.id === params.id) || tournaments[0];
    if (!tournament) {
        root.appendChild(el('div', { class: 'empty', style: { padding: '40px var(--gut)' } }, [
            el('p', {}, ['No tournament selected.']),
            el('a', { href: '#tournaments', class: 'btn btn-primary' }, ['Back to Tournaments'])
        ]));
        return;
    }

    // Header
    root.appendChild(el('div', { style: { padding: '40px var(--gut) 8px' } }, [
        el('h1', { class: 'page-eyebrow' }, ['Tournament Day']),
        el('div', { class: 'today-sub' }, [
            el('span', {}, [profile.name.toUpperCase()]),
            el('span', {}, [tournament.name.toUpperCase()])
        ]),
        el('p', { style: { fontFamily: 'var(--eg-mono,monospace)', fontSize: '11px', color: 'var(--ink-mute)', marginTop: '4px' } }, [
            fmtDateLong(tournament.start_date),
            tournament.location ? ` · ${tournament.location}` : ''
        ])
    ]));

    // === Local state held in memory (saved on each bout) ============
    // pool = { fencers: [{name, club, rating, ratingYear, archetypes, intel}],
    //          myIndex: 0,
    //          bouts: { "i-j": {meScore, themScore, V|D, savedId} } }
    let pool = loadPoolFromCache(tournament.id) || newPool();
    const mountPoint = el('div', {});
    root.appendChild(mountPoint);

    render();

    function render() {
        mountPoint.innerHTML = '';
        renderActions(mountPoint);
        if (pool.fencers.length === 0) renderPoolSetup(mountPoint);
        else renderPoolGrid(mountPoint);
        renderDESection(mountPoint);
    }

    function renderActions(parent) {
        parent.appendChild(el('div', { class: 'td-actions' }, [
            el('button', {
                class: 'btn btn-ghost btn-sm',
                onclick: () => {
                    if (!confirm('Reset this pool? Your saved bouts stay in BOUTS.')) return;
                    pool = newPool();
                    savePoolToCache(tournament.id, pool);
                    render();
                }
            }, ['Reset pool']),
            el('button', {
                class: 'btn btn-ghost btn-sm',
                onclick: openPasteModal
            }, ['📋 Paste from FTL']),
            el('button', {
                class: 'btn btn-primary btn-sm',
                disabled: true,
                title: 'Cloudflare Worker not configured yet',
                onclick: () => toast('Live FTL fetch — set up the Worker (see TOURNAMENT_DAY_WORKER.md) to enable.', 'info')
            }, ['🔴 Get live data'])
        ]));
    }

    function renderPoolSetup(parent) {
        parent.appendChild(el('div', { class: 'td-section' }, [
            el('h2', { class: 'td-h2' }, ['Set up your pool']),
            el('p', { class: 'td-help' }, [
                'Enter 4–7 fencers in your pool, including yourself. The first fencer is treated as ',
                el('strong', {}, [profile.name]),
                ' — your row stays at the top.'
            ])
        ]));

        // Fencer entry inputs
        const inputArea = el('div', { class: 'td-input-area' });
        const fencerInputs = [];

        function addFencerRow(prefill = {}) {
            const i = fencerInputs.length;
            const isMe = i === 0;
            const nameInput = el('input', {
                type: 'text', class: 'td-input td-input-name',
                placeholder: isMe ? `${profile.name} (you)` : 'Fencer name',
                value: isMe ? profile.name : (prefill.name || '')
            });
            if (isMe) nameInput.disabled = true;
            const clubInput = el('input', {
                type: 'text', class: 'td-input td-input-club',
                placeholder: 'Club', value: prefill.club || ''
            });
            const ratingInput = el('input', {
                type: 'text', class: 'td-input td-input-rating',
                placeholder: 'A26', value: prefill.rating || '', maxlength: 4,
                style: { textTransform: 'uppercase', width: '64px' }
            });
            const row = el('div', { class: 'td-fencer-row' }, [
                el('span', { class: 'td-pos' }, [String(i + 1)]),
                nameInput, clubInput, ratingInput,
                i > 0 ? el('button', {
                    type: 'button', class: 'td-rm',
                    onclick: () => {
                        const idx = fencerInputs.indexOf(group);
                        fencerInputs.splice(idx, 1);
                        row.remove();
                        renumberRows();
                    }
                }, ['×']) : null
            ].filter(Boolean));
            const group = { name: nameInput, club: clubInput, rating: ratingInput, row };
            fencerInputs.push(group);
            inputArea.appendChild(row);
        }

        function renumberRows() {
            fencerInputs.forEach((g, idx) => {
                const pos = g.row.querySelector('.td-pos');
                if (pos) pos.textContent = String(idx + 1);
            });
        }

        // Start with profile + 4 empties
        addFencerRow();
        for (let i = 0; i < 4; i++) addFencerRow();
        parent.appendChild(inputArea);

        parent.appendChild(el('div', { class: 'td-input-actions' }, [
            el('button', {
                type: 'button', class: 'btn btn-ghost btn-sm',
                onclick: () => addFencerRow()
            }, ['+ Add fencer']),
            el('button', {
                type: 'button', class: 'btn btn-primary',
                onclick: async () => {
                    const fencers = [];
                    for (const g of fencerInputs) {
                        const name = g.name.value.trim();
                        if (!name) continue;
                        fencers.push({
                            name,
                            club: g.club.value.trim() || null,
                            rating: g.rating.value.trim().toUpperCase() || null,
                            archetypes: [],
                            intel: null
                        });
                    }
                    if (fencers.length < 3) {
                        toast('Need at least 3 fencers in the pool', 'error');
                        return;
                    }
                    // Resolve intel + existing opponent IDs
                    await Promise.all(fencers.map(async (f, i) => {
                        if (i === 0) return;
                        try {
                            const intel = await getIntel(f.name);
                            if (intel) { f.intel = { headline: intel.headline, club: intel.club, rating_year: intel.strength_year?.current }; }
                        } catch {}
                    }));
                    pool = { fencers, myIndex: 0, bouts: {}, des: [] };
                    savePoolToCache(tournament.id, pool);
                    render();
                }
            }, ['Start pool →'])
        ]));
    }

    function renderPoolGrid(parent) {
        const n = pool.fencers.length;

        parent.appendChild(el('div', { class: 'td-section' }, [
            el('div', { class: 'td-section-head' }, [
                el('h2', { class: 'td-h2' }, ['Pool']),
                el('span', { class: 'td-section-meta' }, [`${n} fencers · ${myStats().bouts}/${n - 1} bouts logged`])
            ])
        ]));

        // Build the table
        const table = el('table', { class: 'td-grid' });
        const thead = el('thead');
        const headRow = el('tr', {}, [
            el('th', { class: 'td-h-corner' }, ['']),
            ...pool.fencers.map((_, i) => el('th', { class: 'td-h-col' }, [String(i + 1)])),
            el('th', { class: 'td-h-stat' }, ['V']),
            el('th', { class: 'td-h-stat' }, ['TS']),
            el('th', { class: 'td-h-stat' }, ['TR']),
            el('th', { class: 'td-h-stat' }, ['+/−'])
        ]);
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = el('tbody');
        for (let i = 0; i < n; i++) {
            const f = pool.fencers[i];
            const isMe = i === pool.myIndex;
            const tr = el('tr', { class: isMe ? 'td-row-me' : 'td-row' });
            tr.appendChild(el('th', { class: 'td-h-row' }, [
                el('span', { class: 'td-row-pos' }, [String(i + 1)]),
                el('span', { class: 'td-row-name' }, [f.name + (isMe ? ' (you)' : '')]),
                f.club ? el('span', { class: 'td-row-club' }, [f.club]) : null,
                f.rating ? el('span', { class: 'td-row-rating' }, [f.rating]) : null,
                f.intel?.headline ? el('span', { class: 'td-row-intel' }, [f.intel.headline]) : null
            ].filter(Boolean)));
            for (let j = 0; j < n; j++) {
                tr.appendChild(buildCell(i, j));
            }
            const s = rowStats(i);
            tr.appendChild(el('td', { class: 'td-stat-cell' }, [String(s.V)]));
            tr.appendChild(el('td', { class: 'td-stat-cell' }, [String(s.TS)]));
            tr.appendChild(el('td', { class: 'td-stat-cell' }, [String(s.TR)]));
            tr.appendChild(el('td', { class: 'td-stat-cell td-stat-ind' + (s.IND >= 0 ? ' pos' : ' neg') }, [(s.IND >= 0 ? '+' : '') + s.IND]));
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        parent.appendChild(table);
    }

    function buildCell(i, j) {
        if (i === j) return el('td', { class: 'td-cell-diag' }, ['—']);
        const isMine = i === pool.myIndex || j === pool.myIndex;
        const key = boutKey(i, j);
        const b = pool.bouts[key];
        let label = '·';
        let cls = 'td-cell';
        if (b) {
            // Show my score in my-row cells
            if (i === pool.myIndex) label = b.iWon ? `V${b.theirScore}` : `D${b.theirScore}`;
            else if (j === pool.myIndex) label = b.iWon ? `D${b.theirScore}` : `V${b.iScore}`;
            else label = `${b.iScore}-${b.theirScore}`;
            cls += b.iWon ? (i === pool.myIndex ? ' win' : ' loss') : (i === pool.myIndex ? ' loss' : ' win');
        }
        return el('td', {
            class: cls + (isMine ? ' td-cell-mine' : ''),
            onclick: () => openScoreModal(i, j)
        }, [label]);
    }

    function openScoreModal(i, j) {
        if (i === j) return;
        const isMyRow = i === pool.myIndex || j === pool.myIndex;
        const me = pool.fencers[pool.myIndex];
        const oppIdx = i === pool.myIndex ? j : (j === pool.myIndex ? i : -1);
        const otherA = pool.fencers[i];
        const otherB = pool.fencers[j];
        const existing = pool.bouts[boutKey(i, j)];

        const sheet = el('div', { class: 'td-sheet-bg', onclick: (e) => { if (e.target.classList.contains('td-sheet-bg')) close(); } });
        const sheetInner = el('div', { class: 'td-sheet' });
        const myScore = el('input', { type: 'number', class: 'td-score-input', value: existing?.iScore ?? 5, min: 0, max: 5 });
        const themScore = el('input', { type: 'number', class: 'td-score-input', value: existing?.theirScore ?? 0, min: 0, max: 5 });
        const iWon = { val: existing?.iWon ?? null };

        function updateResultUI() {
            const a = Number(myScore.value) || 0, b = Number(themScore.value) || 0;
            if (iWon.val === null) iWon.val = a > b;
            sheetInner.querySelector('.td-vd-v').classList.toggle('on', iWon.val === true);
            sheetInner.querySelector('.td-vd-d').classList.toggle('on', iWon.val === false);
        }

        sheetInner.appendChild(el('div', { class: 'td-sheet-head' }, [
            el('span', { class: 'td-sheet-eye' }, [isMyRow ? 'YOUR BOUT' : 'POOL BOUT']),
            el('button', { type: 'button', class: 'td-sheet-x', onclick: close }, ['×'])
        ]));
        sheetInner.appendChild(el('div', { class: 'td-sheet-pair' }, [
            el('div', { class: 'td-sheet-fencer' }, [
                el('div', { class: 'td-sheet-fencer-name' }, [(i === pool.myIndex ? me.name + ' (you)' : otherA.name)]),
                el('div', { class: 'td-sheet-fencer-meta' }, [(i === pool.myIndex ? '' : otherA.club || '') + (otherA.rating ? ' · ' + otherA.rating : '')]),
                myScore
            ]),
            el('div', { class: 'td-sheet-vs' }, ['VS']),
            el('div', { class: 'td-sheet-fencer' }, [
                el('div', { class: 'td-sheet-fencer-name' }, [(j === pool.myIndex ? me.name + ' (you)' : otherB.name)]),
                el('div', { class: 'td-sheet-fencer-meta' }, [(j === pool.myIndex ? '' : otherB.club || '') + (otherB.rating ? ' · ' + otherB.rating : '')]),
                themScore
            ])
        ]));
        sheetInner.appendChild(el('div', { class: 'td-vd-row' }, [
            el('button', { type: 'button', class: 'td-vd td-vd-v', onclick: () => { iWon.val = true; updateResultUI(); } }, ['V — ' + (i === pool.myIndex ? me.name : otherA.name) + ' wins']),
            el('button', { type: 'button', class: 'td-vd td-vd-d', onclick: () => { iWon.val = false; updateResultUI(); } }, ['D — ' + (j === pool.myIndex ? me.name : otherB.name) + ' wins'])
        ]));
        sheetInner.appendChild(el('div', { class: 'td-sheet-actions' }, [
            existing ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { delete pool.bouts[boutKey(i,j)]; savePoolToCache(tournament.id, pool); close(); render(); } }, ['Delete']) : null,
            el('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
                const a = Number(myScore.value) || 0, b = Number(themScore.value) || 0;
                if (iWon.val === null) iWon.val = a > b;
                const bout = { iScore: a, theirScore: b, iWon: iWon.val };
                pool.bouts[boutKey(i, j)] = bout;
                savePoolToCache(tournament.id, pool);
                // If this is MY bout, save to bouts table
                if (i === pool.myIndex || j === pool.myIndex) {
                    const oppF = pool.fencers[i === pool.myIndex ? j : i];
                    const myScoreFor = i === pool.myIndex ? a : b;
                    const oppScoreFor = i === pool.myIndex ? b : a;
                    const won = (i === pool.myIndex) ? iWon.val : !iWon.val;
                    try {
                        await saveBout({
                            tournament, profile, oppF,
                            myScore: myScoreFor, oppScore: oppScoreFor,
                            won,
                            poolNum: 1,
                            poolPos: i === pool.myIndex ? j + 1 : i + 1
                        });
                        toast(`Saved: ${won ? 'V' : 'D'} ${myScoreFor}-${oppScoreFor} vs ${oppF.name}`);
                    } catch (e) {
                        console.warn('saveBout fail', e);
                        toast('Saved locally — will sync', 'info');
                    }
                }
                close();
                render();
            } }, ['Save bout'])
        ].filter(Boolean)));

        sheet.appendChild(sheetInner);
        document.body.appendChild(sheet);
        updateResultUI();
        function close() { sheet.remove(); }
    }

    function renderDESection(parent) {
        if (pool.fencers.length === 0) return;
        parent.appendChild(el('div', { class: 'td-section', style: { marginTop: '24px' } }, [
            el('div', { class: 'td-section-head' }, [
                el('h2', { class: 'td-h2' }, ['Direct Elimination']),
                el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: addDE }, ['+ Add DE bout'])
            ])
        ]));
        if (!pool.des || !pool.des.length) {
            parent.appendChild(el('p', { class: 'td-help' }, ['No DE bouts yet. After pools, tap "+ Add DE bout" for each round.']));
            return;
        }
        for (const de of pool.des) {
            const card = el('div', { class: 'td-de-card' }, [
                el('div', { class: 'td-de-round' }, [`Round of ${de.round}`]),
                el('div', { class: 'td-de-pair' }, [
                    el('strong', {}, [profile.name]),
                    el('span', { class: 'td-de-score' }, [`${de.myScore}-${de.theirScore}`]),
                    el('strong', {}, [de.oppName])
                ]),
                el('div', { class: 'td-de-result' + (de.won ? ' win' : ' loss') }, [de.won ? 'VICTORY' : 'DEFEAT']),
                de.oppClub ? el('div', { class: 'td-de-meta' }, [de.oppClub + (de.oppRating ? ' · ' + de.oppRating : '')]) : null
            ].filter(Boolean));
            parent.appendChild(card);
        }
    }

    function addDE() {
        const round = prompt('Round of? (32 / 16 / 8 / 4 / 2)', '32');
        if (!round) return;
        const oppName = prompt('Opponent name?');
        if (!oppName) return;
        const score = prompt('Score? (e.g. 15-12)');
        if (!score || !score.includes('-')) return;
        const [a, b] = score.split('-').map(s => Number(s.trim()) || 0);
        const won = confirm(`V or D?\n\nOK = V (${a}-${b})\nCancel = D`);
        const my = won ? Math.max(a, b) : Math.min(a, b);
        const them = won ? Math.min(a, b) : Math.max(a, b);
        pool.des = pool.des || [];
        pool.des.push({ round: Number(round), oppName, myScore: my, theirScore: them, won });
        savePoolToCache(tournament.id, pool);
        saveBout({
            tournament, profile,
            oppF: { name: oppName, club: null, rating: null },
            myScore: my, oppScore: them, won,
            deRound: Number(round)
        }).then(() => toast('DE saved')).catch((e) => console.warn(e));
        render();
    }

    // === Helpers ===========================================================
    function newPool() { return { fencers: [], myIndex: 0, bouts: {}, des: [] }; }
    function boutKey(i, j) { return i < j ? `${i}-${j}` : `${j}-${i}`; }

    function rowStats(i) {
        let V = 0, TS = 0, TR = 0;
        for (let j = 0; j < pool.fencers.length; j++) {
            if (i === j) continue;
            const b = pool.bouts[boutKey(i, j)];
            if (!b) continue;
            const myScoreInThisCell = (i < j) ? b.iScore : b.theirScore;
            const themScoreInThisCell = (i < j) ? b.theirScore : b.iScore;
            const iWonThisRow = (i < j) ? b.iWon : !b.iWon;
            if (iWonThisRow) V++;
            TS += myScoreInThisCell;
            TR += themScoreInThisCell;
        }
        return { V, TS, TR, IND: TS - TR };
    }
    function myStats() {
        const me = rowStats(pool.myIndex);
        const n = pool.fencers.length;
        let bouts = 0;
        for (let j = 0; j < n; j++) if (j !== pool.myIndex && pool.bouts[boutKey(pool.myIndex, j)]) bouts++;
        return { ...me, bouts };
    }

    function openPasteModal() {
        const sheet = el('div', { class: 'td-sheet-bg', onclick: (e) => { if (e.target.classList.contains('td-sheet-bg')) close(); } });
        const sheetInner = el('div', { class: 'td-sheet td-paste-sheet' });
        const textarea = el('textarea', {
            class: 'td-paste-textarea',
            rows: 12,
            placeholder: 'Paste here…\n\n• On iPhone Safari: long-press the FTL pool details page → Select All → Copy → tap into this box → Paste.\n• Works whether you paste 1 pool or all 10 — I\'ll auto-detect which pool you\'re in.\n• Don\'t worry about scores, referees, Bout Order — the parser strips them.',
            autofocus: true
        });
        const previewArea = el('div', { class: 'td-paste-preview' });
        let selectedPoolIdx = 0;
        let userPickedPool = false;  // becomes true once user manually taps a pool card
        let lastParsed = null;

        // Case-insensitive: find which pool contains the active fencer by lastname token
        function findUserPoolIdx(pools) {
            if (!pools || !pools.length) return -1;
            const me = normalizeName(profile.name);
            const meTokens = me.split(' ').filter(Boolean);
            if (!meTokens.length) return -1;
            for (let i = 0; i < pools.length; i++) {
                for (const f of pools[i].fencers) {
                    const fNorm = normalizeName(f.name);
                    if (meTokens.some(t => t.length >= 3 && fNorm.includes(t))) return i;
                }
            }
            return -1;
        }

        function refreshPreview() {
            const parsed = parseFtlText(textarea.value);
            lastParsed = parsed;
            previewArea.innerHTML = '';

            // Multi-pool: render pool cards as picker
            if (parsed.pools && parsed.pools.length > 1) {
                // Auto-select the user's pool — unless the user already picked one
                const autoIdx = findUserPoolIdx(parsed.pools);
                if (!userPickedPool && autoIdx >= 0) selectedPoolIdx = autoIdx;

                const headBits = [`Detected ${parsed.pools.length} pools.`];
                if (autoIdx >= 0) headBits.push(`✓ Found ${profile.name} in Pool #${parsed.pools[autoIdx].number} — pre-selected.`);
                else headBits.push("Couldn't find your name — tap the right pool below.");
                previewArea.appendChild(el('div', { class: 'td-paste-count' }, [headBits.join(' ')]));

                for (let i = 0; i < parsed.pools.length; i++) {
                    const p = parsed.pools[i];
                    const card = el('button', {
                        type: 'button',
                        class: 'td-paste-pool-card' + (i === selectedPoolIdx ? ' selected' : '') + (i === autoIdx ? ' auto' : ''),
                        onclick: () => { selectedPoolIdx = i; userPickedPool = true; refreshPreview(); }
                    }, [
                        el('div', { class: 'td-paste-pool-head' }, [
                            el('span', { class: 'td-paste-pool-num' }, [`POOL #${p.number}`]),
                            p.strip ? el('span', { class: 'td-paste-pool-strip' }, [`Strip ${p.strip}`]) : null,
                            i === autoIdx ? el('span', { class: 'td-paste-pool-auto' }, ['★ YOU']) : null,
                            el('span', { class: 'td-paste-pool-count' }, [`${p.fencers.length} fencers`])
                        ].filter(Boolean)),
                        el('div', { class: 'td-paste-pool-roster' }, p.fencers.slice(0, 4).map(f =>
                            el('span', { class: 'td-paste-pool-name' }, [f.name])
                        ).concat(p.fencers.length > 4 ? [el('span', { class: 'td-paste-pool-more' }, [`+${p.fencers.length - 4} more`])] : []))
                    ]);
                    previewArea.appendChild(card);
                }
                return;
            }

            // Single pool OR flat fencer list
            const fencers = (parsed.pools && parsed.pools[0]) ? parsed.pools[0].fencers : parsed.fencers;
            if (!fencers || !fencers.length) {
                previewArea.appendChild(el('p', { class: 'td-paste-empty' }, ['No fencers detected yet. Paste pool text above.']));
                return;
            }
            previewArea.appendChild(el('div', { class: 'td-paste-count' }, [
                parsed.pools && parsed.pools[0]
                    ? `Pool #${parsed.pools[0].number} — ${fencers.length} fencers:`
                    : `Detected ${fencers.length} fencer${fencers.length === 1 ? '' : 's'}:`
            ]));
            for (const f of fencers.slice(0, 12)) {
                previewArea.appendChild(el('div', { class: 'td-paste-row' }, [
                    el('span', { class: 'td-paste-name' }, [f.name]),
                    f.club ? el('span', { class: 'td-paste-club' }, [f.club]) : null,
                    f.rating ? el('span', { class: 'td-paste-rating' }, [f.rating]) : null
                ].filter(Boolean)));
            }
            if (fencers.length > 12) {
                previewArea.appendChild(el('p', { class: 'td-paste-more' }, [`+ ${fencers.length - 12} more`]));
            }
        }

        function loadPool(fencers) {
            if (!fencers || fencers.length < 3) {
                toast('Need at least 3 fencers — try copying more of the page', 'error');
                return false;
            }
            // Inject "me" at top if not there — case-INSENSITIVE matching per CLAUDE.md #7
            const meNorm = normalizeName(profile.name);
            const meLastTokens = meNorm.split(' ').filter(Boolean);
            const meLastName = meLastTokens[meLastTokens.length - 1] || meLastTokens[0] || '';
            const meFirstName = meLastTokens[0] || '';
            const fencersOut = fencers.map(f => ({
                name: f.name,
                club: f.club,
                rating: f.rating || null,
                archetypes: [],
                intel: null
            }));
            const meAt = fencersOut.findIndex(f => {
                const fNorm = normalizeName(f.name);
                // Match if any token of the user's name appears in the candidate's normalized form
                return (meLastName && fNorm.includes(meLastName)) ||
                       (meFirstName && fNorm.includes(meFirstName));
            });
            if (meAt > 0) {
                const me = fencersOut.splice(meAt, 1)[0];
                fencersOut.unshift(me);
            } else if (meAt < 0) {
                fencersOut.unshift({ name: profile.name, club: null, rating: null, archetypes: [], intel: null });
            }
            pool = { fencers: fencersOut, myIndex: 0, bouts: {}, des: [] };
            savePoolToCache(tournament.id, pool);
            toast(`Loaded ${fencersOut.length} fencers — pool ready`);
            return true;
        }

        textarea.addEventListener('input', refreshPreview);

        sheetInner.appendChild(el('div', { class: 'td-sheet-head' }, [
            el('span', { class: 'td-sheet-eye' }, ['📋 PASTE FROM FTL']),
            el('button', { type: 'button', class: 'td-sheet-x', onclick: close }, ['×'])
        ]));
        sheetInner.appendChild(textarea);
        sheetInner.appendChild(previewArea);
        sheetInner.appendChild(el('div', { class: 'td-sheet-actions' }, [
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: close }, ['Cancel']),
            el('button', { type: 'button', class: 'btn btn-primary', onclick: () => {
                if (!lastParsed) return;
                let fencers;
                if (lastParsed.pools && lastParsed.pools.length > 1) {
                    fencers = lastParsed.pools[selectedPoolIdx]?.fencers || [];
                } else if (lastParsed.pools && lastParsed.pools.length === 1) {
                    fencers = lastParsed.pools[0].fencers;
                } else {
                    fencers = lastParsed.fencers || [];
                }
                if (loadPool(fencers)) { close(); render(); }
            } }, ['Load this pool →'])
        ]));
        sheet.appendChild(sheetInner);
        document.body.appendChild(sheet);
        setTimeout(() => textarea.focus(), 50);
        refreshPreview();
        function close() { sheet.remove(); }
    }
}

// === Persistence (per-tournament localStorage cache) ======================
function poolCacheKey(tid) { return `eg-td-pool-${tid}`; }
function loadPoolFromCache(tid) {
    try { const raw = localStorage.getItem(poolCacheKey(tid)); if (raw) return JSON.parse(raw); }
    catch {}
    return null;
}
function savePoolToCache(tid, pool) {
    try { localStorage.setItem(poolCacheKey(tid), JSON.stringify(pool)); } catch {}
}

// === Save a bout into Supabase ============================================
async function saveBout({ tournament, profile, oppF, myScore, oppScore, won, poolNum, poolPos, deRound }) {
    // Find or create opponent record
    const opp = await findOrCreateOpponent({
        name: oppF.name,
        club: oppF.club || null,
        rating: oppF.rating || null
    });
    const notesMeta = JSON.stringify({
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        ...(poolNum ? { pool_num: poolNum, pool_pos: poolPos } : {}),
        ...(deRound ? { de_round: deRound } : {})
    });
    const payload = {
        profile_id: profile.id,
        opponent_id: opp.id,
        date: todayISO(),
        outcome: won ? 'win' : 'loss',
        score_for: myScore,
        score_against: oppScore,
        round: poolNum ? 'pool' : 'de',
        notes: '__TD__' + notesMeta
    };
    await safeWrite({ table: 'bouts', op: 'insert', payload });
}
