// routes/formUser.js
// Equivalent of formUser.cgi
// Handles both self-service profile editing and admin editing of other users.
// New user registration (no session) is handled by /register — not here.

import { Op }              from 'sequelize';
import { Router }          from 'express';
import { requireAuth }     from '../middleware/auth.js';
import User                from '../models/User.js';
import UserCredential      from '../models/UserCredential.js';
import Address             from '../models/Address.js';
import Category            from '../models/Category.js';
import JudgeCategoryLink   from '../models/JudgeCategoryLink.js';
import JudgeEntryLink      from '../models/JudgeEntryLink.js';
import JudgeComment        from '../models/JudgeComment.js';
import Score               from '../models/Score.js';
import { getPool, sql }    from '../config/database.js';
import { encryptPassword, randomPassword, validatePassword, PASSWORD_RULES } from '../services/helpers.js';
import { loadAddressesForCredential } from '../services/addressService.js';
import { mail, parseSmtp } from '../services/mailer.js';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAddresses(credentialid) {
    return loadAddressesForCredential(credentialid);
}

async function getCategories(programid, userid) {
    const cats  = await Category.findAll({
        where: { programid, deleted: false },
        order: [['orda', 'ASC'], ['categoryid', 'ASC']],
    });
    const links = await JudgeCategoryLink.findAll({ where: { userid } });
    const linked = new Set(links.map(l => l.categoryid));
    return cats.map(c => ({ ...c.toJSON(), judging: linked.has(c.categoryid) }));
}

async function resolveEditUser(operator, body) {
    if (operator.admin && body.edituserid) {
        return User.findByPk(parseInt(body.edituserid));
    }
    return operator;
}

// ── Actions that don't need a form ───────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const operator = req.user;
        const program  = operator.program;
        const { action, edituserid } = req.query;

        const targetUser = operator.admin && edituserid
            ? await User.findByPk(parseInt(edituserid))
            : operator;

        if (!targetUser) return next(Object.assign(new Error('User not found'), { status: 404 }));

        if (action === 'delete' && operator.admin) {
            await targetUser.update({ deleted: true });
            return res.redirect('/home?action=users');
        }

        if (action === 'disable' && operator.admin) {
            await targetUser.update({ enabled: false });
            return res.redirect('/home?action=users');
        }

        if (action === 'enable' && operator.admin) {
            await targetUser.update({ enabled: true });
            return res.redirect('/home?action=users');
        }

        if (action === 'activate' && operator.admin && targetUser.credentialid) {
            await UserCredential.update(
                { activated: 1, activationtoken: null },
                { where: { credentialid: targetUser.credentialid } },
            );
            if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
                return res.json({ ok: true });
            }
            return res.redirect('/formUser?edituserid=' + targetUser.userid);
        }

        if (action === 'resend-setup' && operator.admin && targetUser.credentialid) {
            const setupToken = crypto.randomBytes(32).toString('hex');
            const cred = await UserCredential.findByPk(targetUser.credentialid);
            await cred.update({ activationtoken: setupToken });
            const program  = req.program;
            const proto    = req.get('x-forwarded-proto') || req.protocol;
            const host     = req.get('x-forwarded-host')  || req.get('host');
            const setupUrl = `${proto}://${host}/${program.slug}/set-password?token=${setupToken}`;
            const firstname = cred.firstname || targetUser.firstname;
            mail({
                to:      cred.email,
                subject: `${program.name} — Set Your Password`,
                text:    `Dear ${firstname},\n\nA password setup link has been generated for your account.\n\nPlease click the link below to set your password:\n\n${setupUrl}\n\nIf you did not request this, please contact the program administrator.\n`,
                from:    program.emailfromaddress,
                ...parseSmtp(program.smtpserver),
            }).catch(err => console.warn('Resend setup email failed:', err.message));
            return res.redirect('/home?action=users&edituserid=' + targetUser.userid + '&sent=1');
        }

        if (action === 'demote' && operator.admin) {
            await targetUser.update({ judge: false });
            await JudgeCategoryLink.destroy({ where: { userid: targetUser.userid } });
            await JudgeEntryLink.destroy({ where: { userid: targetUser.userid } });
            const pool = await getPool();
            await pool.request().input('uid', sql.Int, targetUser.userid)
                .query('UPDATE JudgeComment SET deleted=1 WHERE userid=@uid');
            await pool.request().input('uid', sql.Int, targetUser.userid)
                .query('UPDATE Score SET deleted=1 WHERE userid=@uid');
            return res.redirect('/home?action=users');
        }

        // Route all users through the home framework
        if (operator.admin) {
            return res.redirect('/home?action=users&edituserid=' + targetUser.userid);
        }
        return res.redirect('/home?action=profile');

    } catch (err) { next(err); }
});

