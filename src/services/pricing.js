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
    // Compare on the calendar DATE only. Build a 'YYYY-MM-DD' from the date's LOCAL
    // components so the driver doesn't shift the day across the UTC boundary — otherwise
    // the time-of-day of an online payment could land it on the wrong side of validto.
    const d = date instanceof Date ? date : new Date(date);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await pool.request()
        .input('programid', sql.Int,        programId)
        .input('now',       sql.VarChar(10), ymd)
        .query(`
            SELECT * FROM ProgramDiscount
            WHERE programid = @programid
              AND active = 1
              AND (validfrom IS NULL OR CAST(validfrom AS DATE) <= CAST(@now AS DATE))
              AND (
                    -- validto is INCLUSIVE of the whole day (compare calendar dates so the
                    -- time-of-day of an online payment doesn't exclude same-day payers)
                    (type = 'earlybird' AND (validto IS NULL OR CAST(validto AS DATE) >= CAST(@now AS DATE)))
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
 * The program's active early-bird discount row (regardless of whether the window is
 * still open), so the Receive Payment screen can show the discounted amount and apply
 * it when a payment is dated on/before validto. Returns the row or null.
 */
export async function getEarlyBirdDiscount(programId) {
    const pool = await getPool();
    const r = await pool.request()
        .input('programid', sql.Int, programId)
        .query(`SELECT TOP 1 * FROM ProgramDiscount
                WHERE programid = @programid AND active = 1 AND type = 'earlybird'
                ORDER BY validto DESC`);
    return r.recordset[0] || null;
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
