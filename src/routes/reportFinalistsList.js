// routes/reportFinalistsList.js
// GET /:slug/reportFinalistsList — Excel of the "Finalists" report: national finalists grouped
// by category type, then a single State Finalists list. Admin only.

import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getFinalistsReport } from '../services/finalistsReport.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res, next) => {
    try {
        const program = req.program;
        const { nationalGroups, stateFinalists } = await getFinalistsReport(program.programid);

        const wb = new ExcelJS.Workbook();
        wb.creator = 'Jade';
        wb.created = new Date();
        const ws = wb.addWorksheet('Finalists', { views: [{ state: 'frozen', ySplit: 1 }] });
        ws.columns = [
            { header: 'Finalist',     key: 'finalist', width: 90 },
            { header: 'Possible Dup', key: 'dup',      width: 14 },
        ];
        const head = ws.getRow(1);
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };

        let first = true;
        const addGroupHeader = (label) => {
            if (!first) ws.addRow({});               // spacer row between groups
            first = false;
            const row = ws.addRow({ finalist: label });
            row.font = { bold: true, size: 12, color: { argb: 'FFC48F06' } };
        };
        const addRow = (f) => {
            const row = ws.addRow({ finalist: f.text, dup: f.dup ? 'check' : '' });
            if (f.dup) row.eachCell({ includeEmpty: true }, c => {
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4B8' } };
            });
        };
        for (const g of nationalGroups) { addGroupHeader(g.typename); for (const f of g.finalists) addRow(f); }
        addGroupHeader('State Finalists');
        for (const f of stateFinalists) addRow(f);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Finalists_${program.slug}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
});

export default router;
