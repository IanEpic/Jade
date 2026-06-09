// routes/reportActiveUsers.js
// GET /:slug/reportActiveUsers
// Downloads an Excel report of active users for the current program.
// Requires admin. Uses the program's opendate from StatsProgram.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getActiveUsersReport, getStatsPrograms } from '../queries/homeQueries.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;

        // Use opendate from StatsProgram if available; otherwise fall back to Jan 1 of current year
        const statsPrograms = await getStatsPrograms();
        const sp = statsPrograms.find(p => p.progid === program.programid);
        const opendate = sp ? sp.opendate : `${new Date().getFullYear()}-01-01`;
        const year     = sp ? sp.year     : new Date().getFullYear();

        const rows = await getActiveUsersReport({
            programId: program.programid,
            opendate,
        });

        // ── Build Excel workbook ───────────────────────────────────────────────
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();

        const ws = wb.addWorksheet('Active Users');

        // Column definitions
        ws.columns = [
            { header: 'User ID',      key: 'userid',       width: 10 },
            { header: 'Email',        key: 'email',        width: 36 },
            { header: 'First Name',   key: 'firstname',    width: 16 },
            { header: 'Last Name',    key: 'lastname',     width: 16 },
            { header: 'Organisation', key: 'organisation', width: 30 },
            { header: 'Telephone',    key: 'telephone',    width: 16 },
            { header: 'Mobile',       key: 'mobile',       width: 16 },
            { header: 'Last Logon',   key: 'LastLogon',    width: 20 },
            { header: 'Started',      key: 'started',      width: 10 },
            { header: 'Paid',         key: 'paid',         width: 10 },
            { header: 'Finalised',    key: 'finalised',    width: 10 },
        ];

        // Style header row
        const headerRow = ws.getRow(1);
        headerRow.font    = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
        headerRow.alignment = { vertical: 'middle' };
        headerRow.height  = 18;

        // Data rows
        for (const r of rows) {
            ws.addRow({
                userid:       r.userid,
                email:        r.email,
                firstname:    r.firstname,
                lastname:     r.lastname,
                organisation: r.organisation,
                telephone:    r.telephone,
                mobile:       r.mobile,
                LastLogon:    r.LastLogon ? new Date(r.LastLogon) : null,
                started:      r.started,
                paid:         r.paid,
                finalised:    r.finalised,
            });
        }

        // Format LastLogon column as date/time
        ws.getColumn('LastLogon').numFmt = 'dd/mm/yyyy hh:mm';

        // Right-align numeric columns
        for (const key of ['userid', 'started', 'paid', 'finalised']) {
            ws.getColumn(key).alignment = { horizontal: 'right' };
        }

        // Zebra striping on data rows
        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const fill = rowNumber % 2 === 0
                ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
                : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            row.eachCell(cell => { cell.fill = fill; });
        });

        // Freeze header row
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        // Autofilter
        ws.autoFilter = {
            from: { row: 1, column: 1 },
            to:   { row: 1, column: ws.columns.length },
        };

        // ── Stream to client ───────────────────────────────────────────────────
        const filename = `ActiveUsers_${program.slug}_${year}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await wb.xlsx.write(res);
        res.end();

    } catch (err) { next(err); }
});

export default router;
