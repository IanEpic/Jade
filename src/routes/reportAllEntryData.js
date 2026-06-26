// routes/reportAllEntryData.js
// GET /:slug/reportAllEntryData — Excel export of all data for ACCEPTED entries: one row per
// entry with metadata columns + one column per question (answer resolved to option names for
// choice questions). Admin only. Equivalent of the old AllEntryDataPivot.sql, made readable.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPool, sql } from '../config/database.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const clean = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;
        const pid = program.programid;
        const pool = await getPool();

        // Question columns (skip 'noinput' display-only questions), in display order.
        const questions = (await pool.request().query(`
            SELECT questionid, questiontext, inputtype, orda
            FROM Question
            WHERE programid=${pid} AND deleted=0 AND inputtype <> 'noinput'
            ORDER BY orda, questionid
        `)).recordset;

        // Accepted entries with metadata (email from UserCredential post-migration, else [User]).
        const entries = (await pool.request().query(`
            SELECT c.name AS CategoryName, c.orda AS catorda, e.entryid, e.userref,
                   en.name AS EntrantName, en.legalentity AS EntrantCo,
                   uc.email AS UserEmail, ISNULL(e.finalised,0) AS Finalised
            FROM Entry e
            INNER JOIN Entrant en ON e.entrantid = en.entrantid
            INNER JOIN [User] u   ON u.userid = e.userid
            LEFT  JOIN UserCredential uc ON uc.credentialid = u.credentialid
            INNER JOIN Category c ON c.categoryid = e.categoryid
            WHERE e.programid=${pid} AND e.entryaccepted=1 AND e.deleted=0
            ORDER BY c.orda, e.entryid DESC
        `)).recordset;

        // All answers for those entries + the option lookup for choice questions.
        const responses = (await pool.request().query(`
            SELECT r.entryid, r.questionid, r.value
            FROM Response r
            INNER JOIN Entry e ON e.entryid = r.entryid
            WHERE e.programid=${pid} AND e.entryaccepted=1 AND e.deleted=0 AND r.deleted=0
        `)).recordset;
        const options = (await pool.request().query(`
            SELECT io.inputoptionid, io.name FROM InputOption io
            INNER JOIN Question q ON q.questionid = io.questionid
            WHERE q.programid=${pid} AND io.deleted=0
        `)).recordset;
        const optName = new Map(options.map(o => [String(o.inputoptionid), o.name]));
        const qType   = new Map(questions.map(q => [q.questionid, q.inputtype]));

        function resolve(questionid, value) {
            const t = qType.get(questionid);
            if (t === 'drop down list' || t === 'radio') return clean(optName.get(String(value).trim()) || '');
            if (t === 'checkbox') {
                return String(value).split(/[~,;]+/).map(x => x.trim())
                    .filter(x => x && x.toLowerCase() !== 'cb')
                    .map(x => optName.get(x) || '').filter(Boolean).join(', ');
            }
            return clean(value);
        }

        // entryid -> { questionid: resolvedValue }
        const byEntry = {};
        for (const r of responses) {
            if (!r.value) continue;
            (byEntry[r.entryid] = byEntry[r.entryid] || {})[r.questionid] = resolve(r.questionid, r.value);
        }

        // ── Build workbook ──────────────────────────────────────────────────────
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();
        const ws = wb.addWorksheet('All Entry Data', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });

        const metaCols = [
            { header: 'Category',     key: 'CategoryName', width: 28 },
            { header: 'Entry ID',     key: 'entryid',      width: 10 },
            { header: 'User Ref',     key: 'userref',      width: 12 },
            { header: 'Entrant',      key: 'EntrantName',  width: 26 },
            { header: 'Entrant Co',   key: 'EntrantCo',    width: 26 },
            { header: 'User Email',   key: 'UserEmail',    width: 28 },
            { header: 'Finalised',    key: 'Finalised',    width: 10 },
        ];
        const qCols = questions.map(q => ({
            header: clean(q.questiontext).slice(0, 90) || `Q${q.questionid}`,
            key: 'q' + q.questionid,
            width: 40,
        }));
        ws.columns = [...metaCols, ...qCols];

        // Header styling
        const head = ws.getRow(1);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
        head.alignment = { vertical: 'top', wrapText: true };
        head.height = 42;

        for (const e of entries) {
            const ans = byEntry[e.entryid] || {};
            const row = {
                CategoryName: e.CategoryName, entryid: e.entryid, userref: e.userref,
                EntrantName: e.EntrantName, EntrantCo: e.EntrantCo, UserEmail: e.UserEmail,
                Finalised: e.Finalised ? 'Yes' : 'No',
            };
            for (const q of questions) row['q' + q.questionid] = ans[q.questionid] || '';
            ws.addRow(row);
        }
        ws.getColumn('entryid').alignment = { horizontal: 'right' };

        const filename = `AllEntryData_${program.slug}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
});

export default router;
