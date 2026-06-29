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

import fsp from 'fs/promises';
import path from 'path';
import { server } from '../config.js';

const TEMPLATE_ROOT = process.env.TEMPLATE_ROOT || 'C:/Data/WebProjects/Apache/htdocs/jade/cgi-bin/design';

// Dark defaults — mirror the :root values in styles/main.styl. A theme overrides a subset; the
// editor pre-fills unset tokens from here. Keep in sync with main.styl.
export const DEFAULT_TOKENS = {
    'color-bg': '#000000', 'color-text': '#ffffff', 'color-muted': '#cccccc',
    'color-accent': '#cf9702', 'color-accent-strong': '#c48f06', 'color-accent-nav': '#ffba01',
    'color-link': '#baab85', 'on-accent': '#000000',
    'border': '#555555', 'border-mid': '#666666', 'border-2': '#3a3a3a', 'border-subtle': '#333333',
    'border-faint': '#2a2a2a', 'border-dashed': '#444444', 'border-row': '#383838', 'border-strong': '#ffffff',
    'surface': '#1a1a1a', 'surface-1': '#1e1e1e', 'surface-2': '#222222', 'surface-deep': '#111111',
    'surface-sunken': '#151515', 'surface-raised': '#2a2a2a', 'header-bg': '#000000', 'header-text': '#ffffff', 'footer-bg': '#000000',
    'text-strong': '#dddddd', 'text-label': '#bbbbbb', 'text-dim': '#888888', 'text-faint': '#777777',
    'text-fainter': '#999999', 'text-arrow': '#aaaaaa',
    'input-bg': '#000000', 'input-border': '#ffffff',
    'btn-bg': '#ffffff', 'btn-text': '#000000', 'btn-active-text': '#ffffff',
    'btn-secondary-text': '#bbbbbb', 'btn-secondary-border': '#888888', 'color-danger': '#cc4444',
    'ok-bg': '#1a4a1a', 'ok-text': '#ffffff', 'ok-border': '#4caf50',
    'err-bg': '#7a2a00', 'err-text': '#ffffff', 'err-border': '#cc4444',
    'info-bg': '#13344a', 'info-text': '#ffffff', 'info-border': '#64b5f6',
};

// A sensible neutral LIGHT preset (admins tweak from here / via AI-from-website later).
export const LIGHT_PRESET = {
    'color-bg': '#f4f6f8', 'color-text': '#1b2733', 'color-muted': '#475663',
    'color-accent': '#0a66c2', 'color-accent-strong': '#084f96', 'color-accent-nav': '#0a66c2',
    'color-link': '#0a66c2', 'on-accent': '#ffffff',
    'border': '#cdd7e0', 'border-mid': '#b8c4cf', 'border-2': '#dbe3ea', 'border-subtle': '#e2e8ee',
    'border-faint': '#eef2f6', 'border-dashed': '#c2cdd8', 'border-row': '#e2e8ee', 'border-strong': '#9fb0bf',
    'surface': '#ffffff', 'surface-1': '#f7f9fb', 'surface-2': '#f0f3f6', 'surface-deep': '#e8edf2',
    'surface-sunken': '#eef2f6', 'surface-raised': '#e2e8ee', 'header-bg': '#0a66c2', 'footer-bg': '#0a66c2',
    'text-strong': '#1b2733', 'text-label': '#5b6b7b', 'text-dim': '#6b7a89', 'text-faint': '#8a96a3',
    'text-fainter': '#6b7a89', 'text-arrow': '#7c8a98',
    'input-bg': '#ffffff', 'input-border': '#cdd7e0',
    'btn-bg': '#0a66c2', 'btn-text': '#ffffff', 'btn-active-text': '#ffffff',
    'btn-secondary-text': '#1b2733', 'btn-secondary-border': '#9fb0bf', 'color-danger': '#cc4444',
};

// Five CORE colours the editor exposes; everything else is derived from them client-side (with
// optional per-token overrides in the Advanced section).
export const CORE_KEYS = [
    { key: 'accent',  label: 'Accent / brand' },
    { key: 'bg',      label: 'Page background' },
    { key: 'surface', label: 'Surface (cards)' },
    { key: 'text',    label: 'Text' },
    { key: 'border',  label: 'Borders' },
];
export const DARK_CORE  = { accent: '#cf9702', bg: '#000000', surface: '#1a1a1a', text: '#ffffff', border: '#555555' };
export const LIGHT_CORE = { accent: '#0a66c2', bg: '#f4f6f8', surface: '#ffffff', text: '#1b2733', border: '#cdd7e0' };

