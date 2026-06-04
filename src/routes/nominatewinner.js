// routes/nominatewinner.js
// Equivalent of nominatewinner.cgi
// Lead judge POST: clears all their winner nominations, then records the new ones.
// Form is posted from home/reviewfinalists.pug (but~{categoryid} = entryid).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry    from '../models/Entry.js';
import Category from '../models/Category.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user = req.user;

        if (!user.judge) return res.redirect('/home');

        // Find all categories where this user is the lead judge
        const leadCats = await Category.findAll({
            where: { userid: user.userid, deleted: false },
        });
        const leadCatIds = leadCats.map(c => c.categoryid);

        if (leadCatIds.length) {
            // Clear all existing nominations in those categories
            await Entry.update(
                { nominated: false },
                { where: { categoryid: leadCatIds, nominated: true } }
            );

            // Apply the new nominations from the form (but~{categoryid} = entryid)
            for (const cat of leadCats) {
                const entryid = req.body[`but~${cat.categoryid}`];
                if (entryid) {
                    await Entry.update(
                        { nominated: true },
                        { where: { entryid: parseInt(entryid) } }
                    );
                }
            }
        }

        res.redirect('/home?action=reviewfinalists');

    } catch (err) { next(err); }
});

export default router;
