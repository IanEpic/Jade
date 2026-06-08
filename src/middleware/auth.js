// middleware/auth.js

import User from '../models/User.js';

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
                req.session.pendingSwitch = {
                    userId:      targetUser.userid,
                    programId:   req.program.programid,
                    programSlug: req.program.slug,
                    programName: req.program.name,
                };
                return req.session.save(err => {
                    if (err) return next(err);
                    // Use redirectAbsolute — we're under the target slug's router but
                    // need to send the user back to their current program's shell
                    res.redirectAbsolute(`/${req.session.programSlug}/switch-confirm`);
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

        if (req.session.emulateUserId) {
            req.realUser = user;
            const emulated = await User.findByPk(req.session.emulateUserId);
            if (emulated && req.program) emulated.program = req.program;
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
