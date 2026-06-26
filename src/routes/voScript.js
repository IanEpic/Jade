// routes/voScript.js
// Finalist VO Script (editable). The script is derived from finalist text (articles/ordinals
// moved to the front, safe speech subs), but admins can tweak it on the page before exporting.
//   POST /voScript/save     { items } → save the edited script
//   POST /voScript/generate          → rebuild from finalist text + save, returns items
//   GET  /voScript/export            → Word document of the saved (or derived) script

import { Router } from 'express';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, LevelFormat, AlignmentType } from 'docx';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getVoScript, getVoScriptItems, saveVoScript } from '../services/voScript.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/save', async (req, res, next) => {
    try {
        const items = JSON.parse(req.body.items || '[]');
        await saveVoScript(req.program.programid, items);
        res.json({ ok: true });
    } catch (err) { res.json({ ok: false, error: err.message }); }
});

router.post('/generate', async (req, res, next) => {
    try {
        const items = await getVoScript(req.program.programid);   // fresh from finalist text
        await saveVoScript(req.program.programid, items);
        res.json({ ok: true, items });
    } catch (err) { res.json({ ok: false, error: err.message }); }
});

router.get('/export', async (req, res, next) => {
    try {
        const program = req.program;
        const { items } = await getVoScriptItems(program.programid);

        const children = [new Paragraph({ heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: `Finalist VO Script — ${program.name || program.slug}` })] })];

        for (const c of items) {
            children.push(new Paragraph({ spacing: { before: 280, after: 80 },
                children: [new TextRun({ text: c.heading, bold: true })] }));
            const lines = String(c.body || '').split('\n').map(s => s.trim()).filter(Boolean);
            for (const f of lines) {
                children.push(new Paragraph({ numbering: { reference: 'noms', level: 0 }, children: [new TextRun({ text: f })] }));
            }
            if (!lines.length && c.note) {
                children.push(new Paragraph({ children: [new TextRun({ text: `[ ${c.note} ]`, italics: true, color: '888888' })] }));
            }
        }

        const doc = new Document({
            creator: 'Jade',
            styles: { default: { document: { run: { font: 'Arial', size: 24 } } } },
            numbering: { config: [{
                reference: 'noms',
                levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
                    style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
            }] },
            sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } }, children }],
        });

        const buffer = await Packer.toBuffer(doc);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="FinalistVOScript_${program.slug}.docx"`);
        res.send(buffer);
    } catch (err) { next(err); }
});

export default router;
