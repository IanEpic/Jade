// routes/formEntrant.js
// Express equivalent of formEntrant.cgi.
//
//   GET  /formEntrant              → blank new entrant form
//   GET  /formEntrant?entrantid=X  → edit form for existing entrant
//   GET  /formEntrant?entrantid=X&action=delete → soft delete
//   POST /formEntrant              → create new entrant
//   POST /formEntrant?entrantid=X  → update existing entrant

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { renderInHome } from './home/homeHelpers.js';
import Entrant from '../models/Entrant.js';
import Address from '../models/Address.js';
import Entry from '../models/Entry.js';
import Category from '../models/Category.js';
import { translate } from '../services/translate.js';
import { loadAddressesForCredential } from '../services/addressService.js';

const router = Router();
router.use(requireAuth);

// ── Shared data loader ────────────────────────────────────────────────────────


async function catsOpenForEntries(programId) {
    return Category.findAll({ where: { programid: programId, entriesopen: 1, deleted: 0 } });
}

async function entriesOpenByOverride(userId) {
    return Entry.findAll({ where: { userid: userId, entryopen: 1, deleted: 0 } });
}

// ── GET /formEntrant ──────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user      = req.user;
        const program = req.program;
        const entrantId = req.query.entrantid;
        const action    = req.query.action;

        // ── Delete action ─────────────────────────────────────────────────
        if (action === 'delete' && entrantId) {
            const entrant = await Entrant.findByPk(entrantId);
            if (!entrant) return res.redirect('/home');

            // Check for active entries using this entrant
            const activeEntries = await Entry.findAll({
                where: { entrantid: entrantId, deleted: 0 },
            });
            if (activeEntries.length) {
                return renderInHome(req, res, 'home/entrant', {
                    user,
                    program,
                    error: 'inuse',
                    addresses: [],
                    entrant: null,
                    mode: 'error',
                    nameLabel:       await translate(program.programid, 'Entrant Name'),
                    typeLabel:       await translate(program.programid, 'Entrant Type'),
                    abnLabel:        await translate(program.programid, 'Entrant ABN'),
                    createLabel:     await translate(program.programid, 'Create Entrant'),
                    editLabel:       await translate(program.programid, 'Edit Entrant'),
                    entrantsLabel:   await translate(program.programid, 'My Entrants'),
                });
            }

            await entrant.update({ deleted: 1 });
            return res.redirect('/home?action=entrants');
        }

        // ── Check entries are open (required to show the form at all) ─────
        const openCats     = await catsOpenForEntries(program.programid);
        const overrideOpen = await entriesOpenByOverride(user.userid);
        if (!openCats.length && !overrideOpen.length) {
            return renderInHome(req, res, 'home/entrant', {
                user, program, mode: 'closed',
                addresses: [], entrant: null,
                nameLabel: '', typeLabel: '', abnLabel: '', createLabel: '', editLabel: '', entrantsLabel: '',
            });
        }

        // ── Load form data ────────────────────────────────────────────────
        const addresses = await loadAddressesForCredential(user.credentialid);
        const entrant   = entrantId ? await Entrant.findByPk(entrantId) : null;
        const mode      = entrant ? 'edit' : 'new';

        const [nameLabel, typeLabel, abnLabel, createLabel, editLabel, entrantsLabel] = await Promise.all([
            translate(program.programid, 'Entrant Name'),
            translate(program.programid, 'Entrant Type'),
            translate(program.programid, 'Entrant ABN'),
            translate(program.programid, 'Create Entrant'),
            translate(program.programid, 'Edit Entrant'),
            translate(program.programid, 'My Entrants'),
        ]);

        renderInHome(req, res, 'home/entrant', {
            user, program, mode, entrant, addresses, errors: [],
            nameLabel, typeLabel, abnLabel, createLabel, editLabel, entrantsLabel,
        });

    } catch (err) {
        next(err);
    }
});

// ── POST /formEntrant ─────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user      = req.user;
        const program = req.program;
        const body      = req.body;
        const entrantId = body.entrantid;

        const addresses = await loadAddressesForCredential(user.credentialid);

        const [nameLabel, typeLabel, abnLabel, createLabel, editLabel, entrantsLabel] = await Promise.all([
            translate(program.programid, 'Entrant Name'),
            translate(program.programid, 'Entrant Type'),
            translate(program.programid, 'Entrant ABN'),
            translate(program.programid, 'Create Entrant'),
            translate(program.programid, 'Edit Entrant'),
            translate(program.programid, 'My Entrants'),
        ]);

        const redirectError = (msg) =>
            res.redirect('/home?action=entrants&error=' + encodeURIComponent(msg));

        // ── Resolve street address ────────────────────────────────────────
        let streetAddressId = body.streetaddressid;
        if (body.streetaddressid === 'b') {
            const { streetaddress, streetcity, streetstate, streetcode, streetcountry } = body;
            if (!streetaddress || !streetcity || !streetstate || !streetcode || !streetcountry) {
                return redirectError('You must complete all street address fields.');
            }
            const newStreet = await Address.create({
                userid: user.userid, address: streetaddress, city: streetcity,
                state: streetstate, code: streetcode, country: streetcountry,
            });
            streetAddressId = newStreet.addressid;
        }

        // ── Resolve postal address ────────────────────────────────────────
        let postalAddressId = body.postaladdressid;
        if (body.postaladdressid === 'c') {
            postalAddressId = streetAddressId;
        } else if (body.postaladdressid === 'b') {
            const { postaladdress, postalcity, postalstate, postalcode, postalcountry } = body;
            if (!postaladdress || !postalcity || !postalstate || !postalcode || !postalcountry) {
                return redirectError('You must complete all postal address fields.');
            }
            const newPostal = await Address.create({
                userid: user.userid, address: postaladdress, city: postalcity,
                state: postalstate, code: postalcode, country: postalcountry,
            });
            postalAddressId = newPostal.addressid;
        }

        if (streetAddressId === 'a' || postalAddressId === 'a') {
            return redirectError('You must select or enter both a street and postal address.');
        }

        const fields = {
            userid:          user.userid,
            name:            body.name,
            legalentity:     body.legalentity,
            abn:             body.abn,
            type:            body.type,
            streetaddressid: streetAddressId,
            postaladdressid: postalAddressId,
            telephone:       body.telephone,
            fax:             body.fax || null,
            mobile:          body.mobile,
            email:           body.email,
            deleted:         0,
        };

        if (entrantId) {
            // ── Edit existing entrant ─────────────────────────────────────
            const entrant = await Entrant.findByPk(entrantId);
            if (!entrant) return res.redirect('/home');
            await entrant.update(fields);
        } else {
            // ── Create new entrant ────────────────────────────────────────
            await Entrant.create(fields);
        }

        res.redirect('/home?action=entrants');

    } catch (err) {
        next(err);
    }
});

export default router;
