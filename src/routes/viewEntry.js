// routes/viewEntry.js
// Equivalent of viewEntry.cgi.
// Shows an entry with its responses. The right-side panel varies by role:
//   - Entrant: finalise checkbox (if entries open) or read-only status
//   - Judge:   score form (if judging open) or comment edit
//   - Head judge / chair: judge comment summary form
//   - Reviewer: simple review form
//   - Admin/viewentries: read-only

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import fs           from 'fs/promises';
import path         from 'path';
import Entry        from '../models/Entry.js';
import Entrant      from '../models/Entrant.js';
import Address      from '../models/Address.js';
import Category     from '../models/Category.js';
import Response     from '../models/Response.js';
import { getPool, sql } from '../config/database.js';
import { getCriteria } from '../queries/categoryQueries.js';

const FILESTORE_ROOT        = process.env.FILESTORE_ROOT || 'C:/Data/LocalJadeFilestore';
const ORIGINAL_IMAGES_DIR   = path.join(FILESTORE_ROOT, 'originalImages');
const CONVERTED_IMAGES_DIR  = path.join(FILESTORE_ROOT, 'convertedImageStore');
const ORIGINAL_VIDEOS_DIR   = path.join(FILESTORE_ROOT, 'originalVideos');
const CONVERTED_VIDEOS_DIR  = path.join(FILESTORE_ROOT, 'convertedVideoStore');
const ORIGINAL_FILES_DIR    = path.join(FILESTORE_ROOT, 'originalFiles');

async function fileExists(...candidates) {
    for (const p of candidates) {
        try { await fs.access(p); return true; } catch {}
    }
    return false;
}

const router = Router();
router.use(requireAuth);

// ── Data helpers ──────────────────────────────────────────────────────────────

async function getQuestions(categoryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('categoryId', sql.Int, categoryId)
        .query(`
            SELECT q.*, q.orda
            FROM Question q
            INNER JOIN CategoryQuestionLink cql ON q.questionid = cql.questionid
            WHERE cql.categoryid = @categoryId
              AND q.deleted = 0
            ORDER BY q.orda, q.questionid
        `);
    return result.recordset;
}

async function getInputOptions(questionId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('questionId', sql.Int, questionId)
        .query(`SELECT * FROM InputOption WHERE questionid = @questionId AND deleted = 0 ORDER BY orda`);
    return result.recordset;
}


async function getJudgeEntryLinks(userId, entryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId',  sql.Int, userId)
        .input('entryId', sql.Int, entryId)
        .query(`SELECT * FROM JudgeEntryLink WHERE userid = @userId AND entryid = @entryId`);
    return result.recordset;
}

async function getJudgeCategoryLinks(userId, categoryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('userId',     sql.Int, userId)
        .input('categoryId', sql.Int, categoryId)
        .query(`SELECT * FROM JudgeCategoryLink WHERE userid = @userId AND categoryid = @categoryId`);
    return result.recordset;
}

async function getWildcardNominations(entryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .query(`SELECT * FROM JudgeEntryLinkWildcardNomination WHERE entryid = @entryId`);
    return result.recordset;
}

async function getJudgeCommentsByType(entryId, type, userId = null) {
    const pool = await getPool();
    const req = pool.request()
        .input('entryId', sql.Int, entryId)
        .input('type',    sql.VarChar, type);
    let where = `WHERE entryid = @entryId AND type = @type AND deleted = 0`;
    if (userId !== null) {
        req.input('userId', sql.Int, userId);
        where += ` AND userid = @userId`;
    }
    const result = await req.query(`SELECT * FROM JudgeComment ${where}`);
    return result.recordset;
}

async function getAllJudgeComments(entryId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .query(`
            SELECT jc.*, u.firstname, u.lastname
            FROM JudgeComment jc
            LEFT JOIN [User] u ON jc.userid = u.userid
            WHERE jc.entryid = @entryId AND jc.deleted = 0
        `);
    return result.recordset;
}

async function getScoresForJudge(entryId, userId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .input('userId',  sql.Int, userId)
        .query(`SELECT * FROM Score WHERE entryid = @entryId AND userid = @userId AND deleted = 0`);
    return result.recordset;
}

