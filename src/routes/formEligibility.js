// routes/formEligibility.js
// Equivalent of formEligibility.cgi.
//
//   GET  /formEligibility                          → blank new form
//   GET  /formEligibility?eligibilityid=X          → edit form
//   GET  /formEligibility?eligibilityid=X&action=delete → soft-delete, redirect
//   POST /formEligibility (task=reorder)           → update orda, redirect
//   POST /formEligibility                          → save new or edit, redirect

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Eligibility            from '../models/Eligibility.js';
import CategoryEligibilityLink from '../models/CategoryEligibilityLink.js';
import Category               from '../models/Category.js';

const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
    if (!req.user.admin) {
        return res.renderInShell('formEligibility', {
            user: req.user, program: req.user.program, error: 'noaccess',
        });
    }
    next();
});

async function loadCategories(programId) {
    const cats = await Category.findAll({
        where: { programid: programId, deleted: 0 },
        order: [['orda', 'ASC'], ['categoryid', 'ASC']],
    });
    return cats.map(c => c.toJSON());
}

// ── GET ───────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const { eligibilityid, action } = req.query;
        const program = req.user.program;

        if (eligibilityid && action === 'delete') {
            await Eligibility.update({ deleted: 1 }, { where: { eligibilityid } });
            return res.redirect('/home?action=eligibility');
        }

        let eligibility = null;
        let checkedCategoryIds = [];

        if (eligibilityid) {
            eligibility = await Eligibility.findByPk(eligibilityid);
            const links = await CategoryEligibilityLink.findAll({ where: { eligibilityid } });
            checkedCategoryIds = links.map(l => l.categoryid);
        }

        const categories = await loadCategories(program.programid);

        return res.renderInShell('formEligibility', {
            user: req.user,
            program,
            eligibility: eligibility ? eligibility.toJSON() : null,
            categories,
            checkedCategoryIds,
        });
    } catch (err) { next(err); }
});

// ── POST ──────────────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const { task, eligibilityid, eligibilityrule, allcats, categories } = req.body;
        const program = req.user.program;

        // Reorder — fields named like "#<id>" with orda value
        if (task === 'reorder') {
            for (const [key, val] of Object.entries(req.body)) {
                const parts = key.split('#');
                if (parts[1]) {
                    await Eligibility.update({ orda: val }, { where: { eligibilityid: parts[1] } });
                }
            }
            return res.redirect('/home?action=eligibility');
        }

        const catIds = categories
            ? (Array.isArray(categories) ? categories : [categories])
            : [];
        const allcatsVal = allcats ? parseInt(allcats) : 0;

        if (!eligibilityid) {
            // New
            const created = await Eligibility.create({
                programid:       program.programid,
                eligibilityrule,
                allcats:         allcatsVal,
                deleted:         0,
            });
            await Eligibility.update({ orda: created.eligibilityid }, { where: { eligibilityid: created.eligibilityid } });
            for (const catId of catIds) {
                await CategoryEligibilityLink.create({ categoryid: catId, eligibilityid: created.eligibilityid });
            }
        } else {
            // Edit
            await Eligibility.update(
                { eligibilityrule, allcats: allcatsVal },
                { where: { eligibilityid } }
            );
            await CategoryEligibilityLink.destroy({ where: { eligibilityid } });
            for (const catId of catIds) {
                await CategoryEligibilityLink.create({ categoryid: catId, eligibilityid });
            }
        }

        return res.redirect('/home?action=eligibility');
    } catch (err) { next(err); }
});

export default router;
