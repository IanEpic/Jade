// routes/home/homeHelpers.js
// Shared helpers used by home.js and any other route that needs to render
// inside the sidebar layout (e.g. formPaymentOptions, formInvoice).

import {
    getAllEntriesByUser,
    getAcceptedEntriesByUser,
    getEntrantsByUser,
    getInvoicesByUser,
    getPaymentsByUser,
    getCategoriesOpenForEntries,
    getUserPagesByProgram,
} from '../../queries/homeQueries.js';
import {
    getAfeNomineesByUser,
    getFinalistsNotOpenByUser,
    getNonFinalistsNotOpenByUser,
} from '../../queries/entryQueries.js';
import { buildSidebar } from './sidebar.js';

// ── Menu buttons (hardcoded per role) ─────────────────────────────────────────

export function buildMenuButtons(user, slug) {
    const url = (path) => `/${slug}/${path}`;
    if (user.admin) {
        return [
            { url: url('formUser'),              text: 'My Profile' },
            { url: url('formCategory'),          text: 'New Category' },
            { url: url('formPaymentOptions'),    text: 'Make a Payment' },
            { url: url('home?action=entrylist'), text: 'View Entries' },
            { url: url('home?action=users'),     text: 'Manage Users' },
            { url: url('logout'),                text: 'Logout' },
        ];
    }
    if (user.judge || user.viewentries) {
        return [
            { url: url('formUser'),                 text: 'My Profile' },
            { url: url('home?action=contacts'),     text: 'Key Contacts' },
            { url: url('formJudgeSuggestion'),      text: 'Make a Comment' },
            { url: url('home?action=tc'),           text: 'Terms & Conditions' },
            { url: url('home?action=help'),         text: 'Help' },
            { url: url('logout'),                   text: 'Logout' },
        ];
    }
    return [
        { url: url('logout'),                   text: 'Logout' },
        { url: url('formUser'),                 text: 'My Profile' },
        { url: url('home?action=catcost'),      text: 'Categories & Costs' },
        { url: url('home?action=tc'),           text: 'Terms & Conditions' },
        { url: url('formPaymentOptions'),       text: 'Make a Payment' },
        { url: url('home?action=help'),         text: 'Help' },
    ];
}

// ── Common data loader ────────────────────────────────────────────────────────

export async function loadCommonData(user) {
    const programId = user.programid;
    const userId    = user.userid;
    const [
        allEntries, acceptedEntries, entrants,
        invoices, payments, catsOpenForEntries,
        afeNominees, finalistsNotOpen, nonFinalistsNotOpen, userPages,
    ] = await Promise.all([
        getAllEntriesByUser({ userId }),
        getAcceptedEntriesByUser({ userId }),
        getEntrantsByUser({ userId }),
        getInvoicesByUser({ userId }),
        getPaymentsByUser({ userId }),
        getCategoriesOpenForEntries({ programId }),
        getAfeNomineesByUser({ userId }),
        getFinalistsNotOpenByUser({ userId }),
        getNonFinalistsNotOpenByUser({ userId }),
        getUserPagesByProgram({ programId }),
    ]);
    return {
        allEntries, acceptedEntries, entrants,
        invoices, payments, catsOpenForEntries,
        afeNominees, finalistsNotOpen, nonFinalistsNotOpen, userPages,
    };
}

// ── Top description text ──────────────────────────────────────────────────────

export function getTopText(user, program, hasFinalists) {
    if (hasFinalists && !user.judge && !user.admin) return program.finalistdescriptiontext || '';
    return '';
}

// ── renderInHome ──────────────────────────────────────────────────────────────
// Renders any content view inside the full sidebar layout.
// `view`   — string matching a `when` case in home-content.pug
// `locals` — page-specific template locals merged into the top level
//            (the content pugs read these directly, e.g. `mode`, `invoice`)

export async function renderInHome(req, res, view, locals) {
    const user    = req.user;
    const program = req.program;
    const data    = await loadCommonData(user);
    const [sidebarMenus, menuButtons] = await Promise.all([
        buildSidebar(user, program, data),
        Promise.resolve(buildMenuButtons(user, program.slug)),
    ]);
    res.renderInShell('home', {
        user,
        program,
        topText:          getTopText(user, program, data.finalistsNotOpen.length > 0),
        menuButtons,
        sidebarMenus,
        content:          { view },
        isEmulating:      !!req.session.emulateUserId,
        linkedPrograms:   req.session.linkedPrograms || [],
        currentProgramId: program.programid,
        ...locals,
    });
}
