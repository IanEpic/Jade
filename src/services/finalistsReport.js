// services/finalistsReport.js
// "Finalists" report data: national finalists grouped by category type (alpha-sorted, de-duped
// on finalist text), and a single list of STATE finalists (excluding any national finalist),
// with the trailing state in each finalist text replaced by the state(s) they're a finalist in.

import { getPool } from '../config/database.js';
import { STATES } from './eventStates.js';

// Strip the trailing run of state codes from a finalist text and append the given state(s).
// e.g. "Ford F-150 … 2024, We Are Phoenix, NSW, VIC, QLD" + "VIC, QLD"
//   →  "Ford F-150 … 2024, We Are Phoenix, VIC, QLD"
export function replaceTrailingState(text, sf) {
    const parts = String(text || '').split(',').map(s => s.trim()).filter(Boolean);
    while (parts.length && STATES.includes(parts[parts.length - 1].toUpperCase())) parts.pop();
    const base = parts.join(', ');
    return sf ? `${base}, ${sf}` : base;
}

// Flag likely-the-same-event-written-differently within an ALPHA-SORTED list: adjacent entries
// that share a long common prefix. A review aid — false positives (e.g. one entrant with two
// genuinely different entries) are expected, so it only flags, never removes.
function markNearDupes(sorted, prefixLen = 18) {
    const dup = new Array(sorted.length).fill(false);
    for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1].toLowerCase(), b = sorted[i].toLowerCase();
        let n = 0;
        while (n < a.length && n < b.length && a[n] === b[n]) n++;
        if (n >= prefixLen) { dup[i] = true; dup[i - 1] = true; }
    }
    return sorted.map((text, i) => ({ text, dup: dup[i] }));
}

export async function getFinalistsReport(programId) {
    const pool = await getPool();

    // National finalists, grouped by category type.
    const natRows = (await pool.request().query(`
        SELECT ct.name AS typename, ct.orda AS typeorda, e.finalisttext AS ft
        FROM Entry e
        JOIN Category c ON c.categoryid = e.categoryid
        JOIN CategoryType ct ON ct.categorytypeid = c.categorytypeid
        WHERE e.programid = ${programId} AND e.deleted = 0 AND ISNULL(e.finalist,0) = 1
          AND e.finalisttext IS NOT NULL AND LEN(e.finalisttext) > 0
    `)).recordset;

    const groups = new Map();   // typename -> { typename, orda, set }
    for (const r of natRows) {
        if (!groups.has(r.typename)) groups.set(r.typename, { typename: r.typename, orda: r.typeorda, set: new Set() });
        groups.get(r.typename).set.add(r.ft.trim());
    }
    const nationalGroups = [...groups.values()]
        .sort((a, b) => (a.orda - b.orda) || a.typename.localeCompare(b.typename))
        .map(g => ({ typename: g.typename, finalists: markNearDupes([...g.set].sort((a, b) => a.localeCompare(b))) }));

    // State finalists (not national finalists), trailing state replaced, de-duped + alpha sorted.
    const stRows = (await pool.request().query(`
        SELECT e.statefinalist AS sf, e.finalisttext AS ft
        FROM Entry e
        WHERE e.programid = ${programId} AND e.deleted = 0
          AND e.statefinalist IS NOT NULL AND ISNULL(e.finalist,0) = 0
          AND e.finalisttext IS NOT NULL AND LEN(e.finalisttext) > 0
    `)).recordset;
    const stateSet = new Set(stRows.map(r => replaceTrailingState(r.ft, r.sf)));
    const stateFinalists = markNearDupes([...stateSet].sort((a, b) => a.localeCompare(b)));

    return { nationalGroups, stateFinalists };
}
