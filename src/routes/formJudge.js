// routes/formJudge.js
// Equivalent of formJudge.cgi
// Admin-only: create/edit judges. Handles new user creation, upgrade of existing user to judge,
// category allocations, head-judge category assignments, and cleanup of orphaned scores/links.

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import User              from '../models/User.js';
import UserCredential    from '../models/UserCredential.js';
import Category          from '../models/Category.js';
import JudgeCategoryLink from '../models/JudgeCategoryLink.js';
import { getPool, sql }  from '../config/database.js';
import { encryptPassword, randomPassword, checkEmail } from '../services/helpers.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// Validate the judge detail fields. Returns an error string, or null if valid.
function validateJudgeInput({ firstname, lastname, email }) {
    if (!firstname || !firstname.trim()) return 'First name is required.';
    if (!lastname  || !lastname.trim())  return 'Last name is required.';
    if (!email     || !checkEmail(email.trim())) return 'A valid email address is required.';
    return null;
}

// Redirect back to the judge form with an error message and the entered values preserved.
function redirectWithError(res, { error, judgeid, firstname, lastname, email, cats }) {
    const qs = new URLSearchParams({ action: 'judge', error });
    if (judgeid) qs.set('judgeid', judgeid);
    if (firstname) qs.set('firstname', firstname);
    if (lastname)  qs.set('lastname', lastname);
    if (email)     qs.set('email', email);
    if (cats && cats.length) qs.set('cats', cats.join(','));
    return res.redirect('/home?' + qs.toString());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCategories(programid) {
    return Category.findAll({
        where: { programid, deleted: false },
        order: [['orda', 'ASC'], ['categoryid', 'ASC']],
    });
}

async function getLinkedCategoryIds(userid) {
    const links = await JudgeCategoryLink.findAll({ where: { userid } });
    return new Set(links.map(l => l.categoryid));
}

async function getHeadJudgeCategoryIds(userid, programid) {
    const cats = await Category.findAll({ where: { userid, programid, deleted: false } });
    return new Set(cats.map(c => c.categoryid));
}

// ── GET /formJudge ────────────────────────────────────────────────────────────
// Now served through the home sidebar layout at /home?action=judge.

router.get('/', (req, res) => {
    const judgeid = req.query.judgeid ? `&judgeid=${req.query.judgeid}` : '';
    res.redirect('/home?action=judge' + judgeid);
});

// ── POST /formJudge ───────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = req.program;
        const body    = req.body;

        const judgeid   = body.judgeid   ? parseInt(body.judgeid)   : null;
        const upgradeid = body.upgrade   ? parseInt(body.upgrade)   : null;

        const submittedCatIds = Object.keys(body)
            .filter(k => k.startsWith('cat~'))
            .map(k => parseInt(k.slice(4)));
        const submittedHJCatIds = Object.keys(body)
            .filter(k => k.startsWith('hjcat~'))
            .map(k => parseInt(k.slice(6)));

        // ── Edit existing judge ───────────────────────────────────────────────
        if (judgeid) {
            const err = validateJudgeInput(body);
            if (err) return redirectWithError(res, { error: err, judgeid });

            const judge = await User.findByPk(judgeid);
            if (judge.credentialid) {
                await UserCredential.update(
                    { email: body.email, firstname: body.firstname, lastname: body.lastname },
                    { where: { credentialid: judge.credentialid } },
                );
            }

            // Replace category links
            await JudgeCategoryLink.destroy({ where: { userid: judgeid } });
            for (const categoryid of submittedCatIds) {
                await JudgeCategoryLink.create({ userid: judgeid, categoryid });
            }

            // Head judge assignments — set/unset category.userid
            const allCats = await getCategories(program.programid);
            for (const cat of allCats) {
                if (submittedHJCatIds.includes(cat.categoryid)) {
                    await Category.update({ userid: judgeid }, { where: { categoryid: cat.categoryid } });
                } else if (cat.userid === judgeid) {
                    await Category.update({ userid: null }, { where: { categoryid: cat.categoryid } });
                }
            }

            // Clean up scores and judge entry links for removed categories
            const pool = await getPool();
            const uid  = judgeid;
            for (const cat of allCats) {
                if (!submittedCatIds.includes(cat.categoryid)) {
                    const cid = cat.categoryid;
                    await pool.request()
                        .input('cid', sql.Int, cid)
                        .input('uid', sql.Int, uid)
                        .query(`
                            UPDATE Score SET deleted = 1
                            FROM Score
                            INNER JOIN [Entry] ON Score.entryid = [Entry].entryid
                            INNER JOIN Category ON [Entry].categoryid = Category.categoryid
                            WHERE Category.categoryid = @cid AND Score.userid = @uid
                        `);
                    await pool.request()
                        .input('cid', sql.Int, cid)
                        .input('uid', sql.Int, uid)
                        .query(`
                            DELETE FROM JudgeEntryLink
                            FROM JudgeEntryLink
                            INNER JOIN [Entry] ON JudgeEntryLink.entryid = [Entry].entryid
                            INNER JOIN Category ON [Entry].categoryid = Category.categoryid
                            WHERE JudgeEntryLink.userid = @uid AND Category.categoryid = @cid
                        `);
                }
            }

            return res.redirect('/home?action=judges');
        }

        // ── Upgrade existing user to judge ────────────────────────────────────
        if (upgradeid) {
            const upgradeUser = await User.findByPk(upgradeid);
            if (program.usesimplejudging) {
                await upgradeUser.update({ simplejudge: true });
            } else {
                await upgradeUser.update({ judge: true });
            }
            for (const categoryid of submittedCatIds) {
                await JudgeCategoryLink.create({ userid: upgradeid, categoryid });
            }
            const allCats = await getCategories(program.programid);
            for (const cat of allCats) {
                if (submittedHJCatIds.includes(cat.categoryid)) {
                    await Category.update({ userid: upgradeid }, { where: { categoryid: cat.categoryid } });
                } else if (cat.userid === upgradeid) {
                    await Category.update({ userid: null }, { where: { categoryid: cat.categoryid } });
                }
            }
            return res.redirect('/home?action=judges');
        }

        // ── Validate new judge details ────────────────────────────────────────
        const createErr = validateJudgeInput(body);
        if (createErr) {
            return redirectWithError(res, {
                error: createErr,
                firstname: body.firstname, lastname: body.lastname, email: body.email,
                cats: submittedCatIds,
            });
        }

        // ── Check for existing user with that email ───────────────────────────
        const email = (Array.isArray(body.email) ? body.email[0] : (body.email || '')).trim();
        const existingCredential = await UserCredential.findOne({ where: { email } });
        const existing = existingCredential ? await User.findOne({
            where: { programid: program.programid, credentialid: existingCredential.credentialid, deleted: false },
        }) : null;
        if (existing) {
            const qs = new URLSearchParams({
                action: 'judge', conflict: '1',
                existinguserid: existing.userid,
                email: email,
                firstname: body.firstname || '',
                lastname:  body.lastname  || '',
                cats: submittedCatIds.join(','),
            });
            return res.redirect('/home?' + qs.toString());
        }

        // ── Create new judge user ─────────────────────────────────────────────
        const firstname = (Array.isArray(body.firstname) ? body.firstname[0] : (body.firstname || '')).trim();
        const lastname  = (Array.isArray(body.lastname)  ? body.lastname[0]  : (body.lastname  || '')).trim();
        const password   = randomPassword();
        const hashed     = await encryptPassword(password);
        const [credential, created] = await UserCredential.findOrCreate({
            where:    { email },
            defaults: { email, password: hashed, firstname, lastname },
        });
        // Existing credential (same email, different program) with blank names — backfill.
        if (!created && (!credential.firstname || !credential.lastname)) {
            await credential.update({
                firstname: credential.firstname || firstname,
                lastname:  credential.lastname  || lastname,
            });
        }

        const newUser = await User.create({
            credentialid: credential.credentialid,
            programid:    program.programid,
            paymentsopen: program.paymentsopendefault || false,
            judge:        program.usesimplejudging ? false : true,
            simplejudge:  program.usesimplejudging ? true  : false,
            admin:        false,
            enabled:      true,
            exclude:      false,
            deleted:      false,
        });

        for (const categoryid of submittedCatIds) {
            await JudgeCategoryLink.create({ userid: newUser.userid, categoryid });
        }
        const allCats = await getCategories(program.programid);
        for (const cat of allCats) {
            if (submittedHJCatIds.includes(cat.categoryid)) {
                await Category.update({ userid: newUser.userid }, { where: { categoryid: cat.categoryid } });
            }
        }

        return res.redirect('/home?action=judges');

    } catch (err) { next(err); }
});

export default router;
