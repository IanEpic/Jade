// queries/categoryQueries.js
// Shared raw-SQL helpers for category-level lookups used across multiple routes.

import { getPool, sql } from '../config/database.js';

export async function getCriteria(categoryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`SELECT * FROM Criteria WHERE categoryid = @categoryId ORDER BY orda, criteriaid`);
    return result.recordset;
}

export async function getEligibilityLinks(categoryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`
            SELECT el.eligibilityrule
            FROM CategoryEligibilityLink cel
            INNER JOIN Eligibility el ON cel.eligibilityid = el.eligibilityid
            WHERE cel.categoryid = @categoryId
              AND el.deleted = 0
        `);
    return result.recordset;
}
