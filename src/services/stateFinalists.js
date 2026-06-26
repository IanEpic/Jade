// services/stateFinalists.js
// Computes state/territory finalists for the Best Event categories of a program.
//
// Rule (validated against 1055, 24/24): for each Best Event category and each state S,
// rank every eligible entry that ran in S — eligible = meets the minimum raw score and is
// not a national (4+ state) event — by final score; take the top 2; the NON-finalists
// among those top 2 become state finalists for S. National finalists occupy the slots, so
// a state with 2 national finalists yields 0 state finalists, 1 yields 1, 0 yields up to 2.
//
// An entry can be a state finalist in several of its states but not others. Entries whose
// states couldn't be determined (eventstates UNKNOWN/null) are returned separately so an
// admin can resolve them before writing.

import { getPool, sql } from '../config/database.js';
import { calcFinalScores } from './finalScores.js';
import { parseEventStates, isNational, getCheckboxStates, STATES, certificateText } from './eventStates.js';

async function bestEventCategoryIds(pool, programId) {
    const beType = (await pool.request().query(
        `SELECT categorytypeid FROM CategoryType WHERE programid=${programId} AND name LIKE 'Best Event' AND deleted=0`
    )).recordset[0]?.categorytypeid;
    if (!beType) return [];
    return (await pool.request().query(
        `SELECT categoryid FROM Category WHERE programid=${programId} AND categorytypeid=${beType} AND deleted=0`
    )).recordset.map(r => r.categoryid);
}

// Populate Entry.eventstates (from the structured state checkbox) for Best Event entries
// that don't have it yet. Returns { filled, national, unknown }.
export async function ensureEventStates(programId, { onlyNull = true } = {}) {
    const pool = await getPool();
    const catIds = await bestEventCategoryIds(pool, programId);
    if (!catIds.length) return { filled: 0, national: 0, unknown: 0 };
    const where = onlyNull ? "AND (eventstates IS NULL OR eventstates='')" : '';
    const ents = (await pool.request().query(
        `SELECT entryid FROM Entry WHERE programid=${programId} AND deleted=0 AND categoryid IN (${catIds.join(',')}) ${where}`
    )).recordset;
    let filled = 0, national = 0, unknown = 0;
    for (const e of ents) {
        const codes = await getCheckboxStates(e.entryid);
        let val;
        if (codes.length >= 4) { val = 'NATIONAL'; national++; }
        else if (codes.length) { val = STATES.filter(c => codes.includes(c)).join(', '); filled++; }
        else { val = 'UNKNOWN'; unknown++; }
        await pool.request().input('e', sql.Int, e.entryid).input('v', sql.NVarChar, val)
            .query('UPDATE Entry SET eventstates=@v WHERE entryid=@e');
    }
    return { filled, national, unknown };
}

