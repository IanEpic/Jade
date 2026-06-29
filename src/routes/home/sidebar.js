// routes/home/sidebar.js
// Builds the drill-down sidebar panel tree shown on every /home page.
// Returns a dict of panels keyed by name; each panel has { items, back?, backLabel? }.

import { translate } from '../../services/translate.js';
import {
    getCatsOpenForReviewOrNomination,
    getCatsOpenForReviewByJudge,
    getStatsPrograms,
    getCategoriesLedByUser,
    getWinnerNominationCats,
} from '../../queries/homeQueries.js';
import {
    getSimpleEntriesOpenForReview,
    getSimpleEntriesApprovedByReviewer,
    getEntriesToBeJudgedByJudge,
    getEntriesForCommentReview,
} from '../../queries/entryQueries.js';

export async function buildSidebar(user, program, data) {
    const {
        allEntries, entrants, invoices, payments,
        catsOpenForEntries, afeNominees,
        finalistsNotOpen, nonFinalistsNotOpen, userPages,
    } = data;

    // Prefix all internal hrefs with the program slug so the sidebar links
    // work without relying on the client-side rewriter script.
    const base = `/${program.slug}`;
    const url  = (path) => `${base}${path}`;

    // ── Main panel ───────────────────────────────────────────────────────────
    const main = [];
    const addMain = (href, label) => main.push({ href, label });

    if (catsOpenForEntries.length)
        addMain(url('/home?action=newentry'), 'New Entry');

    if (allEntries.length)
        addMain(url('/home?action=entries'), 'My Entries');

    if (entrants.length && catsOpenForEntries.length) {
        const label = await translate(program.programid, 'My Entrants');
        addMain(url('/home?action=entrants'), label);
    }

    if (invoices.length)
        addMain(url('/home?action=invoices'), 'My Invoices');

    if (payments.length)
        addMain(url('/home?action=payments'), 'My Payments');

    if (program.downloadpagehtml)
        addMain(url('/home?action=downloads'), 'Downloads');

    if (afeNominees.length)
        addMain(url('/home?action=favouriteevent'), "Australia's Favourite Event");

    const hasFinalistScores    = program.finalistscoresavailable && finalistsNotOpen.length;
    const hasNonFinalistScores = program.nonfinalistscoresavailable && nonFinalistsNotOpen.length;
    if (hasFinalistScores || hasNonFinalistScores)
        addMain(url('/home?action=scorescomments'), 'Judge Comments');

    if (program.feedbackopen)
        addMain(url('/home?action=feedback'), 'Leave Feedback');

    if (user.judge) {
        // To Judge — only while judging is open on at least one assigned entry.
        const openLinks = await getEntriesToBeJudgedByJudge({ userId: user.userid });
        if (openLinks.length)
            addMain(url('/home?action=tojudge'), 'To Judge');
        // Comments to Revise — entries sent back for comment review; persists even
        // after judging closes so the judge can still revise (comments only).
        const reviseLinks = await getEntriesForCommentReview({ userId: user.userid });
        if (reviseLinks.length)
            addMain(url('/home?action=revisecomments'), 'Comments to Revise');
    }

    // Lead-judge / chairperson oversight of their categories.
    if (user.judge || user.chairperson) {
        const ledCats = await getCategoriesLedByUser({
            userId: user.userid, programId: program.programid, includeAll: !!user.chairperson,
        });
        if (ledCats.length)
            addMain(url('/home?action=leadjudge'), 'Check Judging');
    }

    if (user.viewentries)
        addMain(url('/home?action=entrylist'), 'View Entries');

    if (user.reviewer) {
        const openForReview = await getSimpleEntriesOpenForReview({ programId: program.programid });
        if (openForReview.length)
            addMain(url('/home?action=review'), 'Review Entries');
    }

    if (user.simplejudge) {
        if (!user.onlyjudgepostreview) {
            const openForReview = await getSimpleEntriesOpenForReview({ programId: program.programid });
            if (openForReview.length)
                addMain(url('/home?action=simplejudge'), 'Judge Entries');
        } else {
            const approved = await getSimpleEntriesApprovedByReviewer({ programId: program.programid });
            if (approved.length)
                addMain(url('/home?action=simplejudge'), 'Judge Entries');
        }
    }

    if (user.judge) {
        let reviewCats;
        if (user.chairperson) {
            reviewCats = await getCatsOpenForReviewOrNomination({ programId: program.programid });
        } else {
            // Judged categories OR categories this user leads that are in the
            // finalist-review phase (a lead judge may not be an allocated judge).
            const [judged, led] = await Promise.all([
                getCatsOpenForReviewByJudge({ userId: user.userid }),
                getCategoriesLedByUser({ userId: user.userid, programId: program.programid }),
            ]);
            reviewCats = [...judged, ...led.filter(c => c.finalistreview)];
        }
        if (reviewCats.length)
            addMain(url('/home?action=reviewfinalists'), 'Review Nominees');
    }

    // Winner nomination: lead judges (their led categories), chairpersons & admins (all).
    if (user.judge || user.chairperson || user.admin) {
        const winnerCats = (user.chairperson || user.admin)
            ? await getWinnerNominationCats({ programId: program.programid })
            : await getWinnerNominationCats({ programId: program.programid, leadUserId: user.userid });
        if (winnerCats.length)
            addMain(url('/home?action=nominatewinner'), 'Winner Nomination');
    }

    // Admin summary of finalist-review nominations — shown while finalist review is open.
    if (user.admin) {
        const reviewNomCats = await getCatsOpenForReviewOrNomination({ programId: program.programid });
        if (reviewNomCats.length)
            addMain(url('/home?action=reviewnominations'), 'Review Nominations');
    }

    for (const page of userPages) {
        if (
            (page.show4user) ||
            (page.show4judge && (user.judge || user.simplejudge)) ||
            (page.show4admin && user.admin)
        ) {
            main.push({ href: url(`/home?action=userpage&pid=${page.userpageid}`), label: page.name });
        }
    }


    const panels = { main: { items: main } };

    // ── Admin panels (admin users only) ──────────────────────────────────────
    if (user.admin) {
        main.push({ submenu: 'admin', label: 'Admin' });

        const judgingItems = [{ href: url('/home?action=judges'), label: 'Judges' }];
        if (!program.usesimplejudging)
            judgingItems.push({ href: url('/home?action=allocatejudges'), label: 'Allocate Judges' });
        judgingItems.push({ href: url('/home?action=emailjudges'), label: 'Email Judges' });
        if (!program.usesimplejudging)
            judgingItems.push({ href: url('/home?action=judgecheck'), label: 'Check Judging' });
        if (!program.usesimplejudging)
            judgingItems.push({ href: url('/home?action=reviewcomments'), label: 'Review Comments' });
        if (!program.usesimplejudging)
            judgingItems.push({ href: url('/home?action=finalistlist'), label: 'National Finalists' });
        judgingItems.push({ href: url('/home?action=headlinewinners'), label: 'Headline Winners' });

        panels.admin = {
            back: 'main', backLabel: '< Main Menu',
            items: [
                { href: url('/home?action=program'), label: 'Program' },
                { href: url('/home?action=theme'), label: 'Theme' },
                { submenu: 'setup',    label: 'Setup' },
                { submenu: 'judging',  label: 'Judging' },
                { submenu: 'airules',  label: 'AI Rules' },
                { submenu: 'adminpay', label: 'Payments' },
                { submenu: 'tools',    label: 'Tools' },
                { submenu: 'reports',  label: 'Reports' },
            ],
        };
        panels.setup = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: url('/home?action=discounts'),            label: 'Discounts' },
                { href: url('/home?action=categorytypes'),        label: 'Category Types' },
                { href: url('/home?action=categories'),           label: 'Categories' },
                { href: url('/home?action=eligibility'),          label: 'Eligibility' },
                { href: url('/home?action=questions&type=entry'), label: 'Questions' },
                { href: url('/home?action=userpages'),            label: 'User Pages' },
            ],
        };
        panels.judging = {
            back: 'admin', backLabel: '< Admin',
            items: judgingItems,
        };
        panels.airules = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: url('/home?action=finalisttextrules'),  label: 'Finalist Text Rules' },
                { href: url('/home?action=citationrules'),       label: 'Citation Rules' },
                { href: url('/home?action=judgingguidelines'),  label: 'Judging Guidelines' },
            ],
        };
        panels.adminpay = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: url('/home?action=receivepayment'), label: 'Receive Payment' },
                { href: '#', label: 'Create Invoice' },
                { href: '#', label: 'Issue Refund' },
            ],
        };
        panels.tools = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: url('/home?action=finalisttextadmin'), label: 'Finalist Text' },
                { href: url('/home?action=calcfinalscores'), label: 'Calc Final Scores' },
                { href: url('/home?action=statefinalists'), label: 'Get State Finalists' },
                { href: url('/home?action=beststate'), label: 'Calc Best State' },
                { href: url('/home?action=voscript'), label: 'Finalist VO Script' },
                { href: url('/home?action=citations'), label: 'Citations' },
                { href: url('/home?action=prexport'), label: 'Export PR Info' },
                { href: url('/home?action=cqdocs'), label: 'Category Documents' },
            ],
        };
        const statsPrograms = await getStatsPrograms();
        const inStats = statsPrograms.some(p => p.progid === program.programid);
        const reportsItems = [];
        if (inStats) {
            reportsItems.push({ href: url('/home?action=stats'),       label: 'Stats' });
            reportsItems.push({ href: url('/home?action=statsconfig'), label: 'Stats Config' });
        }
        reportsItems.push({ href: url('/home?action=activeusers'),        label: 'Active Users' });
        reportsItems.push({ href: url('/home?action=allentrydata'),       label: 'All Entry Data' });
        reportsItems.push({ href: url('/home?action=resultsreport'),       label: 'Results' });
        reportsItems.push({ href: url('/home?action=finalistsreport'),     label: 'Finalist Release' });
        reportsItems.push({ href: url('/home?action=entriesbycategory'), label: 'Entries by Category' });
        reportsItems.push({ href: url('/home?action=finalisednotpaid'), label: 'Finalised Unpaid' });
        reportsItems.push({ href: url('/home?action=paidnotfinalised'), label: 'Paid Unfinalised' });
        panels.reports = {
            back: 'admin', backLabel: '< Admin',
            items: reportsItems,
        };
    }

    return panels;
}
