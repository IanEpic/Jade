// services/bestState.js
// Computes the "Best Event State or Territory" award for a program.
//
// Rules (client-supplied):
//   • Only the Best Event categories count.
//   • National Events (eventstates = NATIONAL, i.e. staged in 4+ states) are EXCLUDED.
//   • Every other Best Event entry earns points towards EACH state/territory its event
//     ran in — regardless of whether it met the nominee threshold score:
//        base                         = 1 point
//        + National Nominee (finalist) = +1  (total 2)
//        + National Winner  (nominated)= +1  (total 3)
//   • A state/territory only qualifies for the award if it has ≥ minPoints (7) points
//     AND hosted ≥ 2 National Nominees, at least one of which is a National Winner.
//   • The award goes to the qualifying state/territory with the most points per head of
//     population.
//
// This is a calculation/report — it writes nothing to the database.

import Anthropic from '@anthropic-ai/sdk';
import { getPool, sql } from '../config/database.js';
import { STATES, parseEventStates, isNational } from './eventStates.js';

// ABS estimated resident population, Dec 2025 release (per-state ERP). Editable on the page,
// and refreshable via "Regenerate from ABS" — these are only the starting defaults.
export const DEFAULT_POPULATIONS = {
    NSW: 8641100, VIC: 7121900, QLD: 5712100, WA: 3076500,
    SA: 1910600, TAS: 579100, NT: 267500, ACT: 487200,
};

async function bestEventCategoryIds(pool, programId) {
    const beType = (await pool.request().query(
        `SELECT categorytypeid FROM CategoryType WHERE programid=${programId} AND name LIKE 'Best Event' AND deleted=0`
    )).recordset[0]?.categorytypeid;
    if (!beType) return [];
    return (await pool.request().query(
        `SELECT categoryid FROM Category WHERE programid=${programId} AND categorytypeid=${beType} AND deleted=0`
    )).recordset.map(r => r.categoryid);
}

export async function computeBestState(programId, { populations = DEFAULT_POPULATIONS, minPoints = 7 } = {}) {
    const pool   = await getPool();
    const catIds = await bestEventCategoryIds(pool, programId);
    if (!catIds.length) {
        return { rows: [], winner: null, minPoints, populations, entryCount: 0, nationalCount: 0, unresolvedCount: 0 };
    }

    // Accepted Best Event entries (rule 8: all entries count, regardless of threshold score —
    // but only real, accepted entries, not abandoned/unaccepted shells).
    const ents = (await pool.request().query(`
        SELECT e.entryid, e.categoryid, c.name AS categoryname, e.eventstates,
               ISNULL(e.finalist,0) AS finalist, ISNULL(e.nominated,0) AS nominated,
               COALESCE(NULLIF(en.legalentity,''), en.name) AS entrant, e.userref
        FROM Entry e
        JOIN Category c ON c.categoryid = e.categoryid
        LEFT JOIN Entrant en ON en.entrantid = e.entrantid
        WHERE e.programid=${programId} AND e.deleted=0 AND e.entryaccepted IS NOT NULL
          AND e.categoryid IN (${catIds.join(',')})
    `)).recordset;

    const agg = {};
    for (const S of STATES) agg[S] = { points: 0, nominees: 0, winners: 0, entries: [] };

    let nationalCount = 0, unresolvedCount = 0, entryCount = 0;
    for (const e of ents) {
        if (isNational(e.eventstates)) { nationalCount++; continue; }
        const states = parseEventStates(e.eventstates);
        if (!states.length) { unresolvedCount++; continue; }
        entryCount++;
        const finalist  = !!e.finalist;
        const nominated = !!e.nominated;
        const pts = 1 + (finalist ? 1 : 0) + (nominated ? 1 : 0);
        for (const S of states) {
            const a = agg[S];
            a.points += pts;
            if (finalist)  a.nominees++;
            if (nominated) a.winners++;
            a.entries.push({
                entryid: e.entryid, entrant: e.entrant, userref: e.userref,
                categoryname: e.categoryname, finalist, nominated, points: pts,
            });
        }
    }

    const rows = STATES.map(S => {
        const a   = agg[S];
        const pop = parseFloat(populations[S]) || 0;
        const perMillion = pop > 0 ? (a.points / pop) * 1_000_000 : null;
        const reasons = [];
        if (a.points < minPoints)  reasons.push(`< ${minPoints} points`);
        if (a.nominees < 2)        reasons.push('< 2 National Nominees');
        if (a.winners < 1)         reasons.push('no National Winner');
        return {
            state: S, points: a.points, nominees: a.nominees, winners: a.winners,
            population: pop, perMillion, eligible: reasons.length === 0, reasons,
            entries: a.entries.sort((x, y) => y.points - x.points || x.entrant?.localeCompare(y.entrant)),
        };
    });

    // Rank: qualifying states by points-per-head (desc) first, then the rest.
    rows.sort((x, y) => {
        if (x.eligible !== y.eligible) return x.eligible ? -1 : 1;
        if (x.eligible) return (y.perMillion || 0) - (x.perMillion || 0);
        return y.points - x.points;
    });
    rows.forEach((r, i) => { r.rank = r.eligible ? i + 1 : null; });

    const winner = rows.find(r => r.eligible) || null;
    return { rows, winner, minPoints, populations, entryCount, nationalCount, unresolvedCount };
}