// Curated font choices (no free typing). `stack` is the CSS font-family; `google` (if set) is the
// Google Fonts css2 family spec the editor combines into a single stylesheet URL.
export const FONTS = [
    { name: 'System default',          stack: '',                                google: '' },
    { name: 'Arial',                   stack: 'Arial, Helvetica, sans-serif',    google: '' },
    { name: 'Helvetica',               stack: 'Helvetica, Arial, sans-serif',    google: '' },
    { name: 'Verdana',                 stack: 'Verdana, Geneva, sans-serif',     google: '' },
    { name: 'Georgia (serif)',         stack: 'Georgia, serif',                  google: '' },
    { name: 'Times (serif)',           stack: '"Times New Roman", Times, serif', google: '' },
    { name: 'Inter',                   stack: 'Inter, sans-serif',               google: 'Inter:wght@400;600;700' },
    { name: 'Roboto',                  stack: 'Roboto, sans-serif',              google: 'Roboto:wght@400;500;700' },
    { name: 'Open Sans',               stack: '"Open Sans", sans-serif',         google: 'Open+Sans:wght@400;600;700' },
    { name: 'Lato',                    stack: 'Lato, sans-serif',                google: 'Lato:wght@400;700' },
    { name: 'Montserrat',              stack: 'Montserrat, sans-serif',          google: 'Montserrat:wght@400;600;700' },
    { name: 'Poppins',                 stack: 'Poppins, sans-serif',             google: 'Poppins:wght@400;600;700' },
    { name: 'Nunito',                  stack: 'Nunito, sans-serif',              google: 'Nunito:wght@400;600;700' },
    { name: 'Raleway',                 stack: 'Raleway, sans-serif',             google: 'Raleway:wght@400;600;700' },
    { name: 'Work Sans',               stack: '"Work Sans", sans-serif',         google: 'Work+Sans:wght@400;600;700' },
    { name: 'Source Sans 3',           stack: '"Source Sans 3", sans-serif',     google: 'Source+Sans+3:wght@400;600;700' },
    { name: 'Merriweather (serif)',    stack: 'Merriweather, serif',             google: 'Merriweather:wght@400;700' },
    { name: 'Playfair Display (serif)',stack: '"Playfair Display", serif',       google: 'Playfair+Display:wght@400;700' },
    { name: 'Oswald',                  stack: 'Oswald, sans-serif',              google: 'Oswald:wght@400;600' },
];

// Editor layout — labelled groups of token keys (Advanced section).
export const TOKEN_GROUPS = [
    { name: 'Brand',            keys: ['color-accent', 'color-accent-strong', 'color-accent-nav', 'color-link', 'on-accent'] },
    { name: 'Base',             keys: ['color-bg', 'color-text', 'color-muted'] },
    { name: 'Surfaces',         keys: ['surface', 'surface-1', 'surface-2', 'surface-deep', 'surface-sunken', 'surface-raised', 'header-bg', 'header-text', 'footer-bg'] },
    { name: 'Borders',          keys: ['border', 'border-mid', 'border-2', 'border-subtle', 'border-faint', 'border-dashed', 'border-row', 'border-strong'] },
    { name: 'Text scale',       keys: ['text-strong', 'text-label', 'text-dim', 'text-faint', 'text-fainter', 'text-arrow'] },
    { name: 'Inputs & buttons', keys: ['input-bg', 'input-border', 'btn-bg', 'btn-text', 'btn-active-text', 'btn-secondary-text', 'btn-secondary-border'] },
    { name: 'Status — success', keys: ['ok-bg', 'ok-text', 'ok-border'] },
    { name: 'Status — error',   keys: ['err-bg', 'err-text', 'err-border', 'color-danger'] },
    { name: 'Status — info',    keys: ['info-bg', 'info-text', 'info-border'] },
];

