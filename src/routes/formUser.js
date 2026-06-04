// routes/formUser.js
// Equivalent of formUser.cgi
// Handles both self-service profile editing and admin editing of other users.
// New user registration (no session) is handled by /register — not here.

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
import { encryptPassword, randomPassword } from '../services/helpers.js';
import { mail }            from '../services/mailer.js';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAddresses(userid) {
    return Address.findAll({ where: { userid }, order: [['addressid', 'ASC']] });
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

        // Show edit form
        const [addresses, categories] = await Promise.all([
            getAddresses(targetUser.userid),
            operator.admin ? getCategories(program.programid, targetUser.userid) : [],
        ]);

        return res.renderInShell('formUser', {
            user: operator, program, targetUser, addresses, categories,
            error: null, isAdmin: !!operator.admin,
        });

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

        // Validate required fields
        const required = ['email','question','answer','firstname','lastname','mobile'];
        const missing  = required.filter(f => !body[f]?.trim());
        if (missing.length || body.postaladdressid === 'a') {
            const [addresses, categories] = await Promise.all([
                getAddresses(targetUser.userid),
                operator.admin ? getCategories(program.programid, targetUser.userid) : [],
            ]);
            return res.renderInShell('formUser', {
                user: operator, program, targetUser, addresses, categories,
                error: 'All required fields must be completed.', isAdmin: !!operator.admin,
            });
        }

        // Password change
        if (body.password) {
            if (body.password !== body.passwordcheck) {
                const [addresses, categories] = await Promise.all([
                    getAddresses(targetUser.userid),
                    operator.admin ? getCategories(program.programid, targetUser.userid) : [],
                ]);
                return res.renderInShell('formUser', {
                    user: operator, program, targetUser, addresses, categories,
                    error: 'Password fields do not match.', isAdmin: !!operator.admin,
                });
            }
            const hashed = await encryptPassword(body.password);
            if (targetUser.credentialid) {
                await UserCredential.update({ password: hashed }, { where: { credentialid: targetUser.credentialid } });
            } else {
                await targetUser.update({ password: hashed });
            }
        }

        // New address
        let postaladdressid = body.postaladdressid;
        if (postaladdressid === 'b') {
            if (!body.postaladdress || !body.postalcity || !body.postalstate || !body.postalcode || !body.postalcountry) {
                const [addresses, categories] = await Promise.all([
                    getAddresses(targetUser.userid),
                    operator.admin ? getCategories(program.programid, targetUser.userid) : [],
                ]);
                return res.renderInShell('formUser', {
                    user: operator, program, targetUser, addresses, categories,
                    error: 'Please complete all address fields.', isAdmin: !!operator.admin,
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

        const oldemail = targetUser.email;

        // Admin-only flags
        if (operator.admin) {
            await targetUser.update({
                judge:        bool('isjudge'),
                admin:        bool('isadmin'),
                paymentsopen: bool('paymentsopen'),
            });
        }

        // Core profile fields
        await targetUser.update({
            email:           body.email.trim(),
            question:        body.question,
            answer:          body.answer,
            firstname:       body.firstname,
            lastname:        body.lastname,
            organisation:    body.organisation || '',
            postaladdressid: postaladdressid,
            telephone:       body.telephone || '',
            mobile:          body.mobile,
        });

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
            } else {
                await targetUser.update({ password: hashed });
            }
            mail({
                to:       body.email.trim(),
                subject:  `${program.name} — Email Address Changed`,
                text:     `Dear ${body.firstname},\n\nYour email address has been updated. Your new login credentials are:\n\nEmail: ${body.email.trim()}\nPassword: ${newPwd}\n\nPlease log in and change your password immediately.\n`,
                from:     program.emailfromaddress,
                smtpHost: program.smtpserver,
            }).catch(err => console.warn('Email change notification failed:', err.message));
            // If the operator changed their own email, force re-login
            if (targetUser.userid === operator.userid) {
                req.session.destroy();
                return res.redirect('/login?action=change_email');
            }
        }

        return res.redirect(operator.admin ? '/home?action=users' : '/home');

    } catch (err) { next(err); }
});

export default router;
