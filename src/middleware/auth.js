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
        const user = await User.findByPk(req.session.userId, {
            include: ['program'],
        });
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }

        if (req.session.emulateUserId) {
            req.realUser = user;
            req.user = await User.findByPk(req.session.emulateUserId, {
                include: ['program'],
            });
        } else {
            req.user = user;
        }
        next();
    } catch (err) {
        next(err);
    }
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
