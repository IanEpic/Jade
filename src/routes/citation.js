// routes/citation.js
// Admin: winner citations for the awards night.
//   POST /citation/generate { entryid, headline } → AI-generate + save, returns text
//   POST /citation/save     { entryid, headline, text } → save an admin edit
//   GET  /citation/export   → Word document of all citations

import { Router } from 'express';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import Entry from '../models/Entry.js';
import Category from '../models/Category.js';
import Entrant from '../models/Entrant.js';
import JudgingModel from '../models/JudgingModel.js';
import { getPool, sql } from '../config/database.js';
import { getEntryResponsesForText } from '../queries/entryQueries.js';
import { generateCitation, getEntryComments, getCitationData, getStateAward, generateStateCitation } from '../services/citation.js';
import { saveStateCitation } from '../services/bestState.js';

const router = Router();
router.use(requireAuth, requireAdmin);

async function citationRules(program) {
    if (!program.judgingmodelid) return '';
    const jm = await JudgingModel.findByPk(program.judgingmodelid);
    return jm?.citationrules || '';
}

router.post('/generate', async (req, res, next) => {
    try {
        const entryid  = parseInt(req.body.entryid);
        const headline = req.body.headline === '1' || req.body.headline === true;
        if (!entryid) return res.json({ ok: false, error: 'no entry' });

        const entry = await Entry.findByPk(entryid, {
            include: [{ model: Category, as: 'category' }, { model: Entrant, as: 'entrant' }],
        });
        if (!entry || entry.programid !== req.program.programid) return res.json({ ok: false, error: 'not found' });

        const [responses, comments, rules] = await Promise.all([
            getEntryResponsesForText({ entryId: entryid }),
            getEntryComments(entryid),
            citationRules(req.program),
        ]);

        const text = await generateCitation({
            category:  entry.category?.name || '',
            entrant:   entry.entrant?.legalentity || entry.entrant?.name || '',
            finalisttext: entry.finalisttext || '',
            responses, comments, rules,
            headline,
            categoryCitation: headline ? (entry.citation || '') : '',
        });

        await entry.update(headline ? { headlinecitation: text } : { citation: text });
        res.json({ ok: true, entryid, headline, text });
    } catch (err) { next(err); }
});

router.post('/save', async (req, res, next) => {
    try {
        const entryid  = parseInt(req.body.entryid);
        const headline = req.body.headline === '1' || req.body.headline === true;
        if (!entryid) return res.json({ ok: false });
        const entry = await Entry.findByPk(entryid);
        if (!entry || entry.programid !== req.program.programid) return res.json({ ok: false });
        await entry.update(headline ? { headlinecitation: (req.body.text || '').trim() }
                                    : { citation: (req.body.text || '').trim() });
        res.json({ ok: true, entryid });
    } catch (err) { next(err); }
});

// Mark (or clear) the winner of a headline award — one of the feeder-category winners.
router.post('/headlinewinner', async (req, res, next) => {
    try {
        const headlinecategoryid = parseInt(req.body.headlinecategoryid);
        const entryid = req.body.entryid ? parseInt(req.body.entryid) : null;
        if (!headlinecategoryid) return res.json({ ok: false });
        const pool = await getPool();

        // Clear the flag on every feeder winner of this headline, then set the chosen one.
        await pool.request()
            .input('p', sql.Int, req.program.programid)
            .input('h', sql.Int, headlinecategoryid)
            .query(`
                UPDATE e SET e.headlinewinner = 0
                FROM Entry e
                JOIN Category c ON c.categoryid = e.categoryid
                JOIN CategoryType t ON t.categorytypeid = c.categorytypeid
                WHERE t.programid = @p AND t.feedsto = @h AND e.deleted = 0 AND ISNULL(e.nominated,0) = 1
            `);
        if (entryid) {
            await pool.request()
                .input('e', sql.Int, entryid).input('p', sql.Int, req.program.programid)
                .query('UPDATE Entry SET headlinewinner = 1 WHERE entryid = @e AND programid = @p');
        }
        res.json({ ok: true });
    } catch (err) { next(err); }
});

