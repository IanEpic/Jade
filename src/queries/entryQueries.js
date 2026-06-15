// entryQueries.js
// Equivalent of all EPIC::JADE::Entry->set_sql(...) named queries.
// Each function takes explicit parameters instead of positional ? placeholders.
// Uses the raw mssql pool for complex joins that Sequelize would over-complicate.

import { getPool, sql } from '../config/database.js';

// EPIC::JADE::Entry->set_sql(nonfinalistsbyjudgeandcat => ...)
// Usage: getNonFinalistsByJudgeAndCat({ userId, categoryId })
export async function getNonFinalistsByJudgeAndCat({ userId, categoryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId',     sql.Int, userId)
        .input('categoryId', sql.Int, categoryId)
        .query(`
      SELECT Entry.*
      FROM Category
        INNER JOIN Entry             ON Category.categoryid     = Entry.categoryid
        INNER JOIN JudgeEntryLink    ON Entry.entryid           = JudgeEntryLink.entryid
        INNER JOIN FinalScore        ON FinalScore.entryid      = Entry.entryid
        INNER JOIN [User]            ON JudgeEntryLink.userid   = [User].userid
      WHERE (Entry.belowminscore = 0 OR Entry.belowminscore IS NULL)
        AND JudgeEntryLink.userid  = @userId
        AND Category.categoryid    = @categoryId
        AND Entry.finalist         = 0
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(entriestobejudgedbyjudge => ...)
// Usage: getEntriesToBeJudgedByJudge({ userId })
export async function getEntriesToBeJudgedByJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*, Entrant.name AS entrantname, Category.name AS categoryname
      FROM Entry
        INNER JOIN JudgeEntryLink ON Entry.entryid    = JudgeEntryLink.entryid
        INNER JOIN Category       ON Entry.categoryid = Category.categoryid
        INNER JOIN Entrant        ON Entry.entrantid  = Entrant.entrantid
      WHERE JudgeEntryLink.userid = @userId
        AND (
          Category.judgingopen        = 1
          OR JudgeEntryLink.judgingopen   = 1
          OR JudgeEntryLink.commentreview = 1
        )
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(entriesnominatedforreviewbycat => ...)
// Usage: getEntriesNominatedForReviewByCat({ categoryId })
export async function getEntriesNominatedForReviewByCat({ categoryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN JudgeEntryLinkWildcardNomination ON Entry.entryid     = JudgeEntryLinkWildcardNomination.entryid
        INNER JOIN Category                         ON Entry.categoryid  = Category.categoryid
      WHERE Entry.finalist        = 0
        AND Category.categoryid   = @categoryId
        AND Category.finalistreview = 1
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(nominatedwinnersbyleadjudge => ...)
export async function getNominatedWinnersByLeadJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Category.userid  = @userId
        AND Entry.nominated  = 1
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(entriesbyleadjudge => ...)
export async function getEntriesByLeadJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Category.userid = @userId
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(entriestobejudgedbyjudgemobile => ...)
export async function getEntriesToBeJudgedByJudgeMobile({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN JudgeEntryLinkMobile ON Entry.entryid      = JudgeEntryLinkMobile.entryid
        INNER JOIN Category             ON Entry.categoryid   = Category.categoryid
      WHERE JudgeEntryLinkMobile.userid = @userId
        AND (
          Category.judgingopen              = 1
          OR JudgeEntryLinkMobile.judgingopen = 1
        )
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(finalistsnotopenbyuser => ...)
export async function getFinalistsNotOpenByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE (Category.entriesopen = 0 OR Category.entriesopen IS NULL)
        AND (Entry.entryopen      = 0 OR Entry.entryopen      IS NULL)
        AND Entry.userid          = @userId
        AND Entry.deleted         = 0
        AND Entry.entryaccepted   = 1
        AND (Entry.finalist = 1 OR Entry.statefinalist IS NOT NULL)
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(nonfinalistsnotopenbyuser => ...)
export async function getNonFinalistsNotOpenByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE (Category.entriesopen = 0 OR Category.entriesopen IS NULL)
        AND (Entry.entryopen      = 0 OR Entry.entryopen      IS NULL)
        AND Entry.userid          = @userId
        AND Entry.deleted         = 0
        AND Entry.entryaccepted   = 1
        AND (Entry.finalist = 0 OR Entry.finalist IS NULL)
        AND (Entry.statefinalist = '' OR Entry.statefinalist IS NULL)
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(simpleentriesopenforreview => ...)
export async function getSimpleEntriesOpenForReview({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Category.judgingopen = 1
        AND Category.deleted     = 0
        AND Entry.deleted        = 0
        AND Entry.programid      = @programId
      ORDER BY Category.orda, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(simpleentriesapprovedbyreviewer => ...)
export async function getSimpleEntriesApprovedByReviewer({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT Entry.*
      FROM Entry
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Category.judgingopen      = 1
        AND Category.deleted          = 0
        AND Entry.deleted             = 0
        AND Entry.approvedbyreviewer  = 1
        AND Entry.programid           = @programId
      ORDER BY Category.orda, Entry.entryid
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(afenomineesbyuser => ...)
export async function getAfeNomineesByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
      WHERE Entry.userid       = @userId
        AND Entry.deleted      = 0
        AND Entry.oliveEventID IS NOT NULL
    `);
    return result.recordset;
}

// EPIC::JADE::Entry->set_sql(nationalandstatenominees => ...)
export async function getNationalAndStateNominees({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT Entry.*
      FROM Entry
      WHERE Entry.programid = @programId
        AND Entry.deleted   = 0
        AND (Entry.finalist = 1 OR Entry.statefinalist IS NOT NULL)
    `);
    return result.recordset;
}
