// routes/home/sidebar.js
// Builds the drill-down sidebar panel tree shown on every /home page.
// Returns a dict of panels keyed by name; each panel has { items, back?, backLabel? }.

import { translate } from '../../services/translate.js';
import {
    getEntriesAssignedToJudge,
    getCatsOpenForReviewOrNomination,
    getCatsOpenForReviewByJudge,
    getStatsPrograms,
} from '../../queries/homeQueries.js';
import {
    getSimpleEntriesOpenForReview,
    getSimpleEntriesApprovedByReviewer,
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
        const openLinks = await getEntriesAssignedToJudge({ userId: user.userid });
        if (openLinks.length)
            addMain(url('/home?action=tojudge'), 'To Judge');
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
        const reviewCats = user.chairperson
            ? await getCatsOpenForReviewOrNomination({ programId: program.programid })
            : await getCatsOpenForReviewByJudge({ userId: user.userid });
        if (reviewCats.length)
            addMain(url('/home?action=reviewfinalists'), 'Review Nominees');
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

        panels.admin = {
            back: 'main', backLabel: '< Main Menu',
            items: [
                { href: url('/home?action=program'), label: 'Program' },
                { submenu: 'setup',    label: 'Setup' },
                { submenu: 'judging',  label: 'Judging' },
                { submenu: 'adminpay', label: 'Payments' },
                { submenu: 'tools',    label: 'Tools' },
                { submenu: 'reports',  label: 'Reports' },
            ],
        };
        panels.setup = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: url('/home?action=discounts'),            label: 'Discounts' },
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
        panels.adminpay = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: '#', label: 'Receive Payment' },
                { href: '#', label: 'Create Invoice' },
                { href: '#', label: 'Issue Refund' },
            ],
        };
        panels.tools = {
            back: 'admin', backLabel: '< Admin',
            items: [
                { href: '#', label: 'Export PR Info' },
                { href: url('/home?action=calcfinalscores'), label: 'Calc Final Scores' },
                { href: '#', label: 'Create Category' },
            ],
        };
        const statsPrograms = await getStatsPrograms();
        const inStats = statsPrograms.some(p => p.progid === program.programid);
        const reportsItems = [];
        if (inStats) {
            reportsItems.push({ href: url('/home?action=stats'),       label: 'Stats' });
            reportsItems.push({ href: url('/home?action=statsconfig'), label: 'Stats Config' });
        }
        reportsItems.push({ href: url('/home?action=activeusers'), label: 'Active Users' });
        reportsItems.push({ href: url('/home?action=finalisednotpaid'), label: 'Finalised Unpaid' });
        reportsItems.push({ href: url('/home?action=paidnotfinalised'), label: 'Paid Unfinalised' });
        panels.reports = {
            back: 'admin', backLabel: '< Admin',
            items: reportsItems,
        };
    }

    return panels;
}