// State/Territory Award citation (a single paragraph; winner is a state from Calc Best State).
router.post('/state/generate', async (req, res, next) => {
    try {
        const text = await generateStateCitation(req.program.programid, await citationRules(req.program));
        res.json({ ok: true, text });
    } catch (err) { res.json({ ok: false, error: err.message }); }
});

router.post('/state/save', async (req, res, next) => {
    try {
        const ok = await saveStateCitation(req.program.programid, (req.body.text || '').trim());
        res.json({ ok });
    } catch (err) { next(err); }
});

// Citation paragraphs: split a stored citation into the description and the "The judges said:"
// praise so the Word export can render the label in its own paragraph.
function citationParagraphs(text) {
    const out = [];
    for (const line of String(text || '').split(/\n+/)) {
        const t = line.trim();
        if (!t) continue;
        const m = t.match(/^the judges said:\s*(.*)$/i);
        if (m) {
            out.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: 'The judges said:', bold: true })] }));
            if (m[1]) out.push(new Paragraph({ children: [new TextRun({ text: m[1] })] }));
        } else {
            out.push(new Paragraph({ children: [new TextRun({ text: t })] }));
        }
    }
    return out;
}

router.get('/export', async (req, res, next) => {
    try {
        const program = req.program;
        const { categories, headlines } = await getCitationData(program.programid);
        const stateAward = await getStateAward(program.programid);

        const children = [new Paragraph({ heading: HeadingLevel.HEADING_1,
            children: [new TextRun(`Winner Citations — ${program.name || program.slug}`)] })];

        const section = (label, subItalic, placeholder, text) => {
            children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280 }, children: [new TextRun(label)] }));
            if (subItalic) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: subItalic, italics: true, size: 18, color: '666666' })] }));
            if (text && text.trim()) children.push(...citationParagraphs(text));
            else children.push(new Paragraph({ children: [new TextRun({ text: `[ ${placeholder} ]`, italics: true, color: '888888' })] }));
        };

        for (const c of categories) {
            if (c.winner) section(c.category, c.winner.finalisttext || c.winner.entrant, 'No citation generated yet', c.winner.citation);
            else section(c.category, null, 'No winner recorded — run after winner nomination.', null);
        }
        for (const h of headlines) {
            children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 }, children: [new TextRun(h.category + ' (headline)')] }));
            if (!h.nominees.length) {
                children.push(new Paragraph({ children: [new TextRun({ text: '[ No winners recorded yet — run after winner nomination. ]', italics: true, color: '888888' })] }));
                continue;
            }
            for (const n of h.nominees) {
                children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: n.entrant, bold: true })] }));
                if (n.headlinecitation && n.headlinecitation.trim()) children.push(...citationParagraphs(n.headlinecitation));
                else children.push(new Paragraph({ children: [new TextRun({ text: '[ No citation generated yet ]', italics: true, color: '888888' })] }));
            }
        }

        if (stateAward) {
            children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 },
                children: [new TextRun(`State or Territory Award — ${stateAward.stateFull}`)] }));
            if (stateAward.citation && stateAward.citation.trim()) children.push(...citationParagraphs(stateAward.citation));
            else children.push(new Paragraph({ children: [new TextRun({ text: '[ No citation generated yet ]', italics: true, color: '888888' })] }));
        }

        const doc = new Document({
            creator: 'Jade',
            styles: { default: { document: { run: { font: 'Arial', size: 24 } } } },
            sections: [{ properties: { page: { size: { width: 11906, height: 16838 } } }, children }],
        });
        const buffer = await Packer.toBuffer(doc);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="WinnerCitations_${program.slug}.docx"`);
        res.send(buffer);
    } catch (err) { next(err); }
});

export default router;
