// routes/reportFinalisedNotPaid.js
// GET /:slug/reportFinalisedNotPaid
// Downloads an Excel report of entries that are finalised but not yet paid.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getFinalisedNotPaidReport } from '../queries/homeQueries.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;
        const rows = await getFinalisedNotPaidReport({ programId: program.programid });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();

        const ws = wb.addWorksheet('Finalised Not Paid');
        ws.columns = [
            { header: 'Entry ID',     key: 'entryid',       width: 10 },
            { header: 'User ID',      key: 'userid',        width: 10 },
            { header: 'Email',        key: 'email',         width: 36 },
            { header: 'First Name',   key: 'firstname',     width: 16 },
            { header: 'Last Name',    key: 'lastname',      width: 16 },
            { header: 'Organisation', key: 'organisation',  width: 30 },
            { header: 'User Ref',     key: 'userref',       width: 14 },
            { header: 'Accepted',     key: 'entryaccepted', width: 10 },
            { header: 'Open',         key: 'entryopen',     width: 10 },
            { header: 'Finalised',    key: 'finalised',     width: 10 },
            { header: 'Created',      key: 'timestamp',     width: 20 },
        ];

        styleHeader(ws);

        for (const r of rows) ws.addRow(r);

        ws.getColumn('timestamp').numFmt = 'dd/mm/yyyy hh:mm';
        for (const key of ['entryid', 'userid', 'entryaccepted', 'entryopen', 'finalised'])
            ws.getColumn(key).alignment = { horizontal: 'right' };

        zebraStripe(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="FinalisedNotPaid_${program.slug}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
});

function styleHeader(ws) {
    const row = ws.getRow(1);
    row.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    row.alignment = { vertical: 'middle' };
    row.height    = 18;
}

function zebraStripe(ws) {
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const fill = rowNumber % 2 === 0
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
            : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        row.eachCell(cell => { cell.fill = fill; });
    });
}

export default router;
