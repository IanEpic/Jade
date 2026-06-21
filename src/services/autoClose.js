// services/autoClose.js
// Checks all programs with a set entryclosedate. When the current time passes
// that date, sets entriesopen = false on all (non-deleted) categories for that
// program. Safe to call repeatedly — categories already closed are a no-op.

import Program  from '../models/Program.js';
import Category from '../models/Category.js';
import { Op }   from 'sequelize';

export async function autoCloseAllPrograms() {
    const now = new Date();

    // Find programs whose close date has passed and that still have open categories.
    const programs = await Program.findAll({
        where: { entryclosedate: { [Op.lte]: now } },
        attributes: ['programid', 'name', 'entryclosedate'],
    });

    for (const program of programs) {
        const [count] = await Category.update(
            { entriesopen: false },
            { where: { programid: program.programid, entriesopen: true, deleted: 0 } }
        );
        if (count > 0) {
            console.log(`[autoClose] Closed ${count} category/categories for program ${program.programid} (${program.name}) at ${now.toISOString()}`);
        }
    }
}

// Convenience: check a single program (called from request handlers).
export async function autoCloseIfExpired(programId) {
    const program = await Program.findByPk(programId, {
        attributes: ['programid', 'name', 'entryclosedate'],
    });
    if (!program?.entryclosedate) return;
    if (new Date() < new Date(program.entryclosedate)) return;

    const [count] = await Category.update(
        { entriesopen: false },
        { where: { programid: programId, entriesopen: true, deleted: 0 } }
    );
    if (count > 0) {
        console.log(`[autoClose] Closed ${count} category/categories for program ${programId} (${program.name})`);
    }
}
