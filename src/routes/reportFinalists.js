// routes/reportFinalists.js
// GET /:slug/reportFinalists
// Downloads an Excel list of finalists, grouped by category.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getFinalistsForProgram } from '../queries/homeQueries.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;
        const rows = await getFinalistsForProgram({ programId: program.programid });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();

        const ws = wb.addWorksheet('Finalists');
        ws.columns = [
            { header: 'Category', key: 'categoryname', width: 45 },
            { header: 'Finalist', key: 'finalist',     width: 55 },
            { header: 'Entrant',  key: 'entrantname',  width: 40 },
            { header: 'Entry #',  key: 'entryid',      width: 12 },
        ];

        styleHeader(ws);

        for (const r of rows) {
            ws.addRow({
                categoryname: r.categoryname,
                finalist:     r.finalisttext || r.entrantname,
                entrantname:  r.entrantname,
                entryid:      r.entryid,
            });
        }

        ws.getColumn('entryid').alignment = { horizontal: 'right' };
        zebraStripe(ws);
        ws.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Finalists_${program.slug}.xlsx"`);
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
