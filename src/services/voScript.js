// services/voScript.js
// Builds the "Finalist VO Script" data — the read-aloud nominee list per category.
//
// The stored finalisttext moves leading articles ("The"/"A") and ordinals ("3rd", "43rd")
// into a parenthetical after the event name (e.g. "…Symposium 2025 (The)", "…Showcase (3rd)
// 2024"). For a voiceover they must be read at the start, so we move them back to the front.
// Everything else about the finalisttext is kept verbatim (no legals, states as written).
// Acronym parentheticals like "(AIME)" are left in place.
//
// Finalists are listed in reverse entryid order (a stable pseudo-random running order).

import { getPool, sql } from '../config/database.js';

const STATE_NAMES = {
    NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia',
    SA: 'South Australia', TAS: 'Tasmania', NT: 'Northern Territory', ACT: 'Australian Capital Territory',
};

// Speech-friendly substitutions that are safe to apply deterministically. Pronunciation
// nuances (acronyms, "x"→"cross", number wording) are left for the human pass.
function speechSubs(s) {
    return s
        .replace(/\s*\|\s*/g, ' - ')        // "NSW | ACT" → "NSW - ACT"
        .replace(/\s*&\s*/g, ' and ')       // "Walk & Jog" → "Walk and Jog"
        .replace(/\s*<\s*/g, ' less than ') // "< 500 Delegates" → "less than 500 Delegates"
        .replace(/\s{2,}/g, ' ').trim();
}

// Expand trailing comma-separated state codes to full names (e.g. "…, Org, NSW" →
// "…, Org, New South Wales"). Only pure state-code segments at the very end are expanded,
// so state abbreviations embedded in an organisation name (e.g. "Tourism WA with …") are
// left for the human pass.
function expandTrailingStates(s) {
    const parts = s.split(',');
    for (let i = parts.length - 1; i >= 0; i--) {
        const seg  = parts[i].trim();
        const full = STATE_NAMES[seg.toUpperCase()];
        if (!full) break;
        parts[i] = parts[i].replace(seg, full);
    }
    return parts.join(',');
}

export function voFinalistText(finalisttext) {
    if (!finalisttext) return '';
    const ci   = finalisttext.indexOf(',');
    const tail = ci >= 0 ? finalisttext.slice(ci) : '';
    let name   = ci >= 0 ? finalisttext.slice(0, ci) : finalisttext;

    let article = null, ordinal = null;
    name = name.replace(/\s*\(([^)]+)\)/g, (m, inner) => {
        const t = inner.trim();
        if (/^(a|the)$/i.test(t))          { article = t; return ''; }
        if (/^\d+(st|nd|rd|th)$/i.test(t)) { ordinal = t; return ''; }
        return m;                           // keep acronyms / pronunciation notes etc.
    }).replace(/\s{2,}/g, ' ').trim();

    const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    const prefix = [article ? cap(article) : null, ordinal].filter(Boolean).join(' ');
    return expandTrailingStates(speechSubs((prefix ? prefix + ' ' : '') + name + tail));
}

// Speech-friendly category name for the heading (same safe substitutions).
export function voCategoryName(name) {
    return speechSubs(name || '');
}

