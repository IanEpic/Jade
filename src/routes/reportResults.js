// routes/reportResults.js
// GET /:slug/reportResults — Excel "Results" report: one row per FinalScore (scored entry) with
// final score, average raw score, finalist flag, event name, entrant contact details and state,
// ordered by category then final score desc. Port of the 2025 FinalScores.sql, adapted: user
// details now come from UserCredential, and the state/event-name questions are detected by text
// (rather than hard-coded ids) so it works across programs. Admin only.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPool } from '../config/database.js';
import { certificateText } from '../services/eventStates.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const clean = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;
        const pid = program.programid;
        const pool = await getPool();

        // Detect the "event name" and "state" questions for this program (ids vary per program).
        const evq = (await pool.request().query(`
            SELECT TOP 1 questionid FROM Question
            WHERE programid=${pid} AND deleted=0 AND inputtype IN ('textfield','textarea')
              AND (questiontext LIKE '%name of the event%' OR questiontext LIKE '%event name%'
                   OR questiontext LIKE '%name of your event%')
            ORDER BY orda
        `)).recordset[0]?.questionid || 0;
        const stq = (await pool.request().query(`
            SELECT TOP 1 questionid FROM Question
            WHERE programid=${pid} AND deleted=0
              AND (questiontext LIKE '%states or territories%' OR questiontext LIKE '%which state%')
            ORDER BY orda
        `)).recordset[0]?.questionid || 0;

        const rows = (await pool.request().query(`
            SELECT fs.categoryname AS CategoryName, fs.entryid AS EntryID, fs.entrantname AS EntrantName,
                   fs.finalscore AS FinalScore, raw.AvgRawScore, ISNULL(e.finalist,0) AS Finalist,
                   ISNULL(e.nominated,0) AS Nominated,
                   e.statefinalist AS StateFinalist, e.statewinner AS StateWinner, e.finalisttext AS FinalistText,
                   ev.value AS EventNameRaw,
                   uc.firstname AS FirstName, uc.lastname AS LastName, uc.email AS Email,
                   uc.telephone AS Telephone, uc.mobile AS Mobile,
                   st.value AS StateRaw
            FROM FinalScore fs
            INNER JOIN Category c ON c.categoryid = fs.categoryid
            INNER JOIN Entry e    ON e.entryid = fs.entryid
            INNER JOIN [User] u   ON u.userid = e.userid
            LEFT  JOIN UserCredential uc ON uc.credentialid = u.credentialid
            LEFT  JOIN (
                SELECT t.entryid, AVG(t.contrib) AS AvgRawScore
                FROM (
                    SELECT s.entryid, s.userid,
                           SUM(CAST(s.score AS decimal(9,4)) * cr.weight / 100) AS contrib
                    FROM Score s
                    INNER JOIN Criteria cr ON cr.criteriaid = s.criteriaid
                    INNER JOIN Entry e2 ON e2.entryid = s.entryid
                    WHERE e2.programid = ${pid}
                    GROUP BY s.entryid, s.userid
                ) t GROUP BY t.entryid
            ) raw ON raw.entryid = fs.entryid
            LEFT JOIN (
                SELECT r.entryid, r.value FROM Response r
                INNER JOIN (SELECT entryid, MAX(responseid) AS rid FROM Response
                            WHERE questionid=${evq} AND deleted=0 GROUP BY entryid) m
                  ON m.entryid = r.entryid AND m.rid = r.responseid
            ) ev ON ev.entryid = fs.entryid
            LEFT JOIN (
                SELECT r.entryid, r.value FROM Response r
                INNER JOIN (SELECT entryid, MAX(responseid) AS rid FROM Response
                            WHERE questionid=${stq} AND deleted=0 GROUP BY entryid) m
                  ON m.entryid = r.entryid AND m.rid = r.responseid
            ) st ON st.entryid = fs.entryid
            WHERE c.programid = ${pid}
            ORDER BY c.orda, fs.finalscore DESC
        `)).recordset;

        // Resolve the state checkbox value(s) (tilde-separated option ids) to state names.
        const optName = new Map((await pool.request().query(
            `SELECT inputoptionid, name FROM InputOption WHERE questionid=${stq} AND deleted=0`
        )).recordset.map(o => [String(o.inputoptionid), o.name]));
        const resolveState = v => String(v || '').split(/[~,;]+/).map(x => x.trim())
            .filter(x => x && x.toLowerCase() !== 'cb').map(x => optName.get(x) || '').filter(Boolean).join(', ');

        // ── Build workbook ──────────────────────────────────────────────────────
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();
        const ws = wb.addWorksheet('Results', { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = [
            { header: 'Category',      key: 'CategoryName', width: 28 },
            { header: 'Entry ID',      key: 'EntryID',      width: 10 },
            { header: 'Entrant',       key: 'EntrantName',  width: 26 },
            { header: 'Event Name',    key: 'EventName',    width: 30 },
            { header: 'Final Score',   key: 'FinalScore',   width: 12 },
            { header: 'Avg Raw Score', key: 'AvgRawScore',  width: 13 },
            { header: 'Finalist',      key: 'Finalist',     width: 9 },
            { header: 'Winner',        key: 'Winner',       width: 9 },
            { header: 'State Finalist', key: 'StateFinalist', width: 14 },
            { header: 'State Winner', key: 'StateWinner', width: 14 },
            { header: 'Certificate Text', key: 'CertificateText', width: 46 },
            { header: 'Finalist Text', key: 'FinalistText', width: 40 },
            { header: 'State',         key: 'State',        width: 14 },
            { header: 'First Name',    key: 'FirstName',    width: 16 },
            { header: 'Last Name',     key: 'LastName',     width: 16 },
            { header: 'Email',         key: 'Email',        width: 28 },
            { header: 'Telephone',     key: 'Telephone',    width: 16 },
            { header: 'Mobile',        key: 'Mobile',       width: 16 },
        ];
        const head = ws.getRow(1);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };

        // Shade every second category band so the category breaks are easy to see.
        let prevCat = null, catIdx = -1;
        for (const r of rows) {
            if (r.CategoryName !== prevCat) { catIdx++; prevCat = r.CategoryName; }
            const row = ws.addRow({
                CategoryName: r.CategoryName, EntryID: r.EntryID, EntrantName: r.EntrantName,
                EventName: clean(r.EventNameRaw),
                FinalScore: r.FinalScore != null ? Math.round(r.FinalScore * 1e4) / 1e4 : null,
                AvgRawScore: r.AvgRawScore != null ? Math.round(r.AvgRawScore * 1e4) / 1e4 : null,
                Finalist: r.Finalist ? 'Yes' : 'No',
                Winner: r.Nominated ? 'Yes' : 'No',
                StateFinalist: r.StateFinalist || '',
                StateWinner: r.StateWinner || '',
                CertificateText: certificateText(r.Nominated, r.Finalist, r.StateFinalist, r.StateWinner),
                FinalistText: r.FinalistText || '',
                State: resolveState(r.StateRaw),
                FirstName: r.FirstName, LastName: r.LastName, Email: r.Email,
                Telephone: r.Telephone, Mobile: r.Mobile,
            });
            if (catIdx % 2 === 1) {
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4B8' } };
                });
            }
        }
        for (const k of ['EntryID', 'FinalScore', 'AvgRawScore']) ws.getColumn(k).alignment = { horizontal: 'right' };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Results_${program.slug}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
});

export default router;