// ── POST — save profile edits ─────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
    try {
        const operator = req.user;
        const program  = operator.program;
        const body     = req.body;
        const bool     = k => body[k] ? 1 : 0;

        const targetUser = await resolveEditUser(operator, body);
        if (!targetUser) return next(Object.assign(new Error('User not found'), { status: 404 }));

        const credential = targetUser.credentialid
            ? await UserCredential.findByPk(targetUser.credentialid)
            : null;

        // Build a plain-object view of targetUser with credential fields merged (for re-renders)
        const targetUserView = () => ({
            ...targetUser.toJSON(),
            postaladdressid:  credential?.postaladdressid  || null,
            streetaddressid:  credential?.streetaddressid  || null,
        });

        // Validate required fields — admins only need email, self-service needs full profile
        const required = operator.admin
            ? ['email']
            : ['email','firstname','lastname','mobile'];
        const missing  = required.filter(f => !body[f]?.trim());
        if (missing.length || (!operator.admin && body.postaladdressid === 'a')) {
            const [addresses, categories] = await Promise.all([
                getAddresses(targetUser.credentialid),
                operator.admin ? getCategories(program.programid, targetUser.userid) : [],
            ]);
            return res.renderInShell('formUser', {
                user: operator, program, targetUser: targetUserView(), addresses, categories, passwordRules: PASSWORD_RULES,
                error: 'All required fields must be completed.', isAdmin: !!operator.admin,
            });
        }

        // Password change
        if (body.password) {
            const pwError = validatePassword(body.password) || (body.password !== body.passwordcheck ? 'Password fields do not match.' : null);
            if (pwError) {
                const [addresses, categories] = await Promise.all([
                    getAddresses(targetUser.credentialid),
                    operator.admin ? getCategories(program.programid, targetUser.userid) : [],
                ]);
                return res.renderInShell('formUser', {
                    user: operator, program, targetUser: targetUserView(), addresses, categories, passwordRules: PASSWORD_RULES,
                    error: pwError, isAdmin: !!operator.admin,
                });
            }
            const hashed = await encryptPassword(body.password);
            if (targetUser.credentialid) {
                await UserCredential.update({ password: hashed }, { where: { credentialid: targetUser.credentialid } });
            }
        }

        // New postal address
        let postaladdressid = body.postaladdressid;
        if (postaladdressid === 'b') {
            if (!operator.admin && (!body.postaladdress || !body.postalcity || !body.postalstate || !body.postalcode || !body.postalcountry)) {
                const [addresses, categories] = await Promise.all([
                    getAddresses(targetUser.credentialid),
                    operator.admin ? getCategories(program.programid, targetUser.userid) : [],
                ]);
                return res.renderInShell('formUser', {
                    user: operator, program, targetUser: targetUserView(), addresses, categories, passwordRules: PASSWORD_RULES,
                    error: 'Please complete all postal address fields.', isAdmin: !!operator.admin,
                });
            }
            const newAddr = await Address.create({
                userid:  targetUser.userid,
                address: body.postaladdress,
                city:    body.postalcity,
                state:   body.postalstate,
                code:    body.postalcode,
                country: body.postalcountry,
            });
            postaladdressid = newAddr.addressid;
        }

        // New street address
        let streetaddressid = body.streetaddressid || null;
        if (streetaddressid === 'a') streetaddressid = null;
        if (streetaddressid === 'b') {
            const newAddr = await Address.create({
                userid:  targetUser.userid,
                address: body.streetaddress  || '',
                city:    body.streetcity     || '',
                state:   body.streetstate    || '',
                code:    body.streetcode     || '',
                country: body.streetcountry  || '',
            });
            streetaddressid = newAddr.addressid;
        }

        const oldemail = credential?.email || '';

        // Admin-only flags
        if (operator.admin) {
            await targetUser.update({
                judge:               bool('isjudge'),
                admin:               bool('isadmin'),
                paymentsopen:        bool('paymentsopen'),
                enabled:             bool('enabled'),
                chairperson:         bool('chairperson'),
                viewentries:         bool('viewentries'),
                reviewer:            bool('reviewer'),
                simplejudge:         bool('simplejudge'),
                onlyjudgepostreview: bool('onlyjudgepostreview'),
                exclude:             bool('exclude'),
            });
        }

        // Profile fields — write to UserCredential only (source of truth post-migration 036/038)
        if (targetUser.credentialid) {
            await UserCredential.update({
                firstname:        body.firstname,
                lastname:         body.lastname,
                organisation:     body.organisation || '',
                telephone:        body.telephone    || '',
                mobile:           body.mobile       || '',
                postaladdressid:  postaladdressid   || null,
                streetaddressid:  streetaddressid   || null,
            }, { where: { credentialid: targetUser.credentialid } });
        }

        // Judge category links (admin only, only if judge)
        if (operator.admin) {
            await JudgeCategoryLink.destroy({ where: { userid: targetUser.userid } });
            if (targetUser.judge) {
                const selectedCats = [].concat(body.categories || []);
                for (const catid of selectedCats) {
                    await JudgeCategoryLink.create({ userid: targetUser.userid, categoryid: parseInt(catid) });
                }

                // Remove judge links/scores/comments for categories no longer assigned
                const allCats  = await Category.findAll({ where: { programid: program.programid, deleted: false } });
                const newCatSet = new Set(selectedCats.map(Number));
                const pool = await getPool();
                for (const cat of allCats) {
                    if (!newCatSet.has(cat.categoryid)) {
                        const uid = targetUser.userid;
                        const cid = cat.categoryid;
                        await pool.request().input('uid', sql.Int, uid).input('cid', sql.Int, cid)
                            .query(`UPDATE Score SET deleted=1 FROM Score INNER JOIN Entry ON Score.entryid=Entry.entryid WHERE Entry.categoryid=@cid AND Score.userid=@uid`);
                        await pool.request().input('uid', sql.Int, uid).input('cid', sql.Int, cid)
                            .query(`UPDATE JudgeComment SET deleted=1 FROM JudgeComment INNER JOIN Entry ON JudgeComment.entryid=Entry.entryid WHERE Entry.categoryid=@cid AND JudgeComment.userid=@uid`);
                        await pool.request().input('uid', sql.Int, uid).input('cid', sql.Int, cid)
                            .query(`DELETE FROM JudgeEntryLink FROM JudgeEntryLink INNER JOIN Entry ON JudgeEntryLink.entryid=Entry.entryid WHERE Entry.categoryid=@cid AND JudgeEntryLink.userid=@uid`);
                    }
                }
            }
        }

        // Email change — reset password, update credential email, and notify
        if (body.email.trim() !== oldemail) {
            const newPwd = randomPassword();
            const hashed = await encryptPassword(newPwd);
            if (targetUser.credentialid) {
                await UserCredential.update(
                    { email: body.email.trim(), password: hashed },
                    { where: { credentialid: targetUser.credentialid } }
                );
            }
            mail({
                to:       body.email.trim(),
                subject:  `${program.name} — Email Address Changed`,
                text:     `Dear ${body.firstname},\n\nYour email address has been updated. Your new login credentials are:\n\nEmail: ${body.email.trim()}\nPassword: ${newPwd}\n\nPlease log in and change your password immediately.\n`,
                from:     program.emailfromaddress,
                ...parseSmtp(program.smtpserver),
            }).catch(err => console.warn('Email change notification failed:', err.message));
            // If the operator changed their own email, force re-login
            if (targetUser.userid === operator.userid) {
                req.session.destroy();
                return res.redirect('/login?action=change_email');
            }
        }

        return res.redirect(operator.admin ? '/home?action=users&success=1' : '/home');

    } catch (err) { next(err); }
});

