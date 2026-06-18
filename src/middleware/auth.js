// middleware/auth.js

import User           from '../models/User.js';
import UserCredential from '../models/UserCredential.js';

export async function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        return res.redirect('/login');
    }

    // Detect cross-program navigation: user is visiting a slug that differs from
    // their current session program. If their credential has access to the target
    // program, offer a switch confirmation rather than booting them to login.
    if (req.program && req.program.programid !== req.session.programId) {
        if (req.session.credentialId) {
            const targetUser = await User.findOne({
                where: {
                    credentialid: req.session.credentialId,
                    programid:    req.program.programid,
                    deleted:      0,
                    enabled:      1,
                },
            });
            if (targetUser) {
                req.session.userId        = targetUser.userid;
                req.session.programId     = req.program.programid;
                req.session.programSlug   = req.program.slug;
                req.session.pendingSwitch = null;
                req.session.emulateUserId = null;
                return req.session.save(err => {
                    if (err) return next(err);
                    res.redirect(req.originalUrl);
                });
            }
        }
        // Credential has no access to the target program — send to that program's login
        return res.redirect('/login');
    }

    try {
        const user = await User.findByPk(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        // Attach the already-resolved program from resolveProgram middleware
        // rather than re-loading it via the association (saves a JOIN per request).
        if (req.program) user.program = req.program;

        // Merge profile fields from UserCredential (source of truth post-migration).
        // Falls back gracefully to User fields for legacy rows without a credential.
        await mergeCredentialProfile(user);

        if (req.session.emulateUserId) {
            req.realUser = user;
            const emulated = await User.findByPk(req.session.emulateUserId);
            if (emulated && req.program) emulated.program = req.program;
            await mergeCredentialProfile(emulated);
            req.user = emulated;
        } else {
            req.user = user;
        }
        res.locals.user = req.user;
        next();
    } catch (err) {
        next(err);
    }
}

async function mergeCredentialProfile(user) {
    if (!user?.credentialid) return;
    const cred = await UserCredential.findByPk(user.credentialid);
    if (!cred) return;
    if (cred.firstname)    user.firstname    = cred.firstname;
    if (cred.lastname)     user.lastname     = cred.lastname;
    if (cred.organisation) user.organisation = cred.organisation;
    if (cred.telephone)    user.telephone    = cred.telephone;
    if (cred.mobile)       user.mobile       = cred.mobile;
    if (cred.fax)          user.fax          = cred.fax;
    user.superadmin = !!cred.superadmin;
}

export function requireAdmin(req, res, next) {
    if (!req.user) return res.redirect('/login');
    if (!req.user.admin) return res.redirect('/home');
    next();
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.redirect('/login');
        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).render('error', { message: 'Access denied' });
        }
        next();
    };
}
