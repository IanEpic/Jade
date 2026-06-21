// routes/formEntry.js
// Equivalent of formEntry.cgi.
// Handles the entry form — either new (arriving from tc.cgi) or edit.
//
//   GET  /formEntry?entryid=X              → edit form
//   GET  /formEntry?entryid=X&action=delete → soft delete, redirect home
//   POST /formEntry (submit=Proceed to Entry, agree=ON) → new entry form
//   POST /formEntry (submit=Save & Return Home)         → save, redirect home
//   POST /formEntry (submit=Save & Proceed to Category Questions) → save, redirect to responses

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Entry    from '../models/Entry.js';
import Category from '../models/Category.js';
import Entrant  from '../models/Entrant.js';
import Address  from '../models/Address.js';
import { getEntrycost } from '../services/pricing.js';
import { loadAddressesForCredential } from '../services/addressService.js';
import { getPool, sql } from '../config/database.js';
import { getCriteria, getEligibilityLinks } from '../queries/categoryQueries.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadFormData(user, category) {
    const [entrants, addresses, criteria, eligibilityLinks] = await Promise.all([
        Entrant.findAll({ where: { userid: user.userid, deleted: 0 } }),
        loadAddressesForCredential(user.credentialid),
        getCriteria(category.categoryid),
        getEligibilityLinks(category.categoryid),
    ]);
    return {
        entrants:        entrants.map(e => e.toJSON()),
        addresses:       addresses,
        criteria,
        eligibilityLinks,
    };
}


async function resolveAddresses(body, userId) {
    let streetAddressId = body.streetaddressid;
    let postalAddressId = body.postaladdressid;

    if (streetAddressId === 'a') return { error: 'address' };

    if (!streetAddressId || streetAddressId === 'b') {
        const { streetaddress, streetcity, streetstate, streetcode, streetcountry } = body;
        if (!streetaddress || !streetcity || !streetstate || !streetcode || !streetcountry) {
            return { error: 'address' };
        }
        const addr = await Address.create({
            userid: userId, address: streetaddress, city: streetcity,
            state: streetstate, code: streetcode, country: streetcountry,
        });
        streetAddressId = addr.addressid;
    }

    if (postalAddressId === 'a') return { error: 'address' };

    if (postalAddressId === 'c') {
        postalAddressId = streetAddressId;
    } else if (!postalAddressId || postalAddressId === 'b') {
        const { postaladdress, postalcity, postalstate, postalcode, postalcountry } = body;
        if (!postaladdress || !postalcity || !postalstate || !postalcode || !postalcountry) {
            return { error: 'address' };
        }
        const addr = await Address.create({
            userid: userId, address: postaladdress, city: postalcity,
            state: postalstate, code: postalcode, country: postalcountry,
        });
        postalAddressId = addr.addressid;
    }

    return { streetAddressId, postalAddressId };
}

// ── GET /formEntry ─────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const entryId = req.query.entryid;
        const action  = req.query.action;

        // ── Delete ────────────────────────────────────────────────────────
        if (action === 'delete' && entryId) {
            const entry = await Entry.findByPk(entryId);
            if (entry) await entry.update({ deleted: 1 });
            return res.redirect('/home');
        }

        // ── Edit form ─────────────────────────────────────────────────────
        if (entryId) {
            const entry = await Entry.findByPk(entryId);
            if (!entry) return res.redirect('/home');

            // Finalised entries cannot be edited by non-admins
            if (entry.finalised && !user.admin) {
                return res.redirect(`/viewEntry?entryid=${entryId}`);
            }

            const category = await Category.findByPk(entry.categoryid);

            // Check entries are open for this entry
            const openCats = await Category.findAll({
                where: { programid: program.programid, entriesopen: 1, deleted: 0 },
            });
            if (!openCats.length && !entry.entryopen) {
                return res.renderInShell('formEntry', {
                    user, program, mode: 'closed', entry: null, category: null,
                    entrants: [], addresses: [], criteria: [], eligibilityLinks: [], errors: [],
                });
            }

            const formData = await loadFormData(user, category);
            return res.renderInShell('formEntry', {
                user, program, mode: 'edit', entry: entry.toJSON(), category: category.toJSON(), errors: [], ...formData,
            });
        }

        // ── No entryid and no submit → redirect to tc ─────────────────────
        res.redirect('/tc?type=agreeerror');

    } catch (err) {
        next(err);
    }
});

