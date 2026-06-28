// services/judgeConflict.js
// The judge conflict-of-interest policy (Program's JudgingModel.judgeconflictmodel).
// Single source of truth for the option list (admin dropdown) and the enforcement
// helpers used by the judge-edit, new-entry, allocation and final-score gates.
//
// Stored value is an INT ordered LEAST → MOST restrictive:
//   0 No management | 1 Allow + exclude own scores | 2 No judging own entry
//   3 No judging own category | 4 Judges cannot enter

export const CONFLICT_NONE        = 0; // admin does anything
export const CONFLICT_EXCLUDE     = 1; // assignable, flagged, own-entry scores dropped at calc
export const CONFLICT_OWN_ENTRY   = 2; // can't be assigned their own entry
export const CONFLICT_OWN_CATEGORY= 3; // can't judge any category they entered
export const CONFLICT_NO_ENTRY    = 4; // judge <-> entrant mutually exclusive

// Ordered least → most restrictive for the dropdown.
export const JUDGE_CONFLICT_MODELS = [
    { value: CONFLICT_NONE,         name: 'No conflict management',
      desc: 'Admins may assign judges freely — no restrictions.' },
    { value: CONFLICT_EXCLUDE,      name: 'Allow, but exclude own scores',
      desc: "Judges may be assigned their own entry (flagged in the grid); their score on their own entry is excluded when final scores are calculated." },
    { value: CONFLICT_OWN_ENTRY,    name: 'No judging own entry',
      desc: 'Judges may judge a category they entered, but cannot be assigned their own entry.' },
    { value: CONFLICT_OWN_CATEGORY, name: 'No judging own category',
      desc: 'Judges cannot judge any category in which they have an entry.' },
    { value: CONFLICT_NO_ENTRY,     name: 'Judges cannot enter',
      desc: 'A judge cannot be an entrant, and an entrant cannot be made a judge.' },
];

export function conflictModelName(value) {
    const m = JUDGE_CONFLICT_MODELS.find(m => m.value === Number(value));
    return m ? m.name : JUDGE_CONFLICT_MODELS[0].name;
}

// Resolve the active policy for a program from its JudgingModel. Returns an int (default 0).
export function policyOf(judgingModel) {
    const v = judgingModel?.judgeconflictmodel;
    return Number.isInteger(v) ? v : (v != null ? Number(v) || 0 : 0);
}

// ── DB helpers (entrant-ness of a user) ─────────────────────────────────────────
import { getPool, sql } from '../config/database.js';

// Look up a program's conflict policy directly (int, default 0).
export async function getPolicyForProgram(programId) {
    const pool = await getPool();
    const r = await pool.request().input('p', sql.Int, programId).query(`
        SELECT ISNULL(jm.judgeconflictmodel, 0) AS policy
        FROM Program p LEFT JOIN JudgingModel jm ON jm.judgingmodelid = p.judgingmodelid
        WHERE p.programid = @p`);
    return r.recordset[0]?.policy ?? 0;
}

// Does this user own any (non-deleted) entry in the program?
export async function userHasEntries(userId, programId) {
    const pool = await getPool();
    const r = await pool.request().input('u', sql.Int, userId).input('p', sql.Int, programId)
        .query(`SELECT TOP 1 1 AS x FROM Entry WHERE userid = @u AND programid = @p AND deleted = 0`);
    return r.recordset.length > 0;
}

// The set of category ids this user has an entry in (for the own-category gate).
export async function categoryIdsUserEntered(userId, programId) {
    const pool = await getPool();
    const r = await pool.request().input('u', sql.Int, userId).input('p', sql.Int, programId)
        .query(`SELECT DISTINCT categoryid FROM Entry WHERE userid = @u AND programid = @p AND deleted = 0`);
    return new Set(r.recordset.map(x => x.categoryid));
}
