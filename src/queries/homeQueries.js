// homeQueries.js
// Raw SQL queries for home.cgi equivalents.
// Mirrors the set_sql / search_* methods called in home.cgi.
// Each function takes explicit named parameters and returns recordset arrays.

import { getPool, sql } from '../config/database.js';

// ── Entrant queries ───────────────────────────────────────────────────────────

// Equiv: EPIC::JADE::Entrant->search(userid => $user, deleted => 0)
export async function getEntrantsByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT *
      FROM Entrant
      WHERE userid  = @userId
        AND deleted = 0
      ORDER BY entrantid
    `);
    return result.recordset;
}

// ── Entry queries ─────────────────────────────────────────────────────────────

// Equiv: EPIC::JADE::Entry->search(userid => $user, deleted => 0)
export async function getAllEntriesByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*,
             COALESCE(Entry.costex, Category.costex) AS costex,
             COALESCE(Entry.gst,    Category.gst)    AS gst,
             Entrant.name AS entrantname, Category.name AS categoryname
      FROM Entry
        INNER JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Entry.userid  = @userId
        AND Entry.deleted = 0
      ORDER BY Entry.entryid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Entry->search(userid, deleted=0, entryaccepted=1)
export async function getAcceptedEntriesByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*, Entrant.name AS entrantname, Category.name AS categoryname
      FROM Entry
        INNER JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Entry.userid         = @userId
        AND Entry.deleted        = 0
        AND Entry.entryaccepted  = 1
      ORDER BY Entry.entryid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Entry->search(userid, deleted=0, finalist=0, entryaccepted=1)
export async function getNonFinalistEntriesByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*, Entrant.name AS entrantname, Category.name AS categoryname
      FROM Entry
        INNER JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Entry.userid         = @userId
        AND Entry.deleted        = 0
        AND Entry.entryaccepted  = 1
        AND (Entry.finalist = 0 OR Entry.finalist IS NULL)
      ORDER BY Entry.entryid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Entry->search(userid, entryopen=1) — admin override open entries
export async function getEntriesOpenByOverride({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*
      FROM Entry
      WHERE Entry.userid    = @userId
        AND Entry.entryopen = 1
        AND Entry.deleted   = 0
    `);
    return result.recordset;
}

// ── Invoice / Payment queries ─────────────────────────────────────────────────

// Equiv: EPIC::JADE::Invoice->search(userid => $user, deleted => 0)
export async function getInvoicesByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Invoice.*,
             (Invoice.totalex + Invoice.gst - ISNULL(Invoice.partnerdiscount,0) - ISNULL(Invoice.ebdiscount,0) + ISNULL(Invoice.multientryadjustment,0)) AS totalamt
      FROM Invoice
      WHERE Invoice.userid  = @userId
        AND Invoice.deleted = 0
      ORDER BY Invoice.invoiceid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Payment->search(userid => $user, ewayTrxnStatus => 'True')
export async function getPaymentsByUser({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Payment.*
      FROM Payment
      WHERE Payment.userid          = @userId
        AND Payment.ewayTrxnStatus  = 'True'
      ORDER BY Payment.paymentid
    `);
    return result.recordset;
}

// ── Category queries ──────────────────────────────────────────────────────────

// Equiv: EPIC::JADE::Category->search(programid, entriesopen=1, deleted=0)
export async function getCategoriesOpenForEntries({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM Category
      WHERE programid   = @programId
        AND entriesopen = 1
        AND adminonly   = 0
        AND deleted     = 0
      ORDER BY orda, categoryid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Category->search(programid, judgingopen=1, deleted=0)
export async function getCategoriesOpenForJudging({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM Category
      WHERE programid  = @programId
        AND judgingopen = 1
        AND deleted     = 0
      ORDER BY orda, categoryid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Category->search(programid, deleted=0) — all categories for admin
export async function getAllCategories({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT Category.*,
             (SELECT SUM(weight) FROM Criteria WHERE categoryid = Category.categoryid) AS totalweight
      FROM Category
      WHERE programid = @programId
        AND deleted   = 0
      ORDER BY orda, categoryid
    `);
    return result.recordset;
}

