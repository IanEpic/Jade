// routes/formPage.js
// Equivalent of formPage.cgi.
//
//   GET  /formPage                       → blank new form
//   GET  /formPage?pageid=X              → edit form
//   GET  /formPage?pageid=X&action=delete → hard-delete, redirect home
//   POST /formPage                       → save new or edit, redirect home

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import UserPage from '../models/UserPage.js';

const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
    if (!req.user.admin) {
        return res.renderInShell('formPage', {
            user: req.user, program: req.user.program, error: 'noaccess',
        });
    }
    next();
});

// ── GET ───────────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const { pageid, action } = req.query;
        const program = req.user.program;

        if (pageid && action === 'delete') {
            await UserPage.destroy({ where: { userpageid: pageid } });
            return res.redirect('/home');
        }

        let page = null;
        if (pageid) {
            page = await UserPage.findByPk(pageid);
        }

        return res.renderInShell('formPage', {
            user: req.user,
            program,
            page: page ? page.toJSON() : null,
        });
    } catch (err) { next(err); }
});

// ── POST ──────────────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const { pageid, name, html } = req.body;
        const program = req.user.program;

        if (!pageid) {
            // New — check uniqueness
            const existing = await UserPage.findOne({ where: { programid: program.programid, name } });
            if (existing) {
                return res.renderInShell('formPage', {
                    user: req.user, program, page: null,
                    error: 'duplicate', prefill: { name, html },
                });
            }
            await UserPage.create({ programid: program.programid, name, html });
        } else {
            // Edit — allow keeping own name, reject if taken by another page
            const existing = await UserPage.findOne({ where: { programid: program.programid, name } });
            if (existing && existing.userpageid !== parseInt(pageid)) {
                const page = await UserPage.findByPk(pageid);
                return res.renderInShell('formPage', {
                    user: req.user, program,
                    page: page ? page.toJSON() : null,
                    error: 'duplicate',
                });
            }
            await UserPage.update({ name, html }, { where: { userpageid: pageid } });
        }

        return res.redirect('/home');
    } catch (err) { next(err); }
});

export default router;
