// routes/nominatewildcard.js
// Equivalent of nominatewildcard.cgi
// Judge POST: replaces all wildcard nominations for this judge.
// Form is posted from home/wildcardnomination.pug (but~{categoryid} = entryid, reason~{categoryid}).

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import JudgeCategoryLink                from '../models/JudgeCategoryLink.js';
import JudgeEntryLinkWildcardNomination from '../models/JudgeEntryLinkWildcardNomination.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
    try {
        const user = req.user;

        if (!user.judge) return res.redirect('/home');

        // Delete all existing wildcard nominations for this judge
        await JudgeEntryLinkWildcardNomination.destroy({
            where: { userid: user.userid },
        });

        // Find the categories this judge is assigned to
        const links = await JudgeCategoryLink.findAll({
            where: { userid: user.userid },
        });

        for (const link of links) {
            const entryid = req.body[`but~${link.categoryid}`];
            if (entryid) {
                await JudgeEntryLinkWildcardNomination.create({
                    userid:  user.userid,
                    entryid: parseInt(entryid),
                    reason:  req.body[`reason~${link.categoryid}`] || null,
                });
            }
        }

        res.redirect('/home?action=reviewfinalists&saved=1');

    } catch (err) { next(err); }
});

export default router;
