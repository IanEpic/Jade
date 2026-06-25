// services/eventStates.js
// Resolves the Australian state(s)/territory an entry's event ran in, for Entry.eventstates.
// Primary source is the structured "In which states or territories did the event take place?"
// checkbox (exact, free). Falls back to AI inference from the free-text responses, and
// finally to "UNKNOWN" for an admin to resolve.
//
// Result: "NSW, VIC" (stable order) / "NATIONAL" (4+ states) / "UNKNOWN".

import { getPool, sql } from '../config/database.js';

export const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'NT', 'ACT'];

// Map a label (state code or full name) to its code, or null if it isn't a state.
const STATE_ALIASES = {
    'NEW SOUTH WALES': 'NSW', 'VICTORIA': 'VIC', 'QUEENSLAND': 'QLD',
    'WESTERN AUSTRALIA': 'WA', 'SOUTH AUSTRALIA': 'SA', 'TASMANIA': 'TAS',
    'NORTHERN TERRITORY': 'NT', 'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
};
function toStateCode(label) {
    const u = String(label || '').toUpperCase().replace(/[().]/g, '').trim();
    if (STATES.includes(u)) return u;
    return STATE_ALIASES[u] || null;
}

// Decode the structured state checkbox for an entry -> ['NSW','VIC',...] (or []).
// Identifies the state question by its OPTIONS being states (text-independent, so it
// survives the question being re-worded), and understands full state names too.
export async function getCheckboxStates(entryId) {
    const pool = await getPool();
    // All of the entry's checkbox answers, with the question's full option list.
    const rows = (await pool.request().input('e', sql.Int, entryId).query(`
        SELECT r.questionid, r.value
        FROM Response r JOIN Question q ON q.questionid = r.questionid
        WHERE r.entryid = @e AND r.deleted = 0 AND q.inputtype = 'checkbox'
          AND r.value IS NOT NULL AND LEN(r.value) > 0
    `)).recordset;
    if (!rows.length) return [];

    const qIds = [...new Set(rows.map(r => r.questionid))];
    const optRows = (await pool.request().query(
        `SELECT inputoptionid, questionid, name FROM InputOption WHERE questionid IN (${qIds.join(',')}) AND deleted = 0`)).recordset;
    const optName  = new Map(optRows.map(o => [String(o.inputoptionid), o.name]));
    // A question is a "state question" when most of its options are states (≥60%),
    // so an unrelated checkbox that happens to contain one state-like label won't match.
    const byQ = {};
    for (const o of optRows) (byQ[o.questionid] = byQ[o.questionid] || []).push(o.name);
    const stateQ = new Set(qIds.filter(q => {
        const names = byQ[q] || [];
        const hits  = names.filter(n => toStateCode(n)).length;
        return names.length >= 2 && hits / names.length >= 0.6;
    }));

    const codes = [];
    for (const r of rows) {
        if (!stateQ.has(r.questionid)) continue;
        for (const tok of String(r.value).split(/[~,;]+/)) {
            const code = toStateCode(optName.get(tok.trim()));
            if (code) codes.push(code);
        }
    }
    return [...new Set(codes)];
}

// Resolve to the stored eventstates string from the structured state checkbox.
// Returns 'UNKNOWN' when the entrant didn't tick any state (in practice only happens on
// incomplete/unaccepted entries, which the State-Finalist tool excludes anyway).
export async function resolveEventStates({ entryId }) {
    const codes = await getCheckboxStates(entryId);
    if (codes.length >= 4) return 'NATIONAL';
    if (codes.length) return STATES.filter(c => codes.includes(c)).join(', ');
    return 'UNKNOWN';
}

// Parse a stored eventstates string back into a code array ([] for NATIONAL/UNKNOWN/null).
export function parseEventStates(eventstates) {
    if (!eventstates || /NATIONAL|UNKNOWN/i.test(eventstates)) return [];
    return eventstates.split(/[,;]+/).map(s => s.trim().toUpperCase()).filter(s => STATES.includes(s));
}

export function isNational(eventstates) {
    return /NATIONAL/i.test(eventstates || '');
}
