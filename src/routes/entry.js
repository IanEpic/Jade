// routes/entry.js
// Express equivalent of entry.cgi
//
// The Perl script has one URL that does everything based on params/cookies.
// Here we split into explicit routes which makes the logic much easier to follow:
//
//   GET  /entry/new?categoryid=X    → show blank entry form (was: !$INPUT{submit} + tc.cgi agree check)
//   GET  /entry/:id/edit            → show edit form        (was: !$INPUT{submit} && $entry)
//   POST /entry                     → create new entry      (was: $INPUT{submit} eq "Save & ...")
//   POST /entry/:id                 → update entry          (was: same block, $entry exists)
//   POST /entry/:id/delete          → soft delete           (was: param('action') eq 'delete')

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry from '../models/Entry.js';
import Category from '../models/Category.js';
import Entrant from '../models/Entrant.js';
import Address from '../models/Address.js';
import { getEntrycost } from '../services/pricing.js';

const router = Router();

// All entry routes require a logged-in user
router.use(requireAuth);

// ─────────────────────────────────────────────
// GET /entry/new?categoryid=X
// Equivalent of: $INPUT{submit} eq "Proceed to Entry" && $INPUT{agree} eq "ON"
// The T&C agreement check is now handled before this page (in tc route),
// so arriving here means the user has already agreed.
// ─────────────────────────────────────────────
router.get('/new', async (req, res, next) => {
    try {
        const { categoryid } = req.query;
        if (!categoryid) return res.redirect('/');

        const category = await Category.findByPk(categoryid, {
            include: ['criteria', 'categoryeligibilitylinks'],
        });
        if (!category) return res.redirect('/');

        const entrants = await Entrant.findAll({
            where: { userid: req.user.userid, deleted: 0 },
        });
        const addresses = await Address.findAll({
            where: { userid: req.user.userid },
        });

        res.render('entry/form', {
            mode: 'new',
            category,
            entrants,
            addresses,
            user: req.user,
            entry: null,
            errors: [],
        });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// GET /entry/:id/edit
// Equivalent of: !$INPUT{submit} && $entry
// ─────────────────────────────────────────────
router.get('/:id/edit', async (req, res, next) => {
    try {
        const entry = await Entry.findByPk(req.params.id, {
            include: ['category'],
        });
        if (!entry) return res.redirect('/');

        // Perl: check if categories are open OR entry has entryopen flag
        // if (!@cats && !entry->entryopen) → show entries_closed_error
        const openCategories = await Category.findAll({
            where: { programid: req.user.programid, entriesopen: 1, deleted: 0 },
        });
        if (!openCategories.length && !entry.entryopen) {
            return res.render('error', {
                message: 'Entries are closed for this program.',
                user: req.user,
            });
        }

        const category = entry.category;
        const entrants = await Entrant.findAll({
            where: { userid: req.user.userid, deleted: 0 },
        });
        const addresses = await Address.findAll({
            where: { userid: req.user.userid },
        });

        res.render('entry/form', {
            mode: 'edit',
            entry,
            category,
            entrants,
            addresses,
            user: req.user,
            errors: [],
        });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// POST /entry/:id/delete
// Equivalent of: param('action') eq 'delete' && $entry
// ─────────────────────────────────────────────
router.post('/:id/delete', async (req, res, next) => {
    try {
        const entry = await Entry.findByPk(req.params.id);
        if (entry) {
            await entry.update({ deleted: 1 });
        }
        res.redirect('/');   // equiv of relocatehome
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// POST /entry  (new entry)
// POST /entry/:id  (edit entry)
// Equivalent of: $INPUT{submit} eq "Save & Return Home" || "Save & Proceed to Category Questions"
// ─────────────────────────────────────────────
async function handleSave(req, res, next, existingEntry) {
    const { user } = req;
    const body = req.body;
    const redirectHome    = body.submit === 'home';
    const redirectAnswers = body.submit === 'questions';

    // ── Helper: re-render form with errors ──────────────────────────────────────
    async function renderWithError(errors) {
        const category = await Category.findByPk(body.categoryid, {
            include: ['criteria', 'categoryeligibilitylinks'],
        });
        const entrants = await Entrant.findAll({ where: { userid: user.userid, deleted: 0 } });
        const addresses = await Address.findAll({ where: { userid: user.userid } });
        return res.render('entry/form', {
            mode: existingEntry ? 'edit' : 'new',
            entry: existingEntry || null,
            category,
            entrants,
            addresses,
            user,
            errors,
        });
    }

    try {
        // ── 1. Validate entrant selection ─────────────────────────────────────────
        // Equiv: if ($INPUT{entrantid} eq 'a') → no_entrant_warning
        if (body.entrantid === 'a') {
            return renderWithError(['You must select an entrant or create a new one.']);
        }

        let entrantId = body.entrantid;

        // ── 2. Create new entrant if requested ───────────────────────────────────
        // Equiv: if ($INPUT{entrantid} eq 'b' || !$INPUT{entrantid})
        if (body.entrantid === 'b' || !body.entrantid) {
            const { name, telephone, mobile, email } = body;

            // Equiv: allfields_warning check
            if (!name || !telephone || !mobile || !email) {
                return renderWithError([
                    'All fields are required (except Legal Entity if same as entrant name).',
                ]);
            }

            // Equiv: no_address_warning — neither address can be 'a' (please select)
            if (body.streetaddressid === 'a' || body.postaladdressid === 'a') {
                return renderWithError([
                    'You must select or enter both a street and postal address.',
                ]);
            }

            // ── 2a. Create street address if new ─────────────────────────────────
            // Equiv: if ($INPUT{streetaddressid} eq 'b')
            let streetAddressId = body.streetaddressid;
            if (body.streetaddressid === 'b') {
                const { streetaddress, streetcity, streetstate, streetcode, streetcountry } = body;
                if (!streetaddress || !streetcity || !streetstate || !streetcode || !streetcountry) {
                    return renderWithError(['All street address fields are required.']);
                }
                const newStreet = await Address.create({
                    userid:  user.userid,
                    address: streetaddress,
                    city:    streetcity,
                    state:   streetstate,
                    code:    streetcode,
                    country: streetcountry,
                });
                streetAddressId = newStreet.addressid;
            }

            // ── 2b. Create postal address if new ─────────────────────────────────
            // Equiv: if ($INPUT{postaladdressid} eq 'c') → same as street
            //        if ($INPUT{postaladdressid} eq 'b') → create new
            let postalAddressId = body.postaladdressid;
            if (body.postaladdressid === 'c') {
                postalAddressId = streetAddressId;
            } else if (body.postaladdressid === 'b') {
                const { postaladdress, postalcity, postalstate, postalcode, postalcountry } = body;
                if (!postaladdress || !postalcity || !postalstate || !postalcode || !postalcountry) {
                    return renderWithError(['All postal address fields are required.']);
                }
                const newPostal = await Address.create({
                    userid:  user.userid,
                    address: postaladdress,
                    city:    postalcity,
                    state:   postalstate,
                    code:    postalcode,
                    country: postalcountry,
                });
                postalAddressId = newPostal.addressid;
            }

            // ── 2c. Create the entrant ─────────────────────────────────────────
            // Equiv: EPIC::JADE::Entrant->insert({...})
            const newEntrant = await Entrant.create({
                userid:          user.userid,
                name:            body.name,
                legalentity:     body.legalentity,
                abn:             body.abn,
                type:            body.type,
                streetaddressid: streetAddressId,
                postaladdressid: postalAddressId,
                telephone:       body.telephone,
                mobile:          body.mobile,
                email:           body.email,
                deleted:         0,
            });
            entrantId = newEntrant.entrantid;
        }

        // ── 3. Create or update the entry ────────────────────────────────────────
        let entry = existingEntry;

        if (!entry) {
            // Equiv: EPIC::JADE::Entry->insert({...})
            entry = await Entry.create({
                programid:  user.programid,
                entrantid:  entrantId,
                userid:     user.userid,
                categoryid: body.categoryid,
                userref:    body.userref,
                finalist:   0,
                deleted:    0,
            });

            // Equiv: getentrycost($entry->entryid, $user->userid)
            const costs = await getEntrycost(entry.entryid, user.userid);
            await entry.update({
                costex: costs.costex,
                gst:    costs.gst,
                orda:   entry.entryid,
            });

            // Equiv: if ($entry->costex + $entry->gst == 0) → auto-accept
            if ((costs.costex + costs.gst) === 0) {
                await entry.update({ entryaccepted: 1 });
            }
        } else {
            // Equiv: $entry->set(entrantid, userref)->update()
            await entry.update({
                entrantid: entrantId,
                userref:   body.userref,
            });
        }

        // ── 4. Redirect based on which submit button was pressed ─────────────────
        // Equiv: relocatehome / relocateresponseentry($entry->entryid, 1)
        if (redirectHome) {
            return res.redirect('/');
        } else if (redirectAnswers) {
            return res.redirect(`/formResponses?entryid=${entry.entryid}`);
        }
        res.redirect('/');

    } catch (err) {
        next(err);
    }
}

router.post('/', (req, res, next) => handleSave(req, res, next, null));

router.post('/:id', async (req, res, next) => {
    try {
        const entry = await Entry.findByPk(req.params.id);
        handleSave(req, res, next, entry);
    } catch (err) {
        next(err);
    }
});

export default router;