// Validate + normalise a theme object posted from the editor (returns a clean object or throws).
export function sanitizeThemeInput(raw) {
    const t = (raw && typeof raw === 'object') ? raw : {};
    const isHex = (v) => /^#[0-9a-fA-F]{3,8}$/.test(String(v));
    const out = { mode: t.mode === 'light' ? 'light' : 'dark', tokens: {} };
    const tokens = (t.tokens && typeof t.tokens === 'object') ? t.tokens : {};
    for (const [k, v] of Object.entries(tokens)) {
        if (/^[a-z0-9-]+$/i.test(k) && isHex(v)) out.tokens[k] = v;
    }
    // Core colours + per-token overrides (so the editor can reconstruct the derivation).
    if (t.core && typeof t.core === 'object') {
        const core = {};
        for (const { key } of CORE_KEYS) if (isHex(t.core[key])) core[key] = t.core[key];
        if (Object.keys(core).length) out.core = core;
    }
    if (t.overrides && typeof t.overrides === 'object') {
        const ov = {};
        for (const [k, v] of Object.entries(t.overrides)) if (/^[a-z0-9-]+$/i.test(k) && isHex(v)) ov[k] = v;
        if (Object.keys(ov).length) out.overrides = ov;
    }
    if (t.background && typeof t.background === 'object') {
        const bg = {};
        if (/^#[0-9a-fA-F]{3,8}$/.test(String(t.background.color || ''))) bg.color = t.background.color;
        if (/^#[0-9a-fA-F]{3,8}$|^rgba?\(/.test(String(t.background.overlay || ''))) bg.overlay = t.background.overlay;
        if (Object.keys(bg).length) out.background = bg;
    }
    if (['left', 'center', 'right'].includes(t.logoAlign)) out.logoAlign = t.logoAlign;
    if (['fill', 'large', 'medium', 'small'].includes(t.logoSize)) out.logoSize = t.logoSize;
    const hh = parseInt(t.headerHeight, 10);
    if (hh) out.headerHeight = Math.min(160, Math.max(44, hh));
    if (typeof t.footer === 'string' && t.footer.trim()) out.footer = t.footer.slice(0, 4000);
    if (t.font && typeof t.font === 'object') {
        const f = {};
        if (safeCss(t.font.body)) f.body = String(t.font.body).slice(0, 60);
        if (safeCss(t.font.heading)) f.heading = String(t.font.heading).slice(0, 60);
        if (t.font.googleUrl && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(t.font.googleUrl)) f.googleUrl = t.font.googleUrl;
        if (Object.keys(f).length) out.font = f;
    }
    return out;
}

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

// Build the injected <style> block (':root' token overrides + body background image/scrim + fonts).
export function buildThemeStyle(theme, { slug = '' } = {}) {
    if (!theme) return '';
    let root = '';
    for (const [k, v] of Object.entries(theme.tokens || {})) {
        if (!/^[a-z0-9-]+$/i.test(k)) continue;          // token name whitelist
        const val = safeCss(v);
        if (val) root += `--${k}:${val};`;
    }

    // The page background colour is the --color-bg token (main.css applies it to the themed body),
    // so there's no separate background-colour here — only an optional background IMAGE + scrim.
    const bg = theme.background || {};
    const parts = [];
    // Uploaded image (filestore, served via /:slug/admin/themebg) takes precedence over an external URL.
    const img     = bg.image ? `/${slug}/admin/themebg` : (bg.imageUrl ? safeCss(bg.imageUrl) : null);
    const overlay = safeCss(bg.overlay);
    if (img) {
        const layers = overlay ? `linear-gradient(${overlay},${overlay}),url('${img}')` : `url('${img}')`;
        parts.push(`background-image:${layers}`);
        parts.push(`background-size:${safeCss(bg.size) || 'cover'}`);
        parts.push(`background-position:${safeCss(bg.position) || 'center center'}`);
        parts.push(`background-repeat:${safeCss(bg.repeat) || 'no-repeat'}`);
        parts.push('background-attachment:fixed');
    }
    const fontBody = theme.font && safeCss(theme.font.body);
    if (fontBody) parts.push(`font-family:${fontBody}`);
    // Target body.themed (matches the legacy `body.themed{background-image:none}` specificity and
    // comes later in source) so the theme background image actually wins.
    const body = parts.length ? `body.themed{${parts.join(';')}}` : '';

    const fontHeading = theme.font && safeCss(theme.font.heading);
    const headings = fontHeading ? `h1,h2,h3,h4,h5,h6{font-family:${fontHeading}}` : '';

    if (!root && !body && !headings) return '';
    return `<style>${root ? `:root{${root}}` : ''}${body}${headings}</style>`;
}

// Footer HTML — admin-authored, but strip anything executable before injecting into the shell.
function safeFooter(html) {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/javascript:/gi, '')
        .slice(0, 4000);
}

// Optional Google Fonts <link> for the theme's fonts.
function fontLink(theme) {
    const url = theme && theme.font && safeCss(theme.font.googleUrl);
    return (url && /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(url))
        ? `<link rel="stylesheet" href="${url}">` : '';
}

// The shared shell for themed programs. Mirrors the legacy shell contract: contains `</head>` and
// `<CGIINSERT>` so app.js's existing favicon/content/rewriter/nonce injection works unchanged.
export function buildThemedShell(program, theme, { useLoginShell = false, buildHash = '', menuButtons = [] } = {}) {
    const title = (program.name || 'JADE Awards').replace(/[<>]/g, '');
    // 'light' | 'dark' (default dark) — exposed on <body data-theme> so client widgets (e.g. the
    // TinyMCE editor skin) can match the theme. Legacy programs have no data-theme → 'dark'.
    const mode = (theme && theme.mode === 'light') ? 'light' : 'dark';
    // Uploaded logo (filestore, served via /:slug/admin/themelogo) → header band; else program name.
    const logoSrc = (theme && theme.logo) ? `/${program.slug}/admin/themelogo` : null;
    const logoAlign = (theme && (theme.logoAlign === 'left' || theme.logoAlign === 'right')) ? theme.logoAlign : 'center';
    const size = (theme && theme.logoSize) || 'fill';
    const headerH = Math.min(160, Math.max(44, parseInt(theme && theme.headerHeight, 10) || 72));

    // Top button menu (from the page locals) rendered into the header for themed programs; the
    // content copy (#top-menu-bar) is hidden via CSS so it isn't duplicated.
    const nav = (menuButtons && menuButtons.length)
        ? `<nav class="themed-nav">${menuButtons.map(b =>
              `<a href="${String(b.url || '#').replace(/"/g, '&quot;')}"${b.newwindow ? ' target="_blank"' : ''}>${b.text || '&nbsp;'}</a>`).join('')}</nav>`
        : '';
    // center + menu → stack (logo on top, menu centred below). 'fill' becomes a fixed height when
    // stacked since there's no single bar height to fill.
    const stacked = !!nav && logoAlign === 'center';
    const logoH = stacked
        ? ({ fill: '46px', large: '52px', medium: '40px', small: '28px' })[size]
        : ({ fill: '100%', large: '52px', medium: '40px', small: '28px' })[size];
    const brand = `<div class="themed-brand">${logoSrc
        ? `<img src="${logoSrc}" alt="${title}" class="themed-logo" style="height:${logoH}">`
        : `<span class="themed-title">${title}</span>`}</div>`;

    let header;
    if (stacked) {
        header = `<header class="themed-header themed-stacked" style="min-height:${headerH}px">${brand}${nav}</header>`;
    } else if (nav) {
        const inner = logoAlign === 'right' ? `${nav}${brand}` : `${brand}${nav}`;
        header = `<header class="themed-header" style="height:${headerH}px;justify-content:space-between">${inner}</header>`;
    } else {
        const align = logoAlign === 'left' ? 'flex-start' : logoAlign === 'right' ? 'flex-end' : 'center';
        header = `<header class="themed-header" style="height:${headerH}px;justify-content:${align}">${brand}</header>`;
    }

    // Footer (editable HTML, sanitised) — falls back to a simple copyright line.
    const footerHtml = safeFooter(theme && theme.footer) || `&copy; ${new Date().getFullYear()} ${title}`;
    const footer = `<footer class="themed-footer">${footerHtml}</footer>`;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="/css/main.css?v=${buildHash}">
