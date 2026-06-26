// services/prExport.js
// "Export PR Info": zips all high-res images/videos from a program's ACCEPTED entries.
// Files are named  [entryid](-DNU)-[pic|vid]-[NNN].ext  — the DNU tag appears only when the
// entrant opted out of media exposure. The zip is written to shared filestore (prExports/) so
// either node can serve it; a background worker builds it and emails the admin a link.

import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';   // archiver v8 is ESM-native: format-specific subclass
import { getPool, sql } from '../config/database.js';
import { filestore } from '../config.js';
import { mailHtml, parseSmtp } from './mailer.js';
import Program from '../models/Program.js';

const PR_DIR = path.join(filestore.root, 'prExports');

// Entries whose entrant opted out of media exposure (answered "Yes" to the opt-out question).
// The opt-out question is identified by its text (varies a little per program), among yes/no
// questions, so we don't depend on a fixed question id.
async function getDnuEntryIds(pool, programId) {
    const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    // Negative "opt-out" phrasing (the entrant is declining media use). Title varies a little
    // by program but is consistently an opt-OUT statement.
    const OPT = /opt.?out|do(?:n.?t| not)\s*wish|not wish to|do not wish/i;
    const qs = (await pool.request().query(
        `SELECT questionid, inputtype, questiontext FROM Question
         WHERE programid=${programId} AND deleted=0 AND inputtype IN ('radio','drop down list','checkbox')`
    )).recordset.filter(q => OPT.test(strip(q.questiontext)));
    if (!qs.length) return new Set();
    const typeByQ = new Map(qs.map(q => [q.questionid, q.inputtype]));
    const qIds = qs.map(q => q.questionid);

    const opts = (await pool.request().query(
        `SELECT inputoptionid, questionid, name FROM InputOption WHERE questionid IN (${qIds.join(',')}) AND deleted=0`
    )).recordset;
    const optName = new Map(opts.map(o => [String(o.inputoptionid), o.name]));
    const optIdsByQ = {};
    for (const o of opts) (optIdsByQ[o.questionid] = optIdsByQ[o.questionid] || new Set()).add(String(o.inputoptionid));

    const rows = (await pool.request().query(`
        SELECT r.entryid, r.questionid, r.value FROM Response r
        JOIN Entry e ON e.entryid = r.entryid
        WHERE e.programid=${programId} AND e.deleted=0 AND e.entryaccepted IS NOT NULL
          AND r.deleted=0 AND r.questionid IN (${qIds.join(',')}) AND r.value IS NOT NULL AND LEN(r.value) > 0
    `)).recordset;

    const dnu = new Set();
    for (const r of rows) {
        if (typeByQ.get(r.questionid) === 'checkbox') {
            // Single opt-out checkbox: ticked (any real option id present) = opt out.
            const ids = optIdsByQ[r.questionid] || new Set();
            const ticked = String(r.value).split(/[~,;]+/).map(t => t.trim())
                .some(t => t && t.toLowerCase() !== 'cb' && ids.has(t));
            if (ticked) dnu.add(r.entryid);
        } else if (/^\s*yes\b/i.test(optName.get(String(r.value).trim()) || '')) {
            dnu.add(r.entryid);
        }
    }
    return dnu;
}

// Resolve a stored media filename to a real file (Node uploads keep the extension, legacy Perl
// uploads were saved with no extension). Returns { src, ext } or null if missing on disk.
function resolveSrc(kind, value) {
    const dir = kind === 'image' ? filestore.originalImages : filestore.originalVideos;
    const ext = path.extname(value) || '';
    const withExt = path.join(dir, value);
    if (fs.existsSync(withExt)) return { src: withExt, ext };
    const noExt = path.join(dir, path.parse(value).name);
    if (fs.existsSync(noExt)) return { src: noExt, ext };
    return null;
}

