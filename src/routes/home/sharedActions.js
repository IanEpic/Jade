// routes/home/sharedActions.js
// Action handlers available to all roles (entrant, judge, admin).
//
// Returns:
//   content object  → caller renders it
//   null            → redirect already sent
//   undefined       → action not matched here

import { translate }        from '../../services/translate.js';
import { currency, PASSWORD_RULES } from '../../services/helpers.js';
import { getLinkedPrograms } from '../../services/auth.js';
import Address          from '../../models/Address.js';
import { loadAddressesForCredential } from '../../services/addressService.js';
import UserCredential   from '../../models/UserCredential.js';
import {
    getAllEntriesForProgram,
    getEntriesOpenByOverride,
    getPaymentsForInvoice,
    getFinalScoreForEntry,
    getCriteriaScoresForEntry,
    getJudgeCommentsForEntry,
    getAllCategories,
    getUserPageById,
    getJudgeCommentsForProgram,
} from '../../queries/homeQueries.js';
import {
    getSimpleEntriesOpenForReview,
    getSimpleEntriesApprovedByReviewer,
} from '../../queries/entryQueries.js';

export async function handleSharedAction(action, req, res, program, user, data) {

    if (action === 'entrylist' && (user.admin || user.viewentries)) {
        const [entries, categories] = await Promise.all([
            getAllEntriesForProgram({ programId: program.programid }),
            getAllCategories({ programId: program.programid }),
        ]);
        return { view: 'home/entrylist', entries, categories, translate };
    }

    if (action === 'entries') {
        const overrideOpen = await getEntriesOpenByOverride({ userId: user.userid });
        return {
            view:               'home/entries',
            entries:            data.allEntries,
            catsOpenForEntries: data.catsOpenForEntries,
            overrideOpen,
            program,
            user,
            translate,
            currency,
        };
    }

    if (action === 'newentry') {
        return {
            view:    'home/newentry',
            cats:    data.catsOpenForEntries,
            program,
            currency,
        };
    }

    if (action === 'entrants') {
        const [overrideOpen, addresses, nameLabel, typeLabel, abnLabel, createLabel, editLabel] = await Promise.all([
            getEntriesOpenByOverride({ userId: user.userid }),
            user.credentialid ? loadAddressesForCredential(user.credentialid) : [],
            translate(program.programid, 'Entrant Name'),
            translate(program.programid, 'Entrant Type'),
            translate(program.programid, 'Entrant ABN'),
            translate(program.programid, 'Create Entrant'),
            translate(program.programid, 'Edit Entrant'),
        ]);
        return {
            view:               'home/entrants',
            entrants:           data.entrants,
            catsOpenForEntries: data.catsOpenForEntries,
            overrideOpen,
            addresses,
            nameLabel, typeLabel, abnLabel, createLabel, editLabel,
            program,
            translate,
        };
    }

    if (action === 'invoices') {
        const invoicesWithPayments = await Promise.all(
            data.invoices.map(async inv => {
                const pmts = await getPaymentsForInvoice({ invoiceId: inv.invoiceid });
                const paid = pmts.reduce((sum, p) => sum + (parseFloat(p.allocatedamount) || 0), 0);
                return { ...inv, paid, balance: (inv.totalamt || 0) - paid };
            })
        );
        const overrideOpen = await getEntriesOpenByOverride({ userId: user.userid });
        return {
            view:               'home/invoices',
            invoices:           invoicesWithPayments,
            catsOpenForEntries: data.catsOpenForEntries,
            overrideOpen,
            currency,
        };
    }

    if (action === 'payments') {
        return {
            view:     'home/payments',
            payments: data.payments,
            program,
            currency,
        };
    }

    if (action === 'downloads') {
        return { view: 'home/downloads', html: program.downloadpagehtml || '' };
    }

    if (action === 'userpage') {
        const page = await getUserPageById({ pageId: req.query.pid });
        return { view: 'home/userpage', html: page?.html || '' };
    }

    if (action === 'feedback') {
        return { view: 'home/feedback', program, user };
    }

    if (action === 'finalists' && !user.feedbackleft) {
        return { view: 'home/feedback', program, user };
    }

    if (action === 'finalists' && user.feedbackleft) {
        return { view: 'home/finalisttext', entries: data.acceptedEntries, program };
    }

    if (action === 'scorescomments') {
        const scoredEntries = [];
        if (program.finalistscoresavailable)    scoredEntries.push(...data.finalistsNotOpen);
        if (program.nonfinalistscoresavailable) scoredEntries.push(...data.nonFinalistsNotOpen);
        const entriesWithData = await Promise.all(
            scoredEntries.map(async e => {
                const finalScore      = await getFinalScoreForEntry({ entryId: e.entryid });
                const criteriaScores  = finalScore ? await getCriteriaScoresForEntry({ entryId: e.entryid }) : [];
                const comments        = await getJudgeCommentsForEntry({ entryId: e.entryid });
                return { ...e, finalScore, criteriaScores, comments };
            })
        );
        return { view: 'home/scorescomments', entries: entriesWithData, program, currency };
    }

    if (action === 'catcost') {
        const cats = await getAllCategories({ programId: program.programid });
        return { view: 'home/catcost', cats, program, currency };
    }

    if (action === 'favouriteevent') {
        return {
            view:        'home/favouriteevent',
            afeNominees: data.afeNominees,
            submitted:   req.query.submit || '',
        };
    }

    if (action === 'tc' && !user.judge) {
        return { view: 'home/tc', program };
    }

    if (action === 'help' && !user.judge) {
        return { view: 'home/help', program };
    }

    if ((action === 'simplejudge' && user.simplejudge) ||
        (action === 'review'      && user.reviewer)) {
        const isReview = action === 'review';
        const entries = isReview
            ? await getSimpleEntriesOpenForReview({ programId: program.programid })
            : await getSimpleEntriesApprovedByReviewer({ programId: program.programid });
        const judgeComments = await getJudgeCommentsForProgram({ programId: program.programid });
        return {
            view:         'home/simplereviewjudge',
            title:        isReview ? 'Review Entries' : 'Entries Approved by Reviewer',
            entries,
            judgeComments,
            user,
            translate,
        };
    }

    if (action === 'profile') {
        const [addresses, credential] = await Promise.all([
            user.credentialid ? loadAddressesForCredential(user.credentialid) : [],
            user.credentialid ? UserCredential.findByPk(user.credentialid) : null,
        ]);
        const targetUser = {
            ...user.toJSON ? user.toJSON() : { ...user },
            email:             credential?.email             || '',
            firstname:         credential?.firstname         || '',
            lastname:          credential?.lastname          || '',
            organisation:      credential?.organisation      || '',
            telephone:         credential?.telephone         || '',
            mobile:            credential?.mobile            || '',
            postaladdressid:   credential?.postaladdressid   || null,
        };
        return {
            view:            'home/user-edit',
            targetUser,
            operator:        user,
            addresses,
            categories:      [],
            passwordRules:   PASSWORD_RULES,
            targetActivated: true,
            hasSetupToken:   false,
            isAdmin:         false,
            error:           req.query.error || null,
            saved:           req.query.saved === '1',
            sent:            false,
        };
    }

    if (action === 'switchProgram') {
        // When emulating, look up programs for the emulated user's credential,
        // not the admin's session linkedPrograms.
        const linkedPrograms = req.session.emulateUserId
            ? await getLinkedPrograms(user.credentialid)
            : (req.session.linkedPrograms || []);
        return {
            view:             'home/switchProgram',
            linkedPrograms,
            currentProgramId: program.programid,
        };
    }

    return undefined;
}