export async function computeStateFinalists(programId, { minRawScore = 2.85 } = {}) {
    const pool = await getPool();

    const beType = (await pool.request().query(
        `SELECT categorytypeid FROM CategoryType WHERE programid=${programId} AND name LIKE 'Best Event' AND deleted=0`
    )).recordset[0]?.categorytypeid;
    if (!beType) return { categories: [], byEntry: new Map(), unresolved: [], minRawScore };

    const cats = (await pool.request().query(
        `SELECT categoryid, name FROM Category WHERE programid=${programId} AND categorytypeid=${beType} AND deleted=0 ORDER BY orda, categoryid`
    )).recordset;
    const catName = new Map(cats.map(c => [c.categoryid, c.name]));
    const catIds = cats.map(c => c.categoryid);
    if (!catIds.length) return { categories: [], byEntry: new Map(), unresolved: [], minRawScore };

    const ents = (await pool.request().query(`
        SELECT e.entryid, e.categoryid, e.finalist, e.eventstates, e.finalisttext,
               COALESCE(NULLIF(en.legalentity,''), en.name) AS entrant, e.userref
        FROM Entry e LEFT JOIN Entrant en ON en.entrantid = e.entrantid
        WHERE e.programid=${programId} AND e.deleted=0 AND e.categoryid IN (${catIds.join(',')})
    `)).recordset;

    const scores = await calcFinalScores(programId, { ignoreScoreReady: true });
    const sc = new Map(scores.map(r => [r.entryid, r]));

    const byCatRows = {};
    for (const e of ents) (byCatRows[e.categoryid] = byCatRows[e.categoryid] || []).push(e);

    const byEntry = new Map();          // entryid -> { entry, states:Set }
    const unresolved = [];              // viable entries with no determinable states
    const categories = [];

    for (const cid of catIds) {
        const rows = (byCatRows[cid] || []).map(e => ({
            ...e,
            fs:  sc.get(e.entryid)?.finalscore ?? null,
            raw: sc.get(e.entryid)?.rawScore ?? null,
            states:   parseEventStates(e.eventstates),
            national: isNational(e.eventstates),
        }));

        // Flag viable entries we can't place: non-finalist, meets min, has a score, but no states.
        for (const r of rows) {
            const viable = !r.finalist && r.fs !== null && r.raw !== null && r.raw >= minRawScore;
            if (viable && !r.national && r.states.length === 0) {
                unresolved.push({ entryid: r.entryid, categoryid: cid, categoryname: catName.get(cid),
                    entrant: r.entrant, userref: r.userref, eventstates: r.eventstates || null });
            }
        }

        const stateBlocks = [];
        for (const S of STATES) {
            const inS = rows
                .filter(r => r.states.includes(S) && !r.national && r.raw !== null && r.raw >= minRawScore && r.fs !== null)
                .sort((a, b) => b.fs - a.fs);
            // The top 2 contenders occupy the state's slots; national finalists among them
            // are shown (flagged) for context but are NOT state finalists.
            const top2 = inS.slice(0, 2);
            // Display gate (unchanged): only surface states that have at least one non-national
            // finalist among the top 2 — keeps the tool's output exactly as before.
            const hasNonNational = top2.some(r => !r.finalist);
            if (!hasNonNational) continue;
            stateBlocks.push({ state: S, entries: top2.map(w => ({
                entryid: w.entryid, entrant: w.entrant, userref: w.userref,
                finalisttext: w.finalisttext, finalscore: w.fs, national: !!w.finalist,
            })) });
            // ALL top-2 entries are this state's finalists — including national finalists (we
            // just don't re-list nationals separately). The highest scorer is the state winner,
            // which may itself be a national finalist.
            for (const w of top2) {
                if (!byEntry.has(w.entryid)) byEntry.set(w.entryid, { entry: w, states: new Set(), winnerStates: new Set() });
                byEntry.get(w.entryid).states.add(S);
            }
            byEntry.get(top2[0].entryid).winnerStates.add(S);
        }
        if (stateBlocks.length) categories.push({ categoryid: cid, categoryname: catName.get(cid), states: stateBlocks });
    }

    return { categories, byEntry, unresolved, minRawScore };
}

