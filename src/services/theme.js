// services/theme.js
// Per-program look & feel as design tokens. A themed program (Program.theme JSON set) renders via
// the shared themed shell with its tokens injected as :root overrides — so the whole UI (incl.
// dark↔light) flips without per-program files. Legacy programs (≤1056, no theme) are untouched.
//
// Theme JSON shape (all optional):
//   {
//     "tokens":     { "color-accent":"#0066cc", "color-bg":"#fff", "color-text":"#1a1a1a", ... },
//     "background": { "color":"#f5f5f5", "imageUrl":"https://…", "size":"cover",
//                     "position":"center", "repeat":"no-repeat", "overlay":"rgba(0,0,0,.45)" },
//     "logoUrl":    "https://…",
//     "font":       { "body":"Inter", "heading":"Poppins", "googleUrl":"https://fonts.…" }
//   }
// Token keys map to the --<key> CSS custom properties defined in styles/main.styl.

// Conservative CSS-value sanitiser: blocks anything that could break out of the <style>/property
// (`< > ; { } @` and url(javascript:)). Allows colours, rgb()/rgba(), url('…'), %, fonts, etc.
function safeCss(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s || /[<>;{}@]/.test(s) || /javascript:/i.test(s) || /expression\s*\(/i.test(s)) return null;
    return s.slice(0, 200);
}

export function parseTheme(program) {
    if (!program || !program.theme) return null;
    try {
        const t = typeof program.theme === 'string' ? JSON.parse(program.theme) : program.theme;
        return (t && typeof t === 'object') ? t : null;
    } catch { return null; }
}

// Build the injected <style> block (':root' token overrides + body background/scrim).
export function buildThemeStyle(theme) {
    if (!theme) return '';
    let root = '';
    for (const [k, v] of Object.entries(theme.tokens || {})) {
        if (!/^[a-z0-9-]+$/i.test(k)) continue;          // token name whitelist
        const val = safeCss(v);
        if (val) root += `--${k}:${val};`;
    }

    let body = '';
    const bg = theme.background || {};
    const parts = [];
    const color   = safeCss(bg.color);
    const img     = bg.imageUrl ? safeCss(bg.imageUrl) : null;
    const overlay = safeCss(bg.overlay);
    if (color) parts.push(`background-color:${color}`);
    if (img && /^https?:\/\//i.test(img)) {
        // Overlay/scrim (for legibility over a busy image) layered above the image.
        const layers = overlay ? `linear-gradient(${overlay},${overlay}),url('${img}')` : `url('${img}')`;
        parts.push(`background-image:${layers}`);
        parts.push(`background-size:${safeCss(bg.size) || 'cover'}`);
        parts.push(`background-position:${safeCss(bg.position) || 'center center'}`);
        parts.push(`background-repeat:${safeCss(bg.repeat) || 'no-repeat'}`);
        parts.push('background-attachment:fixed');
    } else if (color) {
        parts.push('background-image:none');
    }
    const fontBody = theme.font && safeCss(theme.font.body);
    if (fontBody) parts.push(`font-family:${fontBody},sans-serif`);
    if (parts.length) body = `body{${parts.join(';')}}`;

    if (!root && !body) return '';
    return `<style>${root ? `:root{${root}}` : ''}${body}</style>`;
}

// Optional Google Fonts <link> for the theme's fonts.
function fontLink(theme) {
    const url = theme && theme.font && safeCss(theme.font.googleUrl);
    return (url && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(url))
        ? `<link rel="stylesheet" href="${url}">` : '';
}

// The shared shell for themed programs. Mirrors the legacy shell contract: contains `</head>` and
// `<CGIINSERT>` so app.js's existing favicon/content/rewriter/nonce injection works unchanged.
export function buildThemedShell(program, theme, { useLoginShell = false, buildHash = '' } = {}) {
    const title = (program.name || 'JADE Awards').replace(/[<>]/g, '');
    // 'light' | 'dark' (default dark) — exposed on <body data-theme> so client widgets (e.g. the
    // TinyMCE editor skin) can match the theme. Legacy programs have no data-theme → 'dark'.
    const mode = (theme && theme.mode === 'light') ? 'light' : 'dark';
    const logo  = theme && safeCss(theme.logoUrl);
    const header = (logo && /^https?:\/\//i.test(logo))
        ? `<header class="themed-header"><img src="${logo}" alt="${title}" class="themed-logo"></header>`
        : `<header class="themed-header"><span class="themed-title">${title}</span></header>`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="/css/main.css?v=${buildHash}">
${fontLink(theme)}
${buildThemeStyle(theme)}
</head>
<body class="themed${useLoginShell ? ' themed-login' : ''}" data-theme="${mode}">
${header}
<div id="cgiContent">
<CGIINSERT>
</div>
</body>
</html>`;
}
