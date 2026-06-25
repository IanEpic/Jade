// routes/nominatewinner.js
// Equivalent of nominatewinner.cgi
// Lead judge / admin POST: clears winner nominations in the relevant categories,
// then records the new ones. Posted from home/nominatewinner.pug (but~{categoryid} = entryid).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry    from '../models/Entry.js';
import Category from '../models/Category.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user = req.user;

        // Categories this user may set a winner for, in the winner-nomination phase:
        //   • admin → every category in the program
        //   • lead judge → only the categories they lead
        // (Chairpersons are read-only and never POST here.)
        const where = user.admin
            ? { programid: user.programid, winnernomination: true, deleted: false }
            : { userid: user.userid,       winnernomination: true, deleted: false };
        const cats = await Category.findAll({ where });

        if (!cats.length) return res.redirect('/home?action=nominatewinner');
        const catIds = cats.map(c => c.categoryid);

        // Clear existing winner nominations in those categories, then apply the new
        // ones from the form (but~{categoryid} = entryid).
        await Entry.update(
            { nominated: false },
            { where: { categoryid: catIds, nominated: true } }
        );
        for (const cat of cats) {
            const entryid = req.body[`but~${cat.categoryid}`];
            if (entryid) {
                await Entry.update(
                    { nominated: true },
                    { where: { entryid: parseInt(entryid), categoryid: cat.categoryid } }
                );
            }
        }

        res.redirect('/home?action=nominatewinner&saved=1');

    } catch (err) { next(err); }
});

export default router;
