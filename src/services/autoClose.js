// services/autoClose.js
// Checks all programs with a set entryclosedate. When the current time passes
// that date, sets entriesopen = false on all (non-deleted) categories for that
// program. Safe to call repeatedly — categories already closed are a no-op.
//
// entryclosedate is stored as a plain UTC string 'YYYY-MM-DD HH:MM:SS.mmm'
// (no timezone suffix) so we must compare using the same format — Sequelize's
// Op.lte would serialize new Date() with '+00:00' which SQL Server rejects.

import Program  from '../models/Program.js';
import Category from '../models/Category.js';
import { Op, literal } from 'sequelize';

function nowUtcStr() {
    return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

export async function autoCloseAllPrograms() {
    const nowStr = nowUtcStr();

    // String comparison works correctly because both sides are 'YYYY-MM-DD HH:MM:SS.mmm'
    const programs = await Program.findAll({
        where: {
            entryclosedate: { [Op.ne]: null, [Op.lte]: nowStr },
        },
        attributes: ['programid', 'name', 'entryclosedate'],
    });

    for (const program of programs) {
        const [count] = await Category.update(
            { entriesopen: false },
            { where: { programid: program.programid, entriesopen: true, deleted: 0 } }
        );
        if (count > 0) {
            console.log(`[autoClose] Closed ${count} category/categories for program ${program.programid} (${program.name}) at ${nowStr}`);
        }
    }
}

// Convenience: check a single program (called from request handlers).
export async function autoCloseIfExpired(programId) {
    const program = await Program.findByPk(programId, {
        attributes: ['programid', 'name', 'entryclosedate'],
    });
    if (!program?.entryclosedate) return;
    if (nowUtcStr() < program.entryclosedate) return;

    const [count] = await Category.update(
        { entriesopen: false },
        { where: { programid: programId, entriesopen: true, deleted: 0 } }
    );
    if (count > 0) {
        console.log(`[autoClose] Closed ${count} category/categories for program ${programId} (${program.name})`);
    }
}