// Equiv: Category->search_catsopenforreviewbyjudge($judge, $judge)
// Returns categories where the judge has entries to review (finalist review phase)
export async function getCatsOpenForReviewByJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT DISTINCT Category.*
      FROM Category
        INNER JOIN Entry         ON Category.categoryid = Entry.categoryid
        INNER JOIN JudgeEntryLink ON Entry.entryid      = JudgeEntryLink.entryid
      WHERE JudgeEntryLink.userid   = @userId
        AND Category.finalistreview = 1
        AND Category.deleted        = 0
        AND Entry.deleted           = 0
      ORDER BY Category.orda, Category.categoryid
    `);
    return result.recordset;
}

// Equiv: Category->search_catsopenforreviewornomination() — for chairperson
export async function getCatsOpenForReviewOrNomination({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM Category
      WHERE programid     = @programId
        AND finalistreview = 1
        AND deleted        = 0
      ORDER BY orda, categoryid
    `);
    return result.recordset;
}

// Equiv: Category->search_catsopenforjudgingbyjudge($judge)
export async function getCatsOpenForJudgingByJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT DISTINCT Category.*
      FROM Category
        INNER JOIN Entry          ON Category.categoryid = Entry.categoryid
        INNER JOIN JudgeEntryLink ON Entry.entryid       = JudgeEntryLink.entryid
      WHERE JudgeEntryLink.userid  = @userId
        AND (Category.judgingopen  = 1 OR JudgeEntryLink.judgingopen = 1)
        AND Category.deleted       = 0
        AND Entry.deleted          = 0
    `);
    return result.recordset;
}

// ── JudgeComment queries ──────────────────────────────────────────────────────

// Equiv: EPIC::JADE::JudgeComment->search_judgecommentsforprogram($programid)
export async function getJudgeCommentsForProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT JudgeComment.*
      FROM JudgeComment
        INNER JOIN Entry ON JudgeComment.entryid = Entry.entryid
      WHERE Entry.programid    = @programId
        AND JudgeComment.deleted = 0
    `);
    return result.recordset;
}

// ── Score / FinalScore queries ─────────────────────────────────────────────────

// Returns final scores for a set of entries (used in judgereviewfinalisttable)
export async function getFinalScoresForEntries({ entryIds }) {
    if (!entryIds || entryIds.length === 0) return [];
    const pool = await getPool();
    // Build IN list safely
    const params = entryIds.map((id, i) => `@eid${i}`).join(', ');
    const request = pool.request();
    entryIds.forEach((id, i) => request.input(`eid${i}`, sql.Int, id));
    const result = await request.query(`
      SELECT *
      FROM FinalScore
      WHERE entryid IN (${params})
      ORDER BY entryid, finalscore DESC
    `);
    return result.recordset;
}