${fontLink(theme)}
${buildThemeStyle(theme, { slug: program.slug })}
</head>
<body class="themed${useLoginShell ? ' themed-login' : ''}" data-theme="${mode}">
${header}
<div id="cgiContent">
<CGIINSERT>
</div>
${footer}
</body>
</html>`;
}

// ── Transactional email shell ──────────────────────────────────────────────────
// Content partials use CSS custom properties (var(--token)), which email clients don't support, so
// resolve them to literal values before sending. Emails are ALWAYS LIGHT (a dark email is unwieldy
// in an inbox): a branded masthead (the program's header colour + portal logo, so even a white logo
// shows) over a white body with dark text. Themed programs (1057+) use buildThemedEmail; legacy
// programs (≤1056) keep their emailhtml file (vars resolved to dark defaults to match 1056's design).

export function resolveCssVars(html, tokens) {
    const t = tokens || DEFAULT_TOKENS;
    return String(html).replace(/var\(\s*--([a-z0-9-]+)\s*\)/gi, (m, k) => t[k] || DEFAULT_TOKENS[k] || m);
}

// Light body palette for email, carrying the program's brand/accent colours so links & buttons stay
// on-brand while surfaces/text/borders are light (readable in any inbox).
function emailLightTokens(theme) {
    const t = (theme && theme.tokens) || {};
    const base = Object.assign({}, DEFAULT_TOKENS, LIGHT_PRESET);
    ['color-accent', 'color-accent-strong', 'color-accent-nav', 'color-link', 'on-accent', 'btn-bg', 'btn-text']
        .forEach(k => { if (t[k]) base[k] = t[k]; });
    return base;
}

export function buildThemedEmail(program, theme, contentHtml) {
    const themeTk = Object.assign({}, DEFAULT_TOKENS, (theme && theme.tokens) || {}); // masthead (program header colour)
    const lt = emailLightTokens(theme);                                              // light body + brand accent
    const title = (program.name || 'JADE Awards').replace(/[<>]/g, '');
    const base = (server.baseUrl || '').replace(/\/+$/, '');
    // A dedicated full-width email banner (theme.emailHeader) takes precedence; else the portal logo
    // on the masthead colour; else the program name as text.
    const banner = theme && theme.emailHeader ? `${base}/${program.slug}/admin/emailheader` : null;
    const logo = theme && theme.logo ? `${base}/${program.slug}/admin/themelogo` : null;
    const mastheadRow = banner
        ? `<tr><td style="padding:0;line-height:0;background:${themeTk['header-bg']};"><img src="${banner}" alt="${title}" style="display:block;width:100%;max-width:600px;"></td></tr>`
        : `<tr><td style="background:${themeTk['header-bg']};padding:18px 24px;text-align:center;">${logo
            ? `<img src="${logo}" alt="${title}" style="max-height:50px;max-width:260px;">`
            : `<span style="color:${themeTk['header-text']};font-size:20px;font-weight:600;">${title}</span>`}</td></tr>`;
    const footer = safeFooter(theme && theme.footer) || `&copy; ${new Date().getFullYear()} ${title}`;
    const body = resolveCssVars(contentHtml, lt);
    return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:${lt['color-bg']};font-family:Arial,Helvetica,sans-serif;">
<table align="center" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin:0 auto;background:${lt['surface']};border:1px solid ${lt['border']};border-radius:8px;overflow:hidden;">
${mastheadRow}
<tr><td style="padding:24px;color:${lt['color-text']};font-size:14px;line-height:1.55;">${body}</td></tr>
<tr><td style="background:${lt['surface-2']};padding:16px 24px;text-align:center;color:${lt['color-muted']};font-size:12px;border-top:1px solid ${lt['border']};">${footer}</td></tr>
</table></body></html>`;
}