// ── POST /formEntry ────────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const body    = req.body;
        const submit  = body.submit || '';

        // ── T&C agree check (coming from tc.cgi) ──────────────────────────
        // Equiv: if ($INPUT{submit} eq "Proceed to Entry" && $INPUT{agree} eq "ON")
        if (submit === 'Proceed to Entry') {
            if (body.agree !== 'ON') {
                return res.redirect(`/tc?type=agreeerror&cat=${body.categoryid || ''}`);
            }
            // Show blank new entry form
            const category = await Category.findByPk(body.categoryid);
            if (!category) return res.redirect('/home');
            const formData = await loadFormData(user, category);
            return res.renderInShell('formEntry', {
                user, program, mode: 'new', entry: null, category: category.toJSON(), errors: [], ...formData,
            });
        }

        // ── Save (new or edit) ────────────────────────────────────────────
        const isSave = submit === 'Save' || submit === 'SaveProceed' || submit === 'Save & Return Home' || submit === 'Save & Proceed to Category Questions';
        if (!isSave) return res.redirect('/home');

        const category = await Category.findByPk(body.categoryid);

        const renderError = async (errors, entry = null) => {
            const formData = await loadFormData(user, category);
            return res.renderInShell('formEntry', {
                user, program,
                mode:     entry ? 'edit' : 'new',
                entry:    entry ? (entry.toJSON ? entry.toJSON() : entry) : null,
                category: category.toJSON ? category.toJSON() : category,
                errors, ...formData,
            });
        };

        // ── Resolve entrant ───────────────────────────────────────────────
        let entrantId = body.entrantid;

        if (entrantId === 'a') {
            return renderError(['You must select an entrant or create a new one.']);
        }

        if (entrantId === 'b' || !entrantId) {
            if (!body.name || !body.telephone || !body.mobile || !body.email) {
                return renderError(['All fields are required (Name, Telephone, Mobile, Email).']);
            }
            if (body.streetaddressid === 'a' || body.postaladdressid === 'a') {
                return renderError(['You must select or enter both a street and postal address.']);
            }

            const addrResult = await resolveAddresses(body, user.userid);
            if (addrResult.error) {
                return renderError(['You must select or enter both a street and postal address.']);
            }

            const newEntrant = await Entrant.create({
                userid:          user.userid,
                name:            body.name,
                legalentity:     body.legalentity || null,
                abn:             body.abn || null,
                type:            body.type || null,
                streetaddressid: addrResult.streetAddressId,
                postaladdressid: addrResult.postalAddressId,
                telephone:       body.telephone,
                fax:             body.fax || null,
                mobile:          body.mobile,
                email:           body.email,
                deleted:         0,
            });
            entrantId = newEntrant.entrantid;
        }

        // ── Create or update entry ────────────────────────────────────────
        let entry = body.entryid ? await Entry.findByPk(body.entryid) : null;

        // Prevent saving a finalised entry (non-admin)
        if (entry && entry.finalised && !user.admin) {
            return res.redirect(`/viewEntry?entryid=${entry.entryid}`);
        }

        if (!entry) {
            entry = await Entry.create({
                programid:  program.programid,
                entrantid:  entrantId,
                userid:     user.userid,
                categoryid: body.categoryid,
                userref:    body.userref || null,
                finalist:   0,
                deleted:    0,
            });
            const costs = await getEntrycost(entry.entryid, user.userid);
            await entry.update({
                costex: costs.costex,
                gst:    costs.gst,
                orda:   entry.entryid,
            });
            if ((costs.costex + costs.gst) === 0) {
                await entry.update({ entryaccepted: 1 });
            }
        } else {
            await entry.update({ entrantid: entrantId, userref: body.userref || null });
        }

        if (submit === 'Save' || submit === 'Save & Return Home') {
            return res.redirect('/home');
        } else {
            return res.redirect(`/formResponses?entryid=${entry.entryid}&page=1`);
        }

    } catch (err) {
        next(err);
    }
});

export default router;
