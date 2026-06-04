// services/pricing.js — entry cost and discount logic

import { getPool, sql } from '../config/database.js';

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
    return { costex: parseFloat(costex) || 0, gst: parseFloat(gst) || 0 };
}

/**
 * Returns all ProgramDiscount rows currently applicable for a program.
 * Early bird: must be within validfrom/validto window.
 * Code:       must match the supplied code string (case-insensitive).
 */
export async function getApplicableDiscounts(programId, date = new Date(), code = null) {
    const pool = await getPool();
    const r = await pool.request()
        .input('programid', sql.Int,      programId)
        .input('now',       sql.DateTime, date)
        .query(`
            SELECT * FROM ProgramDiscount
            WHERE programid = @programid
              AND active = 1
              AND (validfrom IS NULL OR validfrom <= @now)
              AND (
                    (type = 'earlybird' AND (validto IS NULL OR validto >= @now))
                 OR  type = 'code'
              )
              AND (maxuses IS NULL OR usecount < maxuses)
        `);

    const normalCode = code ? code.trim().toLowerCase() : null;
    return r.recordset.filter(d => {
        if (d.type === 'earlybird') return true;
        if (d.type === 'code') return normalCode && d.code.toLowerCase() === normalCode;
        return false;
    });
}

/**
 * Given a list of applicable discounts, pick the one that saves the most money.
 * Returns { discountInc, discount } or null if no discounts.
 *
 * @param {object[]} discounts   — rows from ProgramDiscount
 * @param {number}   entryCount  — number of entries being invoiced
 * @param {number}   subtotalInc — total inc GST before any discount (used for percent calcs)
 */
export function computeBestDiscount(discounts, entryCount, subtotalInc) {
    if (!discounts.length) return null;

    let best = null;
    for (const d of discounts) {
        const discountInc = d.amounttype === 'percent'
            ? subtotalInc * parseFloat(d.amount) / 100
            : parseFloat(d.amount) * entryCount;

        if (!best || discountInc > best.discountInc) {
            best = { discountInc, discount: d };
        }
    }
    return best;
}

/**
 * Increment usecount for a code discount after it has been applied.
 */
export async function incrementDiscountUsecount(discountId) {
    const pool = await getPool();
    await pool.request()
        .input('discountid', sql.Int, discountId)
        .query('UPDATE ProgramDiscount SET usecount = usecount + 1 WHERE discountid = @discountid');
}
