// middleware/resolveProgram.js
//
// Replaces the fqdn-based program lookup (getProgramByHost / DEV_FQDN).
// Extracts the slug from the URL (set by Express via /:slug param), looks up
// the Program, and attaches it to req.program.
//
// Also wraps res.redirect so that all existing absolute internal redirects
// (e.g. res.redirect('/home')) are automatically slug-prefixed
// (e.g. res.redirect('/aea25/home')) — meaning no changes are needed inside
// any individual route file.

import { getProgramBySlug } from '../services/auth.js';

export async function resolveProgram(req, res, next) {
    try {
        const slug = req.params.slug;
        const program = await getProgramBySlug(slug);

        if (!program) {
            return res.status(404).send(
                `Program "${slug}" not found. Check the URL and try again.`
            );
        }

        req.program = program;
        res.locals.program = program;
        res.locals.slug    = slug;

        // ── Redirect wrapper ──────────────────────────────────────────────────
        // Intercepts res.redirect() calls so absolute paths get slug-prefixed.
        // Handles both res.redirect(url) and res.redirect(status, url).
        // Leaves external URLs (http/https) and back-redirects untouched.
        const slugBase = `/${slug}`;
        const originalRedirect = res.redirect.bind(res);
        res.redirectAbsolute = originalRedirect; // escape hatch for cross-program redirects

        res.redirect = function (statusOrUrl, maybeUrl) {
            let status = 302;
            let url = statusOrUrl;

            if (typeof statusOrUrl === 'number') {
                status = statusOrUrl;
                url = maybeUrl;
            }

            if (typeof url === 'string' && url.startsWith('/') && !url.startsWith(slugBase)) {
                url = `${slugBase}${url}`;
            }

            return originalRedirect(status, url);
        };

        next();
    } catch (err) {
        next(err);
    }
}
