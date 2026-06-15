// services/template.js
// Replaces: readfile($standardhtml, [$content]) from EPIC::Common
//
// Usage in routes:
//   res.renderInShell('login', { program, form: true, errors: [] });
//   res.renderInShell('login', { program, form: true }, { useLoginShell: true });

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIEWS_ROOT    = path.join(__dirname, '../views');
const TEMPLATE_ROOT = process.env.TEMPLATE_ROOT
    || 'C:/Data/WebProjects/Apache/htdocs/jade/cgi-bin/design';

// Express middleware — attaches res.renderInShell() to every response.
export function shellMiddleware(req, res, next) {
    res.renderInShell = async (viewName, locals = {}, options = {}) => {
        try {
            const program = req.program || locals.program;
            if (!program) throw new Error('No program on request — cannot render shell');

            const slug      = programSlug(program);
            const pugLayout = path.join(VIEWS_ROOT, 'programs', slug, 'layout.pug');
            const pugExists = await fileExists(pugLayout);

            if (pugExists) {
                // New program — render via Pug with per-program layout
                return res.render(viewName, { ...locals, ...options });
            }

            // Legacy HTML shell — replaces readfile($program->standardhtml(), [$content])
            const shellFile = options.useLoginShell ? program.loginhtml : program.standardhtml;
            const shellPath = path.join(TEMPLATE_ROOT, shellFile);

            let shell;
            try {
                shell = await fs.readFile(shellPath, 'utf8');
            } catch {
                throw new Error(`Template shell not found: ${shellPath}`);
            }

            // Inject our app stylesheet just before </head> so it loads after
            // the program's own CSS and our styles win specificity battles.
            shell = shell.replace(/<\/head>/i,
                '  <link rel="stylesheet" href="/css/main.css">\n</head>');

            // Render the Pug view to an HTML string using Express's render
            // Pass layout:false so the view doesn't try to extend layout.pug
            res.render(viewName, { ...locals, ...options, layout: false }, (err, content) => {
                if (err) return next(err);
                // Replaces: $_ =~ s/<CGIINSERT>/@{$_[1]}/g
                const html = shell.replace('<CGIINSERT>', content);
                res.send(html);
            });

        } catch (err) {
            next(err);
        }
    };
    next();
}

// Scaffold a new program's Pug/Stylus structure
export async function scaffoldProgram(program) {
    const slug    = programSlug(program);
    const pugDir  = path.join(VIEWS_ROOT, 'programs', slug);
    const stylDir = path.join(__dirname, '../styles/programs', slug);
    const pubDir  = path.join(__dirname, '../../public/programs', slug);

    await fs.mkdir(pugDir,  { recursive: true });
    await fs.mkdir(stylDir, { recursive: true });
    await fs.mkdir(pubDir,  { recursive: true });

    const pugLayout = path.join(pugDir, 'layout.pug');
    if (!await fileExists(pugLayout)) {
        await fs.writeFile(pugLayout,
            `extends ../../layout\n\nblock styles\n  link(rel='stylesheet' href='/programs/${slug}/css/main.css')\n`
        );
    }

    const stylFile = path.join(stylDir, 'main.styl');
    if (!await fileExists(stylFile)) {
        await fs.writeFile(stylFile,
            `// ${program.name} theme\n@import '../../main'\n\n// Override variables here:\n// color-gold = #your-brand-colour\n`
        );
    }

    return { pugLayout, stylFile, pubDir };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function programSlug(program) {
    return program.fqdn
        ? program.fqdn.replace(/[^a-z0-9]/gi, '-').toLowerCase()
        : `program-${program.programid}`;
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

