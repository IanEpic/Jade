// services/pricing.js
// Replaces: getentrycost($entry->entryid, $user->userid) from EPIC::JADE::Common
//
// The Perl version lived in a shared library imported via EPIC::JADE::Common qw(:utils).
// In Node, shared business logic lives in a services/ directory — imported explicitly
// into any route that needs it, rather than being globally available.
//
// You'll need to fill in the actual pricing logic from your EPIC::JADE::Common source.
// The structure below matches how the result was used in entry.cgi:
//   const { costex, gst } = await getEntrycost(entryId, userId);

import { getPool, sql } from '../config/database.js';

/**
 * Calculate entry cost and GST for a given entry and user.
 * Returns { costex: number, gst: number }
 *
 * TODO: port the actual pricing logic from EPIC::JADE::Common::getentrycost()
 * The placeholder below returns zero cost, which triggers the auto-accept path.
 */
export async function getEntrycost(entryId, userId) {
    const pool = await getPool();

    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .query(`
            SELECT c.costex, c.gst
            FROM Entry e
            INNER JOIN Category c ON e.categoryid = c.categoryid
            WHERE e.entryid = @entryId
        `);

    if (!result.recordset.length) return { costex: 0, gst: 0 };

    const { costex = 0, gst = 0 } = result.recordset[0];
    return {
        costex: parseFloat(costex) || 0,
        gst:    parseFloat(gst)    || 0,
    };
}