async function getJudgingModel(judgingModelId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, judgingModelId)
        .query(`SELECT * FROM JudgingModel WHERE judgingmodelid = @id`);
    return result.recordset[0] || null;
}

async function getSimpleReviewComment(entryId, userId) {
    const pool = await getPool();
    const result = await pool.request()
        .input('entryId', sql.Int, entryId)
        .input('userId',  sql.Int, userId)
        .query(`SELECT TOP 1 * FROM JudgeComment WHERE entryid = @entryId AND userid = @userId AND type = 'simplereviewcomment' AND deleted = 0`);
    return result.recordset[0] || null;
}

// ── GET /viewEntry ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user     = req.user;
        const program  = req.program;
        const entryId  = req.query.entryid;
        const task     = req.query.task || '';

        if (!entryId) {
            return res.renderInShell('viewEntry', {
                user, program, error: 'noaccess', entry: null, category: null,
                questions: [], responses: {}, criteria: [], scorePanel: null,
            });
        }

        const entry = await Entry.findByPk(entryId, {
            include: [{ model: Entrant, as: 'entrant', include: [{ model: Address, as: 'streetaddress' }] }],
        });
        if (!entry) {
            return res.renderInShell('viewEntry', {
                user, program, error: 'noaccess', entry: null, category: null,
                questions: [], responses: {}, criteria: [], scorePanel: null,
            });
        }

        const category = await Category.findByPk(entry.categoryid);
        const originalCategory = entry.originalcatid
            ? await Category.findByPk(entry.originalcatid)
            : null;

        // ── Access control ────────────────────────────────────────────────
        const mejudge      = await getJudgeEntryLinks(user.userid, entry.entryid);
        const wildcardNoms = await getWildcardNominations(entry.entryid);
        let mejudgecat = [];
        if (category.finalistreview && (entry.finalist || wildcardNoms.length)) {
            mejudgecat = await getJudgeCategoryLinks(user.userid, entry.categoryid);
        }
        const leadjudgereview =
            (category.finalistreview || category.winnernomination) &&
            (category.userid === user.userid || user.chairperson);

        const isOwner      = entry.userid === user.userid;
        const canView      = isOwner || user.admin || user.viewentries ||
                             user.reviewer || user.simplejudge ||
                             mejudge.length || mejudgecat.length || leadjudgereview;

        if (!canView) {
            return res.renderInShell('viewEntry', {
                user, program, error: 'noaccess', entry: null, category: null,
                questions: [], responses: {}, criteria: [], scorePanel: null,
            });
        }

        // ── Questions and responses ───────────────────────────────────────
        const displayCategory = originalCategory || category;
        const questions = await getQuestions(displayCategory.categoryid);

        // Add input options to each question
        for (const q of questions) {
            if (['drop down list','checkbox','radio'].includes(q.inputtype)) {
                q.inputoptions = await getInputOptions(q.questionid);
            }
        }

        const rawResponses = await Response.findAll({ where: { entryid: entry.entryid, deleted: 0 } });
        const responses = {};
        for (const r of rawResponses) {
            responses[r.questionid] = r;
        }

        // Check file existence for media responses so the template can distinguish
        // "not uploaded" from "uploaded but file missing from disk"
        for (const q of questions) {
            const resp = responses[q.questionid];
            if (!resp || !resp.value) continue;
            const base = path.parse(resp.value).name;
            if (q.inputtype === 'image') {
                resp.fileExists = await fileExists(
                    path.join(CONVERTED_IMAGES_DIR, base + '.jpg'),
                    path.join(ORIGINAL_IMAGES_DIR,  resp.value),
                    path.join(ORIGINAL_IMAGES_DIR,  base)
                );
            } else if (q.inputtype === 'video') {
                resp.fileExists = await fileExists(
                    path.join(CONVERTED_VIDEOS_DIR, base + '.mp4'),
                    path.join(ORIGINAL_VIDEOS_DIR,  resp.value),
                    path.join(ORIGINAL_VIDEOS_DIR,  base)
                );
            } else if (q.inputtype === 'upload') {
                resp.fileExists = await fileExists(
                    path.join(ORIGINAL_FILES_DIR, resp.value),
                    path.join(ORIGINAL_FILES_DIR, base)
                );
            }
        }

        // Filter out omitforjudging if judge view — always hidden for any judge, regardless of judging state
        const isJudgeView = mejudge.length > 0;
        const visibleQuestions = questions.filter(q =>
            !q.deleted && (!isJudgeView || !q.omitforjudging)
        );

        const criteria = await getCriteria(entry.categoryid);

        // ── Determine score panel type ────────────────────────────────────
        let scorePanel = null;

        const commentReviewLink = mejudge.find(l => l.commentreview);
        const judgingOpenLink   = mejudge.find(l => l.judgingopen);

        if (!task && commentReviewLink) {
            // Edit comment mode
            const excelComments   = await getJudgeCommentsByType(entry.entryid, 'excel',   user.userid);
            const improveComments = await getJudgeCommentsByType(entry.entryid, 'improve', user.userid);
            const otherComments   = await getJudgeCommentsByType(entry.entryid, 'other',   user.userid);
            scorePanel = {
                type:    'editcomment',
                excel:   excelComments[0]?.comment   || '',
                improve: improveComments[0]?.comment || '',
                other:   otherComments[0]?.comment   || '',
                criteria,
                scores: await getScoresForJudge(entry.entryid, user.userid),
            };
        } else if (mejudge.length && (category.judgingopen || judgingOpenLink)) {
            // Full score form
            const judgingModel = await getJudgingModel(program.judgingmodelid);
            const excelComments   = await getJudgeCommentsByType(entry.entryid, 'excel',   user.userid);
            const improveComments = await getJudgeCommentsByType(entry.entryid, 'improve', user.userid);
            const otherComments   = await getJudgeCommentsByType(entry.entryid, 'other',   user.userid);
            scorePanel = {
                type:         'scoreform',
                judgingModel,
                criteria,
                scores:       await getScoresForJudge(entry.entryid, user.userid),
                excel:        excelComments[0]?.comment   || '',
                improve:      improveComments[0]?.comment || '',
                other:        otherComments[0]?.comment   || '',
                entry,
                user,
            };
        } else if (mejudgecat.length || user.chairperson || leadjudgereview) {
            // Head judge comment form
            const allComments = await getAllJudgeComments(entry.entryid);
            const myComments  = allComments.filter(c => c.userid === user.userid);
            scorePanel = {
                type:       'hjcomment',
                allComments,
                myComments,
                wildcardNoms,
                isLeadOrChair: category.userid === user.userid || user.chairperson,
                canAddComment: (category.finalistreview || category.winnernomination) &&
                               (category.userid === user.userid || user.chairperson),
                entry,
            };
        } else if (user.reviewer) {
            // Simple review form
            const reviewComment = await getSimpleReviewComment(entry.entryid, user.userid);
            const allComments   = await getAllJudgeComments(entry.entryid);
            const categories    = await Category.findAll({
                where: { programid: program.programid, deleted: 0 },
                order: [['orda', 'ASC'], ['categoryid', 'ASC']],
            });
            scorePanel = {
                type:         'simplereview',
                reviewComment,
                allComments,
                categories:   categories.filter(c => c.categoryid !== entry.categoryid),
                entry,
                user,
            };
        } else if (isOwner || user.admin || user.viewentries) {
            // Entrant view — show finalise panel if entries open
            const catOpen   = category.entriesopen;
            const entryOpen = entry.entryopen;
            scorePanel = {
                type:       'entrant',
                canFinalise: catOpen || entryOpen,
                finalised:  entry.finalised,
                entry,
            };
        }

        if (scorePanel && req.session.commentFeedback?.entryid === entry.entryid) {
            scorePanel.commentFeedback = req.session.commentFeedback.feedback;
            delete req.session.commentFeedback;
        }

        const entrant = entry.entrant || null;
        res.renderInShell('viewEntry', {
            user, program, entry, entrant, category, error: null,
            questions: visibleQuestions, responses, criteria, scorePanel, task,
        });

    } catch (err) {
        next(err);
    }
});

export default router;
