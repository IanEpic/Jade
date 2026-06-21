// routes/reportEntriesByCategory.js
// GET /:slug/reportEntriesByCategory
// Downloads an Excel report of entries started and paid per category.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getEntriesByCategoryReport } from '../queries/homeQueries.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;
        const rows = await getEntriesByCategoryReport({ programId: program.programid });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();

        const ws = wb.addWorksheet('Entries by Category');
        ws.columns = [
            { header: 'Category',        key: 'name',           width: 50 },
            { header: 'Entries Started', key: 'entriesstarted', width: 18 },
            { header: 'Entries Paid',    key: 'entriespaid',    width: 18 },
        ];

        styleHeader(ws);

        for (const r of rows) ws.addRow(r);

        // Totals row
        const totalRow = ws.addRow({
            name:           'Total',
            entriesstarted: rows.reduce((s, r) => s + (r.entriesstarted || 0), 0),
            entriespaid:    rows.reduce((s, r) => s + (r.entriespaid    || 0), 0),
        });
        totalRow.font = { bold: true };
        totalRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8D5A0' } };
        });

        ws.getColumn('entriesstarted').alignment = { horizontal: 'right' };
        ws.getColumn('entriespaid').alignment    = { horizontal: 'right' };

        zebraStripe(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="EntriesByCategory_${program.slug}.xlsx"`);
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
        if (rowNumber === ws.rowCount) return; // totals row has its own fill
        const fill = rowNumber % 2 === 0
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
            : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        row.eachCell(cell => { cell.fill = fill; });
    });
}

export default router;