// ── Live ABS population lookup (Anthropic web search) ─────────────────────────

// Ask the model (with web search) for the latest ABS estimated resident population per
// state/territory. Returns { populations, asof, source }. Throws on missing key / bad data.
export async function fetchAbsPopulations({ attempts = 3 } = {}) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('AI is not configured (no API key).');
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try { return await fetchAbsPopulationsOnce(); }
        catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('No population data returned.');
}

async function fetchAbsPopulationsOnce() {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const resp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        system: 'You look up official statistics using web search, then report them. ' +
            'You may reason briefly, but your final message MUST end with the answer as a single ' +
            'JSON object wrapped in <json></json> tags and nothing after it.',
        messages: [{ role: 'user', content:
            'Find the most recent Australian Bureau of Statistics (ABS) "National, state and territory ' +
            'population" release and read the Estimated Resident Population (ERP) total for EACH state ' +
            'and territory from its data table. Then output the answer wrapped in <json></json> tags, ' +
            'exactly: <json>{"asof":"<release period, e.g. September 2025>","source":"<abs url>",' +
            '"populations":{"NSW":0,"VIC":0,"QLD":0,"WA":0,"SA":0,"TAS":0,"NT":0,"ACT":0}}</json>. ' +
            'Use whole-number people counts (not millions). Use the actual ERP totals from the table, ' +
            'not quarterly change components.'
        }],
    });

    const text = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    // Prefer the sentinel-wrapped JSON; fall back to the last {...} containing "populations".
    let jsonStr = (text.match(/<json>\s*([\s\S]*?)\s*<\/json>/) || [])[1];
    if (!jsonStr) {
        const cands = text.match(/\{[\s\S]*?"populations"[\s\S]*?\}\s*\}/g);
        jsonStr = cands && cands[cands.length - 1];
    }
    if (!jsonStr) throw new Error('No population data returned (try again).');
    const parsed = JSON.parse(jsonStr);

    const populations = {};
    for (const S of STATES) {
        const v = parseFloat(String(parsed.populations?.[S] ?? '').replace(/[, ]/g, ''));
        if (isNaN(v) || v <= 0) throw new Error('Incomplete population data (missing ' + S + ').');
        populations[S] = Math.round(v);
    }
    return { populations, asof: parsed.asof || null, source: parsed.source || null };
}

// ── Persistence (BestStateResult — one JSON snapshot per program) ──────────────

export async function saveBestState(programId, result, userId = null, popMeta = null) {
    const pool = await getPool();
    // Preserve a hand-generated State/Territory Award citation across recalculations.
    const existing = await loadBestState(programId);
    const snapshot = JSON.stringify({
        rows: result.rows, winner: result.winner, populations: result.populations,
        minPoints: result.minPoints, entryCount: result.entryCount,
        nationalCount: result.nationalCount, unresolvedCount: result.unresolvedCount,
        popMeta: popMeta || result.popMeta || null,
        statecitation: result.statecitation ?? existing?.snapshot?.statecitation ?? null,
    });
    await pool.request()
        .input('p', sql.Int, programId)
        .input('s', sql.NVarChar(sql.MAX), snapshot)
        .input('u', sql.Int, userId)
        .query(`
            MERGE dbo.BestStateResult AS t
            USING (SELECT @p AS programid) AS src ON t.programid = src.programid
            WHEN MATCHED THEN
                UPDATE SET snapshot = @s, computedby = @u, computedat = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN
                INSERT (programid, snapshot, computedby, computedat)
                VALUES (@p, @s, @u, SYSUTCDATETIME());
        `);
}

// Save (or clear) the State/Territory Award citation into the existing snapshot.
export async function saveStateCitation(programId, text) {
    const stored = await loadBestState(programId);
    if (!stored) return false;
    const snap = { ...stored.snapshot, statecitation: text || null };
    const pool = await getPool();
    await pool.request()
        .input('p', sql.Int, programId)
        .input('s', sql.NVarChar(sql.MAX), JSON.stringify(snap))
        .query('UPDATE dbo.BestStateResult SET snapshot = @s WHERE programid = @p');
    return true;
}

export async function loadBestState(programId) {
    const pool = await getPool();
    const row = (await pool.request().input('p', sql.Int, programId)
        .query('SELECT snapshot, computedat FROM dbo.BestStateResult WHERE programid = @p')).recordset[0];
    if (!row) return null;
    try {
        return { snapshot: JSON.parse(row.snapshot), computedat: row.computedat };
    } catch {
        return null;
    }
}
