// routes/formQuestion.js
// Equivalent of formQuestion.cgi + formInputOption.cgi
// Admin-only: create/edit/delete questions and their input options.
// Questions are always questiontype='entry'.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import Question             from '../models/Question.js';
import InputOption          from '../models/InputOption.js';
import Category             from '../models/Category.js';
import CategoryQuestionLink from '../models/CategoryQuestionLink.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCategories(programid) {
    return Category.findAll({
        where: { programid, deleted: false },
        order: [['orda', 'ASC'], ['categoryid', 'ASC']],
    });
}

async function getLinkedCategoryIds(questionid) {
    const links = await CategoryQuestionLink.findAll({ where: { questionid } });
    return new Set(links.map(l => l.categoryid));
}

async function getAddressQuestions(programid, questiontype, beforeOrda = null) {
    const all = await Question.findAll({
        where: { programid, questiontype, inputtype: 'address', deleted: false },
        order: [['orda', 'ASC']],
    });
    return beforeOrda === null ? all : all.filter(q => q.orda < beforeOrda);
}

// ── GET /formQuestion ─────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const { questionid, action, task } = req.query;

        // ── Delete question ──
        if (action === 'delete' && questionid) {
            await Question.update({ deleted: true }, { where: { questionid: parseInt(questionid) } });
            return res.redirect('/home?action=questions&type=entry');
        }

        // ── Delete input option (was formInputOption.cgi?action=delete) ──
        if (action === 'deleteoption' && req.query.inputoptionid) {
            const opt = await InputOption.findByPk(parseInt(req.query.inputoptionid));
            if (opt) {
                await opt.update({ deleted: true });
                return res.redirect(`/formQuestion?questionid=${opt.questionid}`);
            }
            return res.redirect('/home?action=questions&type=entry');
        }

        // ── Reorder questions ──
        if (task === 'reorder') {
            for (const [key, val] of Object.entries(req.query)) {
                const parts = key.split('#');
                if (parts[1]) {
                    await Question.update(
                        { orda: parseFloat(val) },
                        { where: { questionid: parseInt(parts[1]) } }
                    );
                }
            }
            return res.redirect('/home?action=questions&type=entry');
        }

        const categories = await getCategories(program.programid);

        if (questionid) {
            const question = await Question.findByPk(parseInt(questionid));
            if (!question) return next(Object.assign(new Error('Question not found'), { status: 404 }));

            const [inputoptions, linkedCatIds, addressQuestions] = await Promise.all([
                InputOption.findAll({ where: { questionid: question.questionid, deleted: false }, order: [['orda', 'ASC']] }),
                getLinkedCategoryIds(question.questionid),
                getAddressQuestions(program.programid, question.questiontype, question.orda),
            ]);

            return res.renderInShell('formQuestion', {
                user, program, question, inputoptions,
                categories: categories.map(c => ({ ...c.toJSON(), linked: linkedCatIds.has(c.categoryid) })),
                addressQuestions,
                isNew: false,
            });
        }

        // New question form
        const addressQuestions = await getAddressQuestions(program.programid, 'entry');
        return res.renderInShell('formQuestion', {
            user, program, question: null, inputoptions: [],
            categories: categories.map(c => ({ ...c.toJSON(), linked: false })),
            addressQuestions,
            isNew: true,
            inputtype: req.query.type || 'textfield',
        });

    } catch (err) { next(err); }
});

// ── POST /formQuestion ────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const body    = req.body;
        const questionid = body.questionid ? parseInt(body.questionid) : null;

        const fields = {
            questiontext:       body.questiontext       || '',
            description:        body.description        || '',
            tip:                body.tip                || '',
            inputtype:          body.inputtype          || 'textfield',
            inputwidth:         body.inputwidth         || '',
            inputheight:        body.inputheight        || '',
            maxsize:            body.maxsize            ? parseInt(body.maxsize)   : null,
            cols:               body.cols               ? parseInt(body.cols)      : null,
            addressaboveoption: body.addressaboveoption ? parseInt(body.addressaboveoption) : 0,
            allcats:            body.allcats            ? 1 : 0,
            omitforjudging:     body.omitforjudging     ? 1 : 0,
            captionlabel:       ['image','video'].includes(body.inputtype) ? (body.captionlabel || '') : '',
            required:           0,
            page1:              0,
        };

        // Collect submitted category ids
        const submittedCatIds = Object.keys(body)
            .filter(k => k.startsWith('cat~'))
            .map(k => parseInt(k.slice(4)));

        if (!questionid) {
            // ── New question ──
            const question = await Question.create({
                ...fields,
                programid:    program.programid,
                questiontype: 'entry',
                deleted:      false,
            });
            await question.update({ orda: question.questionid });

            for (const categoryid of submittedCatIds) {
                await CategoryQuestionLink.create({ categoryid, questionid: question.questionid });
            }

            await saveNewOptions(question.questionid, body);

        } else {
            // ── Edit question ──
            const question = await Question.findByPk(questionid);
            await question.update({ ...fields, questiontype: 'entry' });

            // Replace category links
            await CategoryQuestionLink.destroy({ where: { questionid } });
            for (const categoryid of submittedCatIds) {
                await CategoryQuestionLink.create({ categoryid, questionid });
            }

            // Reorder + rename existing options (keys like "io123" and "#123")
            const existingOpts = await InputOption.findAll({ where: { questionid, deleted: false } });
            for (const opt of existingOpts) {
                const nameVal = body[`io${opt.inputoptionid}`];
                const ordaVal = body[`#${opt.inputoptionid}`];
                if (nameVal !== undefined || ordaVal !== undefined) {
                    await opt.update({
                        name: nameVal !== undefined ? nameVal : opt.name,
                        orda: ordaVal !== undefined ? parseFloat(ordaVal) : opt.orda,
                    });
                }
            }

            await saveNewOptions(questionid, body);
        }

        return res.redirect(`/home?action=questions&type=entry&success=1`);

    } catch (err) { next(err); }
});

async function saveNewOptions(questionid, body) {
    for (let i = 1; i <= 5; i++) {
        const val = (body[`option${i}`] || '').trim();
        if (val) {
            const opt = await InputOption.create({ questionid, name: val, deleted: false });
            await opt.update({ orda: opt.inputoptionid });
        }
    }
}

export default router;