// [{ category, finalists: [voText, …] }] in category order, finalists by entryid DESC.
// Ordinary categories list their finalists (Entry.finalist=1). "Headline" categories — those
// a category type feeds into (CategoryType.feedsto) — list the WINNERS (Entry.nominated=1) of
// every category in the feeding type(s). Both are merged in category (orda) order.
export async function getVoScript(programId) {
    const pool = await getPool();

    // Ordinary categories: their finalists.
    const finRows = (await pool.request().query(`
        SELECT c.categoryid, c.name AS category, c.orda, e.entryid, e.finalisttext
        FROM Entry e
        JOIN Category c ON c.categoryid = e.categoryid
        WHERE c.programid = ${programId} AND c.deleted = 0 AND e.deleted = 0
          AND ISNULL(e.finalist, 0) = 1
        ORDER BY c.orda, c.categoryid, e.entryid DESC
    `)).recordset;

    // Headline target categories (always shown, even before winners are recorded).
    const headTargets = (await pool.request().query(`
        SELECT DISTINCT hc.categoryid, hc.name AS category, hc.orda
        FROM CategoryType t
        JOIN Category hc ON hc.categoryid = t.feedsto AND hc.deleted = 0
        WHERE t.programid = ${programId} AND t.deleted = 0 AND t.feedsto IS NOT NULL
    `)).recordset;

    // Headline nominees: winners of every category in a type that feeds them.
    const headRows = (await pool.request().query(`
        SELECT t.feedsto AS categoryid, e.entryid, e.finalisttext
        FROM CategoryType t
        JOIN Category c ON c.categorytypeid = t.categorytypeid AND c.deleted = 0
        JOIN Entry e    ON e.categoryid = c.categoryid AND e.deleted = 0 AND ISNULL(e.nominated, 0) = 1
        WHERE t.programid = ${programId} AND t.deleted = 0 AND t.feedsto IS NOT NULL
        ORDER BY e.entryid DESC
    `)).recordset;

    const byId = {};
    const cats = [];
    const shell = (r, isHeadline) => {
        if (!byId[r.categoryid]) {
            byId[r.categoryid] = { categoryid: r.categoryid, orda: r.orda, category: voCategoryName(r.category), finalists: [], headline: !!isHeadline };
            cats.push(byId[r.categoryid]);
        }
        return byId[r.categoryid];
    };
    for (const r of finRows)     shell(r, false).finalists.push(voFinalistText(r.finalisttext));
    for (const r of headTargets) shell(r, true);
    for (const r of headRows)    byId[r.categoryid]?.finalists.push(voFinalistText(r.finalisttext));

    cats.sort((a, b) => (a.orda - b.orda) || (a.categoryid - b.categoryid));
    return cats.map(c => ({
        categoryid: c.categoryid,
        heading:    `The nominees for ${c.category} are:`,
        body:       c.finalists.join('\n'),
        // Headline awards depend on recorded winners — flag the empty ones for the user.
        note: (c.headline && c.finalists.length === 0)
            ? 'Winners not yet recorded — run again after winner nomination.'
            : null,
    }));
}

// ── Persistence (VoScript — one editable snapshot per program) ─────────────────

export async function loadVoScript(programId) {
    const pool = await getPool();
    const row = (await pool.request().input('p', sql.Int, programId)
        .query('SELECT content FROM dbo.VoScript WHERE programid = @p')).recordset[0];
    if (!row) return null;
    try { return JSON.parse(row.content); } catch { return null; }
}

export async function saveVoScript(programId, items) {
    const pool = await getPool();
    // Lines are shown with a leading "• " in the editor for readability; strip any bullet
    // prefix so the stored body stays clean (the Word export adds real bullets itself).
    const cleanBody = b => String(b || '').split('\n')
        .map(l => l.replace(/^\s*[••*-]\s+/, '').trim())
        .filter(Boolean).join('\n');
    const content = JSON.stringify((items || []).map(i => ({
        categoryid: i.categoryid, heading: String(i.heading || ''), body: cleanBody(i.body),
    })));
    await pool.request()
        .input('p', sql.Int, programId)
        .input('c', sql.NVarChar(sql.MAX), content)
        .query(`
            MERGE dbo.VoScript AS t
            USING (SELECT @p AS programid) AS src ON t.programid = src.programid
            WHEN MATCHED THEN UPDATE SET content = @c, updatedat = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT (programid, content, updatedat) VALUES (@p, @c, SYSUTCDATETIME());
        `);
}

// Items for the editor / export: the saved (edited) snapshot if present, else the derived
// script built from finalist text. Returns { items, saved }.
export async function getVoScriptItems(programId) {
    const saved = await loadVoScript(programId);
    if (saved && saved.length) return { items: saved, saved: true };
    return { items: await getVoScript(programId), saved: false };
}