// Returns judge scores for a single entry + judge
export async function getScoresForEntryByJudge({ entryId, userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .input('userId',  sql.Int, userId)
        .query(`
      SELECT Score.*
      FROM Score
      WHERE entryid = @entryId
        AND userid  = @userId
        AND deleted = 0
    `);
    return result.recordset;
}

// ── Entry lists for admin ─────────────────────────────────────────────────────

// Equiv: EPIC::JADE::Entry->search(programid, deleted=0) for entrylisttable
export async function getAllEntriesForProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT Entry.*,
             Entrant.name  AS entrantname,
             Category.name AS categoryname
      FROM Entry
        INNER JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Entry.programid = @programId
        AND Entry.deleted   = 0
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Entry->search(programid, finalist=1) for headjudgeseefinalists
export async function getFinalistsForProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT Entry.*,
             Entrant.name  AS entrantname,
             Category.name AS categoryname,
             Category.orda AS categoryorda
      FROM Entry
        INNER JOIN Entrant  ON Entry.entrantid  = Entrant.entrantid
        INNER JOIN Category ON Entry.categoryid = Category.categoryid
      WHERE Entry.programid = @programId
        AND Entry.finalist  = 1
        AND Entry.deleted   = 0
      ORDER BY Category.orda, Category.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// ── User queries (admin) ──────────────────────────────────────────────────────

// Equiv: EPIC::JADE::User->search(programid, judge=1, deleted=0)
export async function getJudgesForProgram({ programId, useSimplejudging }) {
    const pool = await getPool();
    const judgeCol = useSimplejudging ? 'simplejudge' : 'judge';
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM [User]
      WHERE programid  = @programId
        AND ${judgeCol} = 1
        AND deleted    = 0
      ORDER BY lastname
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::User->search(programid, deleted=0) for usertable
export async function getAllUsersForProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT u.*, ISNULL(uc.activated, 1) AS activated
      FROM [User] u
      LEFT JOIN UserCredential uc ON uc.credentialid = u.credentialid
      WHERE u.programid = @programId
        AND u.deleted   = 0
      ORDER BY u.enabled DESC, u.lastname ASC
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::User->search(programid, judge=1, deleted=0, enabled=1) for email checkboxes
export async function getEnabledJudgesForProgram({ programId, useSimplejudging }) {
    const pool = await getPool();
    const judgeCol = useSimplejudging ? 'simplejudge' : 'judge';
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM [User]
      WHERE programid  = @programId
        AND ${judgeCol} = 1
        AND deleted    = 0
        AND enabled    = 1
      ORDER BY lastname
    `);
    return result.recordset;
}

// ── Question / Eligibility / UserPage queries (admin) ─────────────────────────

// Equiv: EPIC::JADE::Question->search(programid, questiontype, deleted=0)
export async function getQuestionsByType({ programId, questionType }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId',    sql.Int,     programId)
        .input('questionType', sql.VarChar, questionType)
        .query(`
      SELECT *
      FROM Question
      WHERE programid    = @programId
        AND questiontype = @questionType
        AND deleted      = 0
      ORDER BY orda, questionid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::Eligibility->search(programid, deleted=0)
export async function getEligibilitiesByProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM Eligibility
      WHERE programid = @programId
        AND deleted   = 0
      ORDER BY orda, eligibilityid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::UserPage->search(programid)
export async function getUserPagesByProgram({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
      SELECT *
      FROM UserPage
      WHERE programid = @programId
      ORDER BY userpageid
    `);
    return result.recordset;
}

// Equiv: EPIC::JADE::UserPage->retrieve(pid)
export async function getUserPageById({ pageId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('pageId', sql.Int, pageId)
        .query(`SELECT * FROM UserPage WHERE userpageid = @pageId`);
    return result.recordset[0] || null;
}

// ── Judge allocation queries ──────────────────────────────────────────────────

// Judges assigned to a category (equiv of $category->judges)
export async function getJudgesForCategory({ categoryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`
      SELECT [User].*
      FROM [User]
        INNER JOIN JudgeCategoryLink ON [User].userid = JudgeCategoryLink.userid
      WHERE JudgeCategoryLink.categoryid = @categoryId
        AND [User].deleted = 0
    `);
    return result.recordset;
}

// Entries assigned to a judge (equiv of $judge->entriestojudge in a category)
export async function getEntriesAssignedToJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT Entry.*, Entrant.name AS entrantname, Category.name AS categoryname
      FROM Entry
        INNER JOIN JudgeEntryLink ON Entry.entryid       = JudgeEntryLink.entryid
        INNER JOIN Entrant        ON Entry.entrantid     = Entrant.entrantid
        INNER JOIN Category       ON Entry.categoryid    = Category.categoryid
      WHERE JudgeEntryLink.userid = @userId
        AND Entry.deleted         = 0
      ORDER BY Entry.categoryid, Entry.entryid
    `);
    return result.recordset;
}

// Scores for an entry/judge/criteria combination (for judgecheck completeness)
export async function getScoreForEntryCriteriaJudge({ entryId, criteriaId, userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId',    sql.Int, entryId)
        .input('criteriaId', sql.Int, criteriaId)
        .input('userId',     sql.Int, userId)
        .query(`
      SELECT *
      FROM Score
      WHERE entryid    = @entryId
        AND criteriaid = @criteriaId
        AND userid     = @userId
        AND deleted    = 0
    `);
    return result.recordset[0] || null;
}

// Criteria for a category (for judgecheck completeness)
export async function getCriteriaForCategory({ categoryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`
      SELECT *
      FROM Criteria
      WHERE categoryid = @categoryId
      ORDER BY orda, criteriaid
    `);
    return result.recordset;
}

// Judge comments for a specific entry and judge
export async function getJudgeCommentsForEntryByJudge({ entryId, userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .input('userId',  sql.Int, userId)
        .query(`
      SELECT *
      FROM JudgeComment
      WHERE entryid = @entryId
        AND userid  = @userId
        AND deleted = 0
    `);
    return result.recordset;
}

// ── Entry stats (year-over-year comparison) ───────────────────────────────────
// Equivalent of EPIC::JADE::ComponentStats::get_stats_table() / get_entry_stats()
//
// Shows active users, entries started, and entries paid for each year of the
// Australian Event Awards, compared at the same relative point in the entry cycle.
//
export async function getStatsPrograms() {
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT statsprogramid, year, programid, opendate, esdate, closedate, lifetimecat
        FROM StatsProgram
        ORDER BY year
    `);
    return result.recordset.map(r => ({
        statsprogramid: r.statsprogramid,
        year:           r.year,
        progid:         r.programid,
        opendate:       r.opendate.toISOString().slice(0, 10),
        esdate:         r.esdate.toISOString().slice(0, 10),
        closedate:      r.closedate.toISOString().slice(0, 10),
        lifetimecat:    r.lifetimecat,
    }));
}

export async function upsertStatsProgram({ statsprogramid, year, programid, opendate, esdate, closedate, lifetimecat }) {
    const pool = await getPool();
    if (statsprogramid) {
        await pool.request()
            .input('id',          sql.Int,     statsprogramid)
            .input('year',        sql.Int,     year)
            .input('programid',   sql.Int,     programid)
            .input('opendate',    sql.Date,    opendate)
            .input('esdate',      sql.Date,    esdate)
            .input('closedate',   sql.Date,    closedate)
            .input('lifetimecat', sql.Int,     lifetimecat)
            .query(`UPDATE StatsProgram SET year=@year, programid=@programid,
                    opendate=@opendate, esdate=@esdate, closedate=@closedate,
                    lifetimecat=@lifetimecat WHERE statsprogramid=@id`);
    } else {
        await pool.request()
            .input('year',        sql.Int,     year)
            .input('programid',   sql.Int,     programid)
            .input('opendate',    sql.Date,    opendate)
            .input('esdate',      sql.Date,    esdate)
            .input('closedate',   sql.Date,    closedate)
            .input('lifetimecat', sql.Int,     lifetimecat)
            .query(`INSERT INTO StatsProgram (year, programid, opendate, esdate, closedate, lifetimecat)
                    VALUES (@year, @programid, @opendate, @esdate, @closedate, @lifetimecat)`);
    }
}

export async function deleteStatsProgram({ statsprogramid }) {
    const pool = await getPool();
    await pool.request()
        .input('id', sql.Int, statsprogramid)
        .query('DELETE FROM StatsProgram WHERE statsprogramid = @id');
}

const MS_PER_DAY = 86400000;

function toDate(str) {
    const d = new Date(str + 'T00:00:00');
    return d;
}

function daysDiff(d1, d2) {
    return Math.round((d2 - d1) / MS_PER_DAY);
}

function toSqlDatetime(d) {
    // Format as 'YYYY-MM-DD HH:MM:SS'
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} 23:59:59`;
}

export async function getEntryStats() {
    const STATS_PROGRAMS = await getStatsPrograms();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const current = STATS_PROGRAMS[STATS_PROGRAMS.length - 1];

    const esDate    = toDate(current.esdate);
    const closeDate = toDate(current.closedate);
    const isClosed  = today > closeDate;
    const useEsDate = today <= esDate;
    const endDate   = useEsDate ? esDate : closeDate;
    const endpointDesc = useEsDate ? 'Early Starters' : 'Close of Entries';

    // Days from today to endpoint (positive = not yet reached, negative = past)
    const daysToGo = daysDiff(today, endDate);

    // Compute per-year comparison dates and daysOpen
    const yearMeta = STATS_PROGRAMS.map(p => {
        const pEndDate = useEsDate ? toDate(p.esdate) : toDate(p.closedate);
        // Equivalent date in this year = pEndDate minus daysToGo
        const cdate = new Date(pEndDate.getTime() - daysToGo * MS_PER_DAY);
        const openDate = toDate(p.opendate);
        const daysOpen = daysDiff(openDate, cdate); // negative if before open
        const compDate = isClosed ? null : toSqlDatetime(cdate);
        return { ...p, daysOpen, compDate };
    });

    // Build UNION queries — values are from our own constants, no injection risk
    const activeUsersUnions = yearMeta.map(p => {
        const datePart = (!isClosed && p.compDate)
            ? ` AND LogOnRecord.timestamp < '${p.compDate}'`
            : '';
        return `SELECT ${p.year} AS Year, COUNT(DISTINCT [User].email) AS ActiveUsers
FROM LogOnRecord INNER JOIN [User] ON LogOnRecord.userid = [User].userid
WHERE [User].exclude = 0 AND [User].deleted = 0
  AND [User].programid = ${p.progid}
  AND LogOnRecord.timestamp > '${p.opendate}'${datePart}`;
    });

    const entriesStartedUnions = yearMeta.map(p => {
        const datePart = (!isClosed && p.compDate)
            ? ` AND Entry.timestamp < '${p.compDate}'`
            : '';
        return `SELECT ${p.year} AS Year, COUNT(entryid) AS EntriesStarted
FROM Entry INNER JOIN [User] ON Entry.userid = [User].userid
WHERE Entry.programid = ${p.progid}
  AND Entry.categoryid <> ${p.lifetimecat}
  AND Entry.deleted = 0
  AND [User].exclude = 0 AND [User].deleted = 0
  AND Entry.timestamp > '${p.opendate}'${datePart}`;
    });

    const entriesPaidUnions = yearMeta.map(p => {
        const datePart = (!isClosed && p.compDate)
            ? ` AND Payment.date < '${p.compDate}'`
            : '';
        return `SELECT ${p.year} AS Year, COUNT(DISTINCT Entry.entryid) AS EntriesPaid
FROM Entry
  INNER JOIN [User] ON Entry.userid = [User].userid
  LEFT OUTER JOIN Invoice ON Entry.invoiceid = Invoice.invoiceid
  LEFT OUTER JOIN PaymentAllocation ON Invoice.invoiceid = PaymentAllocation.invoiceid
  LEFT OUTER JOIN Payment ON PaymentAllocation.paymentid = Payment.paymentid
WHERE Entry.programid = ${p.progid}
  AND Entry.categoryid <> ${p.lifetimecat}
  AND Entry.deleted = 0
  AND [User].exclude = 0 AND [User].deleted = 0
  AND Entry.entryaccepted = 1${datePart}`;
    });

    // Final accepted entries — same query but never date-filtered, so prior years always show their final total
    const entriesFinalUnions = yearMeta.map(p =>
        `SELECT ${p.year} AS Year, COUNT(DISTINCT Entry.entryid) AS EntriesFinal
FROM Entry
  INNER JOIN [User] ON Entry.userid = [User].userid
  LEFT OUTER JOIN Invoice ON Entry.invoiceid = Invoice.invoiceid
  LEFT OUTER JOIN PaymentAllocation ON Invoice.invoiceid = PaymentAllocation.invoiceid
  LEFT OUTER JOIN Payment ON PaymentAllocation.paymentid = Payment.paymentid
WHERE Entry.programid = ${p.progid}
  AND Entry.categoryid <> ${p.lifetimecat}
  AND Entry.deleted = 0
  AND [User].exclude = 0 AND [User].deleted = 0
  AND Entry.entryaccepted = 1`
    );

    const pool = await getPool();

    const [auResult, esResult, epResult, efResult] = await Promise.all([
        pool.request().query(activeUsersUnions.join('\nUNION\n')),
        pool.request().query(entriesStartedUnions.join('\nUNION\n')),
        pool.request().query(entriesPaidUnions.join('\nUNION\n')),
        pool.request().query(entriesFinalUnions.join('\nUNION\n')),
    ]);

    // Index results by year
    const byYear = {};
    for (const row of auResult.recordset) byYear[row.Year] = { ...byYear[row.Year], activeUsers: row.ActiveUsers };
    for (const row of esResult.recordset) byYear[row.Year] = { ...byYear[row.Year], entriesStarted: row.EntriesStarted };
    for (const row of epResult.recordset) byYear[row.Year] = { ...byYear[row.Year], entriesPaid: row.EntriesPaid };
    for (const row of efResult.recordset) byYear[row.Year] = { ...byYear[row.Year], entriesFinal: row.EntriesFinal };

    // Merge with yearMeta
    const rows = yearMeta.map(p => ({
        year:           p.year,
        daysOpen:       p.daysOpen,
        activeUsers:    byYear[p.year]?.activeUsers    ?? 0,
        entriesStarted: byYear[p.year]?.entriesStarted ?? 0,
        entriesPaid:    byYear[p.year]?.entriesPaid    ?? 0,
        entriesFinal:   byYear[p.year]?.entriesFinal   ?? 0,
    }));

    return {
        today:        today.toISOString().slice(0, 10),
        daysToGo:     Math.abs(daysToGo),
        endpointDesc,
        isClosed,
        rows,
    };
}

// Active users report for a program — all non-excluded users with logon/entry counts
export async function getActiveUsersReport({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
            SELECT
                [User].userid,
                [User].email,
                [User].firstname,
                [User].lastname,
                [User].organisation,
                [User].telephone,
                [User].mobile,
                Logons.LastLogon,
                ISNULL(EntriesStarted.entries, 0) AS started,
                ISNULL(EntriesPaid.entries,    0) AS paid,
                ISNULL(EntriesFinalised.entries,0) AS finalised
            FROM [User]
            LEFT JOIN (
                SELECT userid, MAX(timestamp) AS LastLogon
                FROM LogOnRecord
                GROUP BY userid
            ) AS Logons ON Logons.userid = [User].userid
            LEFT JOIN (
                SELECT userid, COUNT(entryid) AS entries
                FROM Entry
                WHERE deleted = 0 AND programid = @programId
                GROUP BY userid
            ) AS EntriesStarted ON EntriesStarted.userid = [User].userid
            LEFT JOIN (
                SELECT userid, COUNT(entryid) AS entries
                FROM Entry
                WHERE entryaccepted = 1 AND deleted = 0 AND programid = @programId
                GROUP BY userid
            ) AS EntriesPaid ON EntriesPaid.userid = [User].userid
            LEFT JOIN (
                SELECT userid, COUNT(entryid) AS entries
                FROM Entry
                WHERE finalised = 1 AND deleted = 0 AND programid = @programId
                GROUP BY userid
            ) AS EntriesFinalised ON EntriesFinalised.userid = [User].userid
            WHERE [User].programid = @programId
              AND [User].exclude = 0
              AND [User].deleted = 0
            ORDER BY started, paid, finalised, LastLogon
        `);
    return result.recordset;
}

// Paid (accepted) but not yet finalised
export async function getPaidNotFinalisedReport({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
            SELECT
                e.entryid,
                e.userid,
                u.email,
                u.firstname,
                u.lastname,
                u.organisation,
                e.userref,
                e.entryaccepted,
                e.entryopen,
                e.finalised,
                e.timestamp
            FROM Entry e
            INNER JOIN [User] u ON e.userid = u.userid
            WHERE e.programid    = @programId
              AND e.entryaccepted = 1
              AND (e.finalised IS NULL OR e.finalised = 0)
              AND e.deleted      = 0
              AND u.exclude      = 0
            ORDER BY u.email, e.entryid
        `);
    return result.recordset;
}

// Finalised but not yet paid (accepted)
export async function getFinalisedNotPaidReport({ programId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('programId', sql.Int, programId)
        .query(`
            SELECT
                e.entryid,
                e.userid,
                u.email,
                u.firstname,
                u.lastname,
                u.organisation,
                e.userref,
                e.entryaccepted,
                e.entryopen,
                e.finalised,
                e.timestamp
            FROM Entry e
            INNER JOIN [User] u ON e.userid = u.userid
            WHERE e.programid  = @programId
              AND e.finalised   = 1
              AND (e.entryaccepted IS NULL OR e.entryaccepted = 0)
              AND e.deleted     = 0
              AND u.exclude     = 0
            ORDER BY u.email, e.entryid
        `);
    return result.recordset;
}

// All judge comments for an entry (for scorescomments view)
export async function getJudgeCommentsForEntry({ entryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .query(`
      SELECT *
      FROM JudgeComment
      WHERE entryid = @entryId
        AND deleted = 0
    `);
    return result.recordset;
}

// Final score for an entry
export async function getFinalScoreForEntry({ entryId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .query(`
      SELECT TOP 1 *
      FROM FinalScore
      WHERE entryid = @entryId
      ORDER BY finalscore DESC
    `);
    return result.recordset[0] || null;
}

// Wildcard nominations made by a judge
export async function getWildcardNominationsByJudge({ userId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
      SELECT *
      FROM JudgeEntryLinkWildcardNomination
      WHERE userid = @userId
    `);
    return result.recordset;
}

// Menu buttons for editing (padded to numButtons slots, nulls for empty rows)
export async function getMenuButtonsForEdit({ topMenuId, numButtons = 6 }) {
    if (!topMenuId) return Array(numButtons).fill(null);
    const pool = await getPool();
    const result = await pool.request()
        .input('topMenuId', sql.Int, topMenuId)
        .query(`SELECT * FROM TopMenuButton WHERE topmenuid = @topMenuId ORDER BY topmenubuttonid`);
    const buttons = result.recordset;
    while (buttons.length < numButtons) buttons.push(null);
    return buttons.slice(0, numButtons);
}

// Payments for an invoice (for invoice balance calculation)
export async function getPaymentsForInvoice({ invoiceId }) {
    const pool = await getPool();
    const result = await pool.request()
        .input('invoiceId', sql.Int, invoiceId)
        .query(`
      SELECT p.*, pa.amount AS allocatedamount
      FROM Payment p
      INNER JOIN PaymentAllocation pa ON pa.paymentid = p.paymentid
      WHERE pa.invoiceid = @invoiceId
      ORDER BY p.paymentid
    `);
    return result.recordset;
}