// Read the already-written state finalists straight from the DB (fast — uses the stored
// FinalScore, no raw-score recompute), grouped category → state → entries. Reconstructs
// the per-state top-2 (including the national-finalist context rows the preview shows).
export async function loadSavedStateFinalists(programId) {
    const pool = await getPool();
    const catIds = await bestEventCategoryIds(pool, programId);
    if (!catIds.length) return { categories: [], finalistCount: 0 };
    const rows = (await pool.request().query(`
        SELECT e.entryid, e.categoryid, c.name AS categoryname,
               e.finalist, e.eventstates, e.statefinalist, e.finalisttext,
               COALESCE(NULLIF(en.legalentity,''), en.name) AS entrant,
               (SELECT TOP 1 fs.finalscore FROM FinalScore fs WHERE fs.entryid = e.entryid) AS finalscore
        FROM Entry e
        JOIN Category c ON c.categoryid = e.categoryid
        LEFT JOIN Entrant en ON en.entrantid = e.entrantid
        WHERE e.programid=${programId} AND e.deleted=0 AND e.categoryid IN (${catIds.join(',')})
        ORDER BY c.orda, c.categoryid
    `)).recordset.map(r => ({
        entryid: r.entryid, categoryid: r.categoryid, categoryname: r.categoryname,
        entrant: r.entrant, finalisttext: r.finalisttext, national: !!r.finalist,
        fs: r.finalscore != null ? +r.finalscore : null,
        states:   parseEventStates(r.eventstates),
        sfStates: parseEventStates(r.statefinalist),
    }));

    const finalistCount = new Set(rows.filter(r => r.sfStates.length).map(r => r.entryid)).size;
    const byCat = {};
    for (const r of rows) (byCat[r.categoryid] = byCat[r.categoryid] || []).push(r);

    const categories = [];
    for (const cid of [...new Set(rows.map(r => r.categoryid))]) {
        const catRows = byCat[cid];
        const sfByState = {};
        for (const r of catRows) for (const S of r.sfStates) (sfByState[S] = sfByState[S] || []).push(r);
        const stateBlocks = [];
        for (const S of STATES) {
            if (!sfByState[S]) continue;                                  // only states with a finalist
            // Nationals are now flagged in statefinalist too, but include the legacy join (for
            // data written before that change) and DEDUPE by entryid so none appear twice.
            const nationalsInS = catRows.filter(r => r.national && r.states.includes(S));
            const seen = new Set();
            const top2 = [...sfByState[S], ...nationalsInS]
                .filter(r => !seen.has(r.entryid) && seen.add(r.entryid))
                .sort((a, b) => (b.fs ?? 0) - (a.fs ?? 0)).slice(0, 2);
            stateBlocks.push({ state: S, entries: top2.map(w => ({
                entryid: w.entryid, entrant: w.entrant, finalisttext: w.finalisttext,
                finalscore: w.fs, national: w.national,
            })) });
        }
        if (stateBlocks.length) categories.push({ categoryid: cid, categoryname: catRows[0].categoryname, states: stateBlocks });
    }
    return { categories, finalistCount };
}

// Persist computed state finalists: set Entry.statefinalist (comma-joined, stable order)
// for the winners and clear it on all other Best Event entries in the program.
export async function writeStateFinalists(programId, byEntry) {
    const pool = await getPool();
    const beType = (await pool.request().query(
        `SELECT categorytypeid FROM CategoryType WHERE programid=${programId} AND name LIKE 'Best Event' AND deleted=0`
    )).recordset[0]?.categorytypeid;
    if (!beType) return 0;

    // Clear existing finalist + winner flags on all Best Event entries first (so a re-run starts clean).
    await pool.request().query(`
        UPDATE e SET e.statefinalist = NULL, e.statewinner = NULL
        FROM Entry e JOIN Category c ON c.categoryid = e.categoryid
        WHERE c.programid=${programId} AND c.categorytypeid=${beType} AND c.deleted=0 AND e.deleted=0
    `);

    let written = 0;
    for (const [entryid, { states, winnerStates }] of byEntry) {
        const val = STATES.filter(s => states.has(s)).join(', ');
        if (!val) continue;
        const win = STATES.filter(s => winnerStates && winnerStates.has(s)).join(', ') || null;
        await pool.request().input('e', sql.Int, entryid).input('v', sql.NVarChar, val).input('w', sql.NVarChar, win)
            .query('UPDATE Entry SET statefinalist=@v, statewinner=@w WHERE entryid=@e');
        written++;
    }

    // Certificate text for EVERY entry in the program (national finalists/winners exist across all
    // categories; state recognition only on Best Event). Computed from the flags just written.
    const allEntries = (await pool.request().query(`
        SELECT entryid, ISNULL(finalist,0) AS finalist, ISNULL(nominated,0) AS nominated, statefinalist, statewinner
        FROM Entry WHERE programid=${programId} AND deleted=0
    `)).recordset;
    for (const e of allEntries) {
        const txt = certificateText(!!e.nominated, !!e.finalist, e.statefinalist, e.statewinner) || null;
        await pool.request().input('e', sql.Int, e.entryid).input('t', sql.NVarChar, txt)
            .query('UPDATE Entry SET certificatetext=@t WHERE entryid=@e');
    }

    return written;
}