// Plan the zip entries: { src, name } per media file, named per the convention.
export async function planPrMedia(programId) {
    const pool = await getPool();
    const dnu = await getDnuEntryIds(pool, programId);
    const media = (await pool.request().query(`
        SELECT e.entryid, q.inputtype, r.value
        FROM Entry e
        JOIN Response r ON r.entryid = e.entryid AND r.deleted = 0
        JOIN Question q ON q.questionid = r.questionid
        WHERE e.programid=${programId} AND e.deleted=0 AND e.entryaccepted IS NOT NULL
          AND q.inputtype IN ('image','video') AND r.value IS NOT NULL AND LEN(r.value) > 0
        ORDER BY e.entryid, q.inputtype, r.responseid
    `)).recordset;

    const counters = {};                 // entryid|kind -> running number
    const plan = [];
    const missing = [];
    for (const m of media) {
        const kind  = m.inputtype;        // 'image' | 'video'
        const label = kind === 'image' ? 'pic' : 'vid';
        const key   = m.entryid + '|' + label;
        counters[key] = (counters[key] || 0) + 1;
        const resolved = resolveSrc(kind, m.value);
        if (!resolved) { missing.push({ entryid: m.entryid, value: m.value }); continue; }
        const dnuTag = dnu.has(m.entryid) ? '-DNU' : '';
        const name = `${m.entryid}${dnuTag}-${label}-${String(counters[key]).padStart(3, '0')}${resolved.ext}`;
        plan.push({ src: resolved.src, name });
    }
    return { plan, missing };
}

// Build the zip for a queued request, update its row, and email the admin a download link.
export async function buildPrExport(row) {
    const pool = await getPool();
    const id = row.prexportid;
    try {
        await pool.request().input('id', sql.Int, id)
            .query("UPDATE PrExport SET status='running' WHERE prexportid=@id");

        const program = await Program.findByPk(row.programid);
        const { plan } = await planPrMedia(row.programid);

        fs.mkdirSync(PR_DIR, { recursive: true });
        const zipName = `PRExport_${program?.slug || row.programid}_${id}_${Date.now()}.zip`;
        const zipPath = path.join(PR_DIR, zipName);

        await new Promise((resolve, reject) => {
            const output  = fs.createWriteStream(zipPath);
            const archive = new ZipArchive({ zlib: { level: 0 } });   // store (media already compressed)
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            for (const f of plan) archive.file(f.src, { name: f.name });
            archive.finalize();
        });

        await pool.request()
            .input('id', sql.Int, id)
            .input('f', sql.NVarChar, zipName)
            .input('n', sql.Int, plan.length)
            .query("UPDATE PrExport SET status='done', filename=@f, filecount=@n, finishedat=SYSUTCDATETIME() WHERE prexportid=@id");

        if (row.requestedemail) {
            const base = (row.baseurl || '').replace(/\/+$/, '');
            const link = `${base}/${program?.slug}/prExport/download?id=${id}`;
            try {
                const fail = await mailHtml({
                    to: row.requestedemail,
                    from: program?.emailfromaddress || undefined,
                    subject: 'Your PR media export is ready',
                    html: `<p>Your PR media export for <strong>${program?.name || program?.slug}</strong> is ready ` +
                          `(${plan.length} file${plan.length === 1 ? '' : 's'}).</p>` +
                          `<p><a href="${link}">Download the zip</a></p>` +
                          `<p>The file is removed shortly after download.</p>`,
                    ...parseSmtp(program?.smtpserver),
                });
                if (fail) console.error('[prExport] notify email failed:', fail);
            } catch (e) {
                console.error('[prExport] notify email error:', e.message);
            }
        } else {
            console.warn('[prExport] no requestedemail on row', id, '— skipping notify');
        }
        return { ok: true, count: plan.length };
    } catch (err) {
        await pool.request().input('id', sql.Int, id).input('e', sql.NVarChar, String(err.message).slice(0, 1000))
            .query("UPDATE PrExport SET status='error', errormsg=@e, finishedat=SYSUTCDATETIME() WHERE prexportid=@id").catch(() => {});
        return { ok: false, error: err.message };
    }
}

// Latest export request for a program (for the page's initial state).
export async function getLatestPrExport(programId) {
    const pool = await getPool();
    return (await pool.request().input('p', sql.Int, programId).query(`
        SELECT TOP 1 prexportid, status, filecount, downloadedat, deletedat
        FROM PrExport WHERE programid=@p ORDER BY prexportid DESC
    `)).recordset[0] || null;
}

export function prExportPath(filename) {
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) return null;
    return path.join(PR_DIR, filename);
}

// Delete a request's zip from disk and stamp the row.
export async function deletePrExportFile(id, filename) {
    const p = prExportPath(filename);
    if (p) { try { fs.unlinkSync(p); } catch { /* already gone */ } }
    const pool = await getPool();
    await pool.request().input('id', sql.Int, id)
        .query('UPDATE PrExport SET deletedat=SYSUTCDATETIME() WHERE prexportid=@id');
}