// Representative invoice content for the Email Setup live preview (uses var() like the real
// formInvoice-content, so the preview exercises the same colour resolution).
const SAMPLE_EMAIL_CONTENT = `
<h2 style="color:var(--color-accent-strong);margin:0 0 4px;font-size:18px;">Tax Invoice</h2>
<p style="color:var(--color-muted);margin:0 0 16px;font-size:13px;">Invoice No 1042 &nbsp;·&nbsp; Issued today</p>
<p style="color:var(--color-text);margin:0 0 14px;">Dear entrant, thank you for your entry. Your invoice is below.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
  <tr><td style="border-bottom:1px solid var(--border-subtle);padding:7px 4px;color:var(--color-text);">Best Live Event &mdash; "Harbour Festival"</td><td style="border-bottom:1px solid var(--border-subtle);padding:7px 4px;text-align:right;color:var(--color-text);">$550.00</td></tr>
  <tr><td style="padding:7px 4px;color:var(--color-text);font-weight:700;">Total (inc GST)</td><td style="padding:7px 4px;text-align:right;color:var(--color-text);font-weight:700;">$550.00</td></tr>
</table>
<p style="color:var(--color-muted);font-size:12px;margin:0;">Payment instructions: pay by EFT to BSB 000-000, Acc 12345678, ref INV1042.</p>`;

export function buildSampleEmail(program, theme) {
    return buildThemedEmail(program, theme || parseTheme(program), SAMPLE_EMAIL_CONTENT);
}

// Wrap rendered email content in the program's shell (themed or legacy file). Async (legacy reads a file).
export async function renderEmailShell(program, contentHtml) {
    const theme = parseTheme(program);
    if (theme) return buildThemedEmail(program, theme, contentHtml);
    const resolved = resolveCssVars(contentHtml, DEFAULT_TOKENS);
    const shell = await fsp.readFile(path.join(TEMPLATE_ROOT, program.emailhtml), 'utf8');
    return shell.replace('<CGIINSERT>', resolved);
}
