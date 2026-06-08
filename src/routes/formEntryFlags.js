// routes/formEntryFlags.js
// Admin-only: update operational flags on an entry without touching entry content.
//
// Category override rules:
//   • No existing override → moving to new cat: set originalcatid = categoryid, categoryid = new
//   • Already overridden   → moving to another cat: update categoryid only (keep originalcatid)
//   • Moving back to originalcatid: restore categoryid, clear originalcatid (null)
//   • No change to category: no category fields updated
//
// Supports AJAX: send X-Requested-With: XMLHttpRequest to receive JSON instead of redirect.

import { Router }      from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry           from '../models/Entry.js';

const router = Router();
router.use(requireAuth);

const isAjax = req => req.headers['x-requested-with'] === 'XMLHttpRequest';

router.post('/', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user.admin) return res.status(403).send('Forbidden');

        const { entryid, entryaccepted, entryopen, finalised, overridecatid } = req.body;
        if (!entryid) return isAjax(req) ? res.json({ ok: false }) : res.redirect('/home?action=entrylist');

        const entry = await Entry.findByPk(entryid);
        if (!entry) return isAjax(req) ? res.json({ ok: false }) : res.redirect('/home?action=entrylist');

        const updates = {
            entryaccepted: entryaccepted === 'on' ? 1 : 0,
            entryopen:     entryopen     === 'on' ? 1 : 0,
            finalised:     finalised     === 'on' ? 1 : 0,
        };

        if (overridecatid) {
            const newCatId = parseInt(overridecatid);
            if (newCatId !== entry.categoryid) {
                if (entry.originalcatid && newCatId === entry.originalcatid) {
                    updates.categoryid    = newCatId;
                    updates.originalcatid = null;
                } else if (!entry.originalcatid) {
                    updates.originalcatid = entry.categoryid;
                    updates.categoryid    = newCatId;
                } else {
                    updates.categoryid = newCatId;
                }
            }
        }

        await entry.update(updates);
        await entry.reload();

        if (isAjax(req)) {
            return res.json({
                ok:           true,
                entryid:      entry.entryid,
                entryaccepted: entry.entryaccepted,
                entryopen:    entry.entryopen,
                finalised:    entry.finalised,
                categoryid:   entry.categoryid,
                originalcatid: entry.originalcatid ?? null,
            });
        }
        res.redirect('/home?action=entrylist');
    } catch (err) { next(err); }
});

// ── POST /formEntryFlags/transfer ─────────────────────────────────────────────
// Transfers invoiceid + entryaccepted from source entry to target entry.

router.post('/transfer', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user.admin) return res.status(403).send('Forbidden');

        const { sourceentryid, targetentryid } = req.body;
        if (!sourceentryid || !targetentryid || sourceentryid === targetentryid) {
            return res.redirect('/home?action=entrylist');
        }

        const [source, target] = await Promise.all([
            Entry.findByPk(sourceentryid),
            Entry.findByPk(targetentryid),
        ]);
        if (!source || !target) return res.redirect('/home?action=entrylist');

        await Promise.all([
            target.update({
                invoiceid:     source.invoiceid,
                entryaccepted: source.entryaccepted,
            }),
            source.update({
                invoiceid:     null,
                entryaccepted: 0,
            }),
        ]);

        if (isAjax(req)) {
            return res.json({
                ok:     true,
                source: { entryid: source.entryid, entryaccepted: 0 },
                target: { entryid: target.entryid, entryaccepted: 1 },
            });
        }
        res.redirect('/home?action=entrylist');
    } catch (err) { next(err); }
});

export default router;
