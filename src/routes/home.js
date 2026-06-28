// routes/home.js
// Express equivalent of home.cgi.
//
// Single GET /home route loads common data, builds the sidebar, dispatches
// the ?action= to the appropriate handler module, then renders the shell.
//
// Handler modules return either a content object or undefined (no match).
// Handlers that do an internal redirect return null; the router returns early.
//
// Role priority for action dispatch:
//   shared (all roles) → admin → judge → default welcome

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getCatsOpenForJudgingByJudge } from '../queries/homeQueries.js';
import { renderFinalistText } from '../services/finalistResults.js';

import { buildSidebar }                                   from './home/sidebar.js';
import { buildMenuButtons, loadCommonData }   from './home/homeHelpers.js';
import { getLinkedPrograms }                  from '../services/auth.js';
import UserCredential                         from '../models/UserCredential.js';
import { handleSharedAction } from './home/sharedActions.js';
import { handleAdminAction }  from './home/adminActions.js';
import { handleJudgeAction }  from './home/judgeActions.js';

const router = Router();
router.use(requireAuth);

// Welcome text shown when no ?action= matches
async function getDefaultContent(user, program, data) {
    const { acceptedEntries } = data;
    if (user.judge) {
        const catsForJudging = await getCatsOpenForJudgingByJudge({ userId: user.userid });
        if (program.judgingopendefault || catsForJudging.length)
            return { view: 'home/welcome', text: program.judgewelcometext || '' };
    }
    if (user.reviewer || user.simplejudge)
        return { view: 'home/welcome', text: program.judgewelcometext || '' };
    if (user.admin)
        return { view: 'home/welcome', text: program.adminwelcometext || '' };
    if (program.finalistlistavailable && acceptedEntries.length)
        return { view: 'home/finalisttext', html: renderFinalistText(acceptedEntries, program), program };
    return { view: 'home/welcome', text: program.standardwelcometext || '' };
}

// ── POST /home — only used by admin actions that need form submission ──────────

router.post('/', requireAuth, async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const action  = req.query.action || '';
        if (!user.admin) return res.redirect(`/${program.slug}/home`);
        const content = await handleAdminAction(action, req, res, program, user);
        if (content === null) return; // redirect already sent
        res.redirect(`/${program.slug}/home?action=${action}`);
    } catch (err) { next(err); }
});

// ── GET /home ─────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const action  = req.query.action || '';

        const [data, credential] = await Promise.all([
            loadCommonData(user),
            user.credentialid ? UserCredential.findByPk(user.credentialid) : null,
        ]);
        const pendingSetup = !!(credential && credential.activationtoken);

        // ── Top menu buttons ────────────────────────────────────────────────
        const menuButtons = buildMenuButtons(user, program.slug);

        // ── Sidebar ─────────────────────────────────────────────────────────
        const sidebarMenus = await buildSidebar(user, program, data);

        // ── Action dispatch ─────────────────────────────────────────────────
        let content = await handleSharedAction(action, req, res, program, user, data);
        if (content === null) return;  // redirect sent

        if (content === undefined && user.admin) {
            content = await handleAdminAction(action, req, res, program, user);
            if (content === null) return;
        }

        if (content === undefined && (user.judge || user.chairperson)) {
            content = await handleJudgeAction(action, req, res, program, user);
        }

        if (!content?.view) {
            content = await getDefaultContent(user, program, data);
        }

        // ── Render ──────────────────────────────────────────────────────────
        res.renderInShell('home', {
            user,
            program,
            menuButtons,
            sidebarMenus,
            content,
            pendingSetup,
            isEmulating:      !!req.session.emulateUserId,
            action,
            linkedPrograms:   req.session.emulateUserId
                ? await getLinkedPrograms(user.credentialid)
                : (req.session.linkedPrograms || []),
            currentProgramId: program.programid,
        });

    } catch (err) {
        next(err);
    }
});

export default router;
