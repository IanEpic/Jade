// auth.js
// Replaces the login block that appears at the top of every Perl CGI script:
//
//   my $email    = $query->cookie('email');
//   my $password = $query->cookie('password');
//   $user = login($email, $password, $emulateuser);
//   if (!$user) { readfile(...login_error()...); exit; }
//
// In Express this runs once as middleware on every protected route.
// Session is established at login and req.user is available in all route handlers.

import User from '../models/User.js';

// requireAuth: attach to any router that needs a logged-in user.
// Equivalent of the login block + "if (!$user) { ... exit; }" guard.
export async function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        return res.redirect('/login');
    }
    try {
        const user = await User.findByPk(req.session.userId, {
            include: ['program'],   // eager-load the program (equiv of $user->programid)
        });
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        // Emulate-user support (equiv of $emulateuser cookie)
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

// requireRole: optional — restrict routes to specific roles (admin, judge, etc.)
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.redirect('/login');
        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).render('error', { message: 'Access denied' });
        }
        next();
    };
}
