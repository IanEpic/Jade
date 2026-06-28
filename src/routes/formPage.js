// routes/formPage.js

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import UserPage from '../models/UserPage.js';

const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
    if (!req.user?.admin) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        return res.redirect('/home');
    }
    next();
});

// ── POST /formPage/create — inline AJAX create, returns JSON ─────────────────
router.post('/create', async (req, res) => {
    try {
        const program = req.user?.program;
        if (!program) return res.json({ error: 'No program context.' });
        const name = (req.body.name || '').trim();
        if (!name) return res.json({ error: 'Page name required.' });
        const existing = await UserPage.findOne({ where: { programid: program.programid, name } });
        if (existing) return res.json({ error: 'A page with this name already exists.' });
        const page = await UserPage.create({ programid: program.programid, name, html: '', show4user: true, show4judge: true, show4admin: true });
        const slug = req.program?.slug || req.user?.program?.slug;
        return res.json({ userpageid: page.userpageid, editUrl: `/${slug}/home?action=userpages&userpageid=${page.userpageid}` });
    } catch (err) {
        return res.json({ error: err.message || 'Failed to create page.' });
    }
});

// ── GET /formPage — redirect into home framework ─────────────────────────────
router.get('/', (req, res) => res.redirect('/home?action=userpages'));

// ── POST /formPage — save edit ────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
    try {
        const { pageid, name, html, show4user, show4judge, show4admin, withsidebar } = req.body;
        const program = req.program;

        if (!pageid) return res.redirect('/home?action=userpages');

        const trimmedName = (name || '').trim();
        if (!trimmedName) return res.redirect(`/home?action=userpages&userpageid=${pageid}&error=name`);

        const existing = await UserPage.findOne({ where: { programid: program.programid, name: trimmedName } });
        if (existing && existing.userpageid !== parseInt(pageid)) {
            return res.redirect(`/home?action=userpages&userpageid=${pageid}&error=duplicate`);
        }

        await UserPage.update(
            {
                name: trimmedName,
                html: html || '',
                show4user:  show4user  === '1',
                show4judge: show4judge === '1',
                show4admin: show4admin === '1',
                withsidebar: withsidebar === '1',
            },
            { where: { userpageid: parseInt(pageid), programid: program.programid } }
        );

        return res.redirect(`/home?action=userpages&success=1`);
    } catch (err) { next(err); }
});

export default router;
