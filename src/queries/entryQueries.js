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
          Category.judgingopen      = 1
          OR JudgeEntryLink.judgingopen = 1
        )
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// Entries this judge has been sent back to revise comments on (commentreview = 1).
// Independent of judging being open, so the judge can still reach them after
// judging closes on a category. viewEntry shows these in comments-only mode.
export async function getEntriesForCommentReview({ userId }) {
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
        AND JudgeEntryLink.commentreview = 1
        AND Entry.deleted = 0
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

// Review (wildcard) nominations for a category, with the nominating judge and
// reason — visible to the lead judge and all judges on the category.
export async function getReviewNominationsForCat({ categoryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`
      SELECT n.entryid, n.reason, n.userid,
             e.finalisttext, ent.name AS entrantname,
             uc.firstname, uc.lastname
      FROM JudgeEntryLinkWildcardNomination n
        INNER JOIN Entry   e   ON e.entryid     = n.entryid
        INNER JOIN Entrant ent ON ent.entrantid = e.entrantid
        INNER JOIN [User]  u   ON u.userid      = n.userid
        LEFT  JOIN UserCredential uc ON uc.credentialid = u.credentialid
      WHERE e.categoryid = @categoryId AND e.deleted = 0
      ORDER BY e.entryid
    `);
    return result.recordset;
}

// Example finalist texts from same-named categories (any program) — few-shot
// material so generation copies the per-category style. excludeEntryId lets a
// self-test exclude the entry being regenerated.
export async function getFinalistTextExamples({ categoryName, excludeEntryId = 0, limit = 6 }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryName', sql.NVarChar, categoryName)
        .input('excludeEntryId', sql.Int, excludeEntryId)
        .input('limit', sql.Int, limit)
        .query(`
      SELECT TOP (@limit) e.finalisttext
      FROM Entry e INNER JOIN Category c ON c.categoryid = e.categoryid
      WHERE c.name = @categoryName
        AND e.entryid <> @excludeEntryId
        AND e.finalisttext IS NOT NULL AND LEN(e.finalisttext) > 0
        AND e.deleted = 0
      ORDER BY NEWID()
    `);
    return result.recordset.map(r => r.finalisttext);
}

// An entry's judging-relevant responses as readable {question, value} pairs,
// with dropdown / radio / checkbox option ids resolved to their text. Feeds the
// finalist-text generator.
export async function getEntryResponsesForText({ entryId }) {
    const pool = await getPool();
    const rows = (await pool.request().input('e', sql.Int, entryId).query(`
      SELECT q.questiontext, q.inputtype, r.value
      FROM Response r INNER JOIN Question q ON q.questionid = r.questionid
      WHERE r.entryid = @e AND r.deleted = 0
        AND (q.omitforjudging = 0 OR q.omitforjudging IS NULL)
        AND q.inputtype IN ('textfield','textarea','drop down list','checkbox','radio')
        AND r.value IS NOT NULL AND LEN(r.value) > 0
      ORDER BY q.orda
    `)).recordset;

    const opts = (await pool.request().input('e', sql.Int, entryId).query(`
      SELECT io.inputoptionid, io.name FROM InputOption io
      WHERE io.questionid IN (
        SELECT q.questionid FROM Response r INNER JOIN Question q ON q.questionid = r.questionid
        WHERE r.entryid = @e
      )
    `)).recordset;
    const optName = new Map(opts.map(o => [String(o.inputoptionid), o.name]));
    const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    return rows.map(r => {
        let v = r.value;
        if (r.inputtype === 'drop down list' || r.inputtype === 'radio') {
            v = optName.get(String(r.value).trim()) || '';
        } else if (r.inputtype === 'checkbox') {
            v = String(r.value).split(/[,;]+/)
                .map(tok => optName.get(tok.replace(/~cb$/i, '').trim()) || '')
                .filter(Boolean).join(', ');
        }
        // Cap each value — the finalist text is built from short identifying fields
        // (event name, state, venue); long essay answers only add tokens and noise.
        return { question: clean(r.questiontext).slice(0, 120), value: clean(v).slice(0, 200) };
    }).filter(r => r.value && r.question);
}

// All review (wildcard) nominations across a program's finalist-review categories,
// with category, lead judge, nominator and reason — for the admin summary page.
export async function getReviewNominationsForProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT n.entryid, n.reason, n.userid AS nominatorid,
             e.finalisttext, ent.name AS entrantname,
             c.categoryid, c.name AS categoryname, c.orda,
             nuc.firstname AS nomfirst, nuc.lastname AS nomlast,
             luc.firstname AS leadfirst, luc.lastname AS leadlast
      FROM JudgeEntryLinkWildcardNomination n
        INNER JOIN Entry    e   ON e.entryid     = n.entryid
        INNER JOIN Entrant  ent ON ent.entrantid = e.entrantid
        INNER JOIN Category c   ON c.categoryid  = e.categoryid
        INNER JOIN [User]   nu  ON nu.userid     = n.userid
        LEFT  JOIN UserCredential nuc ON nuc.credentialid = nu.credentialid
        LEFT  JOIN [User]   lu  ON lu.userid     = c.userid
        LEFT  JOIN UserCredential luc ON luc.credentialid = lu.credentialid
      WHERE c.programid = @programId AND c.finalistreview = 1 AND e.deleted = 0
      ORDER BY c.orda, c.categoryid, e.entryid
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
