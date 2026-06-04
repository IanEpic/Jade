// routes/tc.js
// Equivalent of tc.cgi.
// Shows the program's entry T&C, with a checkbox to agree before proceeding to formEntry.
//
//   GET /tc?type=approve&cat=X  → show T&C with agree checkbox (step 2 of new entry)
//   GET /tc?type=agreeerror&cat=X → same but with error message
//   GET /tc (no type/cat)       → show T&C with just a home button

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const type    = req.query.type || '';
        const cat     = req.query.cat  || '';

        // If approve/agreeerror but no cat, entries are closed
        if ((type === 'approve' || type === 'agreeerror') && !cat) {
            return res.renderInShell('tc', {
                user, program, mode: 'closed',
                error: false, cat: '',
            });
        }

        res.renderInShell('tc', {
            user,
            program,
            mode:  (type === 'approve' || type === 'agreeerror') ? 'approve' : 'view',
            error: type === 'agreeerror',
            cat,
        });
    } catch (err) {
        next(err);
    }
});

export default router;