// ── POST /formUser/address-delete ─────────────────────────────────────────────

router.post('/address-delete', async (req, res, next) => {
    try {
        const operator  = req.user;
        const addressid = parseInt(req.body.addressid);
        const edituserid = req.body.edituserid ? parseInt(req.body.edituserid) : null;

        const targetUser = operator.admin && edituserid
            ? await User.findByPk(edituserid)
            : operator;
        if (!targetUser) return res.redirect('/home');

        // Only allow deletion of addresses belonging to this credential's pool
        const allowed = await loadAddressesForCredential(targetUser.credentialid);
        if (!allowed.some(a => a.addressid === addressid)) {
            return res.redirect('/home?action=profile&error=notfound');
        }

        await Address.update({ deleted: true }, { where: { addressid } });

        if (operator.admin && edituserid) {
            return res.redirect('/home?action=users&edituserid=' + edituserid);
        }
        return res.redirect('/home?action=profile');
    } catch (err) { next(err); }
});

// ── POST /formUser/batch-payments ─────────────────────────────────────────────
// Set paymentsopen on multiple users at once.

router.post('/batch-payments', async (req, res, next) => {
    try {
        const user = req.user;
        if (!user.admin) return res.status(403).send('Forbidden');

        const raw = req.body.userids;
        const ids = (Array.isArray(raw) ? raw : [raw])
            .map(Number).filter(n => n > 0);
        if (!ids.length) return res.json({ ok: false, error: 'no users' });

        const paymentsopen = req.body.paymentsopen === '1' ? 1 : 0;
        await User.update(
            { paymentsopen },
            { where: { userid: { [Op.in]: ids }, programid: user.programid } },
        );

        res.json({ ok: true, count: ids.length, paymentsopen });
    } catch (err) { next(err); }
});

export default router;
