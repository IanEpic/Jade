// services/cqDocs.js
// Generates the "Categories, Criteria & Questions" documents for a program — one combined
// document covering all categories plus one per category — as branded Word (.docx) and PDF.
//
// Pipeline: data → docx (via the `docx` library, which gives us a black header band with the
// program's logo and a running "Page X of Y" footer) → PDF (via headless LibreOffice, so Word
// and PDF are identical). Output is written to the shared filestore (cqdocs/{programid}/) so
// either node can serve it, and the program's Downloads page HTML is rebuilt to link them.
//
// Admin triggers a (re)generation from Admin → Tools → Category Documents; entrants download
// from the portal Downloads page.

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import sharp from 'sharp';
import {
    Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
    AlignmentType, PageNumber, BorderStyle, Tab, TabStopType, TabStopPosition,
} from 'docx';
import { getPool, sql } from '../config/database.js';
import { filestore } from '../config.js';
import Program from '../models/Program.js';

const FILESTORE_ROOT = process.env.FILESTORE_ROOT || filestore.root;

// Resolve the LibreOffice binary: explicit env var, else 'soffice' on PATH (Linux/prod), else
// the standard Windows install locations (dev). On Windows we use soffice.com — the console
// wrapper that blocks until the conversion finishes; soffice.exe can return before the PDF is
// written, racing the existence check below. Falls back to 'soffice' so the error is clear.
function resolveSoffice() {
    if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
    for (const p of [
        'C:/Program Files/LibreOffice/program/soffice.com',
        'C:/Program Files (x86)/LibreOffice/program/soffice.com',
    ]) { if (fs.existsSync(p)) return p; }
    return 'soffice';
}
const SOFFICE = resolveSoffice();

// One folder per program on the shared filestore holds all its generated assets.
//   {root}/programs/{programid}/docheader.<ext>   ← uploaded header logo
//   {root}/programs/{programid}/cqdocs/           ← generated Word/PDF + manifest.json
export const programDir = (programId) => path.join(FILESTORE_ROOT, 'programs', String(programId));
export const docHeaderPath = (programId, filename) =>
    (!filename || /[\\/]|\.\./.test(filename)) ? null : path.join(programDir(programId), filename);

const TEAL   = '1F6F8B';   // category title
const DARK   = '222222';   // section headings / body
const GREY   = '666666';   // helper text
const ACCENT = 'C48F06';   // word-limit accent (matches portal)

const cqDir = (programId) => path.join(programDir(programId), 'cqdocs');

// ── Data ──────────────────────────────────────────────────────────────────────

export async function getProgramCQData(programId) {
    const pool = await getPool();
    const cats = (await pool.request().query(`
        SELECT categoryid, name, shortname, description, orda
        FROM Category
        WHERE programid=${programId} AND deleted=0 AND ISNULL(adminonly,0)=0
        ORDER BY ISNULL(orda, 999999), name
    `)).recordset;

    for (const c of cats) {
        c.criteria = (await pool.request().query(`
            SELECT description, weight, orda FROM Criteria
            WHERE categoryid=${c.categoryid} ORDER BY ISNULL(orda,999999), criteriaid
        `)).recordset;
        c.eligibility = (await pool.request().query(`
            SELECT el.eligibilityrule, l.orda
            FROM CategoryEligibilityLink l JOIN Eligibility el ON el.eligibilityid=l.eligibilityid
            WHERE l.categoryid=${c.categoryid} AND ISNULL(el.deleted,0)=0
            ORDER BY ISNULL(l.orda,999999), el.eligibilityid
        `)).recordset;
        c.questions = (await pool.request().query(`
            SELECT q.questionid, q.inputtype, q.maxsize, q.questiontext, q.description, q.captionlabel, l.orda
            FROM CategoryQuestionLink l JOIN Question q ON q.questionid=l.questionid
            WHERE l.categoryid=${c.categoryid} AND q.deleted=0
            ORDER BY ISNULL(l.orda,999999), q.questionid
        `)).recordset;
    }
    return cats;
}

// ── HTML (subset) → docx runs ───────────────────────────────────────────────────
// Handles the tags that appear in stored rich text: strong/b, em/i, u, br. Lenient about
// unbalanced tags (closing an unopened format is ignored). Other inline tags are dropped but
// their text kept. Returns an array of TextRun.

// Strip characters not permitted in XML 1.0 (keeps \t \n \r). Stray control chars in DB text
// otherwise produce an invalid .docx that Word rejects as "unreadable content".
const xmlSafe = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function decodeEntities(s) {
    return xmlSafe(String(s)
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
        .replace(/&rsquo;/gi, '’').replace(/&lsquo;/gi, '‘')
        .replace(/&rdquo;/gi, '”').replace(/&ldquo;/gi, '“')
        .replace(/&mdash;/gi, '—').replace(/&ndash;/gi, '–'));
}

function inlineRuns(html, base = {}) {
    const runs = [];
    const stack = { b: 0, i: 0, u: 0 };
    let buf = '';
    const fmt = () => ({
        bold: !!base.bold || stack.b > 0,
        italics: !!base.italics || stack.i > 0,
        underline: stack.u > 0 ? {} : undefined,
        color: base.color, size: base.size, font: base.font,
    });
    const flush = () => {
        const text = decodeEntities(buf).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
        if (text) runs.push(new TextRun({ text, ...fmt() }));
        buf = '';
    };
    const re = /<\/?\s*([a-zA-Z0-9]+)[^>]*>/g;
    let m, last = 0;
    while ((m = re.exec(html)) !== null) {
        buf += html.slice(last, m.index);
        last = re.lastIndex;
        const tag = m[1].toLowerCase();
        const closing = /^<\s*\//.test(m[0]);
        if (tag === 'br') { flush(); runs.push(new TextRun({ break: 1, ...fmt() })); }
        else if (tag === 'strong' || tag === 'b') { flush(); stack.b = Math.max(0, stack.b + (closing ? -1 : 1)); }
        else if (tag === 'em' || tag === 'i') { flush(); stack.i = Math.max(0, stack.i + (closing ? -1 : 1)); }
        else if (tag === 'u') { flush(); stack.u = Math.max(0, stack.u + (closing ? -1 : 1)); }
        // other tags: drop the tag, keep surrounding text
    }
    buf += html.slice(last);
    flush();
    return runs.length ? runs : [new TextRun({ text: '', ...fmt() })];
}

// Split a block of HTML that may contain <ul>/<ol><li> into logical lines.
// Returns [{ text, sub }] where sub=true for list items (to be indented/lettered).
function splitListish(html) {
    const out = [];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    // Text before the first list
    const firstList = html.search(/<(ul|ol)[^>]*>/i);
    const lead = firstList === -1 ? html : html.slice(0, firstList);
    const leadText = lead.replace(/<\/?(ul|ol)[^>]*>/gi, '').trim();
    if (leadText) out.push({ html: leadText, sub: false });
    let m;
    while ((m = liRe.exec(html)) !== null) out.push({ html: m[1].trim(), sub: true });
    if (!out.length) out.push({ html, sub: false });
    return out;
}

const stripTags = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ── Paragraph builders ──────────────────────────────────────────────────────────

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function listItem(marker, runs, level) {
    // Hanging-indent list paragraph: marker in a fixed-width column (wide enough for 2-digit
    // numbers), text wraps under text. column = 432 twips (~0.3") clears "10.".
    const COL = 432;
    const textAt = 360 + level * 432 + COL;
    return new Paragraph({
        spacing: { after: 60 },
        indent: { left: textAt, hanging: COL },
        tabStops: [{ type: TabStopType.LEFT, position: textAt }],
        children: [new TextRun({ text: marker, color: DARK }), new TextRun({ text: '\t' }), ...runs],
    });
}

// Split rich HTML into a lead block (text before any list) and its list items.
// Returns { lead: html, items: [html] }.
function leadAndItems(html) {
    const parts = splitListish(html);
    const lead = parts.filter(p => !p.sub).map(p => p.html).join(' ').trim();
    const items = parts.filter(p => p.sub).map(p => p.html);
    return { lead, items };
}

function heading(text, opts = {}) {
    return new Paragraph({
        spacing: { before: opts.before ?? 240, after: opts.after ?? 80 },
        children: [new TextRun({ text, bold: true, size: opts.size ?? 24, color: opts.color ?? DARK })],
    });
}

function body(runs, opts = {}) {
    return new Paragraph({ spacing: { after: opts.after ?? 100 }, children: runs });
}

// ── Per-category content ─────────────────────────────────────────────────────────

function categoryChildren(cat, { pageBreakBefore = false } = {}) {
    const kids = [];

    // Category title
    kids.push(new Paragraph({
        pageBreakBefore,
        spacing: { before: pageBreakBefore ? 0 : 120, after: 120 },
        children: [new TextRun({ text: xmlSafe(cat.name), bold: true, size: 40, color: TEAL })],
    }));
    if (cat.description) kids.push(body(inlineRuns(cat.description), { after: 160 }));

    // ── Eligibility Requirements ──
    if (cat.eligibility && cat.eligibility.length) {
        kids.push(heading('Eligibility Requirements'));
        kids.push(body([new TextRun({
            text: 'Entries in this Category must adhere to the following rules to be considered for an Australian Event Award:',
        })], { after: 80 }));
        cat.eligibility.forEach((e, idx) => {
            const parts = splitListish(e.eligibilityrule);
            let sub = 0;
            parts.forEach((p) => {
                if (p.sub) {
                    kids.push(listItem(`${LETTERS[sub++]}.`, inlineRuns(p.html), 1));
                } else {
                    kids.push(listItem(`${idx + 1}.`, inlineRuns(p.html), 0));
                }
            });
        });
    }

    // ── Judging Criteria ──
    if (cat.criteria && cat.criteria.length) {
        kids.push(heading('Judging Criteria'));
        kids.push(body([new TextRun({ text: 'The judges will score each entry against the following criteria:' })], { after: 80 }));
        cat.criteria.forEach((c) => {
            const raw = String(c.description || '').trim();
            let level = 0, marker = '', text = raw;
            let mm;
            if ((mm = raw.match(/^\s*(\d+)\.\s*/))) { marker = `${mm[1]}.`; text = raw.slice(mm[0].length); level = 0; }
            else if ((mm = raw.match(/^\s*\(([a-zA-Z])\)\s*/))) { marker = `${mm[1].toLowerCase()}.`; text = raw.slice(mm[0].length); level = 1; }
            else { marker = '•'; }
            const runs = inlineRuns(text);
            if (c.weight != null && c.weight !== '') {
                const w = Number(c.weight);
                runs.push(new TextRun({ text: `  (${Number.isInteger(w) ? w : w}%)`, color: GREY }));
            }
            kids.push(listItem(marker, runs, level));
        });
    }

    // ── Entry Form Questions ──
    if (cat.questions && cat.questions.length) {
        kids.push(heading('Entry Form Questions'));
        kids.push(body([new TextRun({ text: 'The entry form for this category contains the following questions:' })], { after: 80 }));

        const helperNote = (html, level = 1) => new Paragraph({
            spacing: { after: 40 }, indent: { left: 360 + level * 432 },
            children: inlineRuns(html, { italics: true, color: GREY, size: 20 }),
        });

        // A question's description is either structured content (contains a list — render the
        // lead + a lettered list, normal weight) or a short helper note (render italic/grey).
        const renderDescription = (html) => {
            const { lead, items } = leadAndItems(html);
            if (items.length) {
                if (lead) kids.push(new Paragraph({ spacing: { after: 40 }, indent: { left: 792 }, children: inlineRuns(lead) }));
                items.forEach((it, i) => kids.push(listItem(`${LETTERS[i]}.`, inlineRuns(it), 1)));
            } else if (lead) {
                kids.push(helperNote(lead));
            }
        };

        let qnum = 0;
        for (const q of cat.questions) {
            if (q.inputtype === 'noinput') {
                const flat = stripTags(q.questiontext);
                const isHeading = /^SECTION\b/i.test(flat) ||
                    (flat.length <= 60 && flat.split(/\s+/).length <= 8 && !/[.:!?]$/.test(flat));
                if (isHeading) {
                    kids.push(heading(flat, { size: 24, before: 220, after: 40 }));
                    if (q.description) kids.push(helperNote(q.description, 0));
                } else {
                    const lines = String(q.questiontext || '')
                        .split(/<br\s*\/?>|<\/li>|<li[^>]*>/i)
                        .map(stripTags).filter(Boolean);
                    if (qnum === 0) {
                        // Top standing-instructions block (before the questions start): a bulleted
                        // list, like the reference. Helper note aligns under the bullet text.
                        lines.forEach(l => kids.push(listItem('•', [new TextRun({ text: l })], 0)));
                        if (q.description) kids.push(helperNote(q.description, 1));
                    } else {
                        // Instructions/notes between questions (e.g. "To assist us… submit:",
                        // "NOTE: …") are plain paragraphs in the reference — not bullets.
                        lines.forEach(l => kids.push(body([new TextRun({ text: l })], { after: 40 })));
                        if (q.description) kids.push(helperNote(q.description, 0));
                    }
                }
                continue;
            }

            qnum++;
            const { lead, items } = leadAndItems(q.questiontext);
            kids.push(listItem(`${qnum}.`, inlineRuns(lead || stripTags(q.questiontext)), 0));
            items.forEach((it, i) => kids.push(listItem(`${LETTERS[i]}.`, inlineRuns(it), 1)));

            if (q.description) renderDescription(q.description);

            if (q.inputtype === 'textarea' && q.maxsize) {
                kids.push(new Paragraph({
                    spacing: { after: 60 }, indent: { left: 792 },
                    children: [new TextRun({ text: `Word Limit: ${q.maxsize} words`, color: ACCENT, size: 20 })],
                }));
            }
            if ((q.inputtype === 'image' || q.inputtype === 'video') && q.captionlabel) {
                kids.push(helperNote(q.captionlabel));
            }
        }
    }

    return kids;
}

// ── Header band + footer ─────────────────────────────────────────────────────────

async function buildHeader(program) {
    // Black band; logo image if the program has one, else the program name in white.
    let imageChild = null;
    if (program.docheaderimage) {
        const imgPath = docHeaderPath(program.programid, program.docheaderimage);
        if (imgPath && fs.existsSync(imgPath)) {
            try {
                const buf = await fsp.readFile(imgPath);
                const meta = await sharp(buf).metadata();
                const maxW = 200, maxH = 60; // points
                const ratio = Math.min(maxW / (meta.width || maxW), maxH / (meta.height || maxH), 1);
                // docx v9 requires an explicit image `type` — without it the embedded image part is
                // malformed and Word reports "unreadable content" (LibreOffice tolerates it).
                const type = ({ jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', bmp: 'bmp' })[meta.format] || 'png';
                imageChild = new ImageRun({
                    type,
                    data: buf,
                    transformation: { width: Math.round((meta.width || maxW) * ratio), height: Math.round((meta.height || maxH) * ratio) },
                });
            } catch { /* fall through to text */ }
        }
    }
    const para = new Paragraph({
        shading: { fill: '000000' },
        spacing: { before: 60, after: 60 },
        children: imageChild ? [imageChild] : [new TextRun({ text: program.name || '', bold: true, color: 'FFFFFF', size: 28 })],
    });
    return new Header({ children: [para] });
}

function buildFooter(program) {
    const year = new Date().getFullYear();
    const title = `${program.name || ''} — Categories, Criteria and Questions ${year}`;
    return new Footer({
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120 },
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 6 } },
                children: [new TextRun({ text: title, size: 16, color: GREY })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: 'Page ', size: 16, color: GREY }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
                    new TextRun({ text: ' of ', size: 16, color: GREY }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }),
                ],
            }),
        ],
    });
}

async function buildDoc(program, categories, { combined }) {
    const children = [];
    categories.forEach((cat, i) => {
        children.push(...categoryChildren(cat, { pageBreakBefore: combined && i > 0 }));
    });
    const header = await buildHeader(program);
    const footer = buildFooter(program);
    const doc = new Document({
        creator: 'Jade',
        title: `${program.name} — Categories, Criteria and Questions`,
        styles: { default: { document: { run: { font: 'Calibri', size: 22, color: DARK } } } },
        sections: [{
            properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
            headers: { default: header },
            footers: { default: footer },
            children,
        }],
    });
    return Packer.toBuffer(doc);
}

// ── docx → pdf (LibreOffice) ─────────────────────────────────────────────────────

// Convert every .docx to PDF in ONE LibreOffice invocation. soffice processes the files
// sequentially within a single process, so this pays the (slow) startup cost once instead of
// once per file — much faster, and lighter on low-RAM nodes than spawning it dozens of times.
// Per-file success is decided by the caller checking which .pdf files appeared on disk, so a
// single bad document doesn't fail the whole batch.
async function docxBatchToPdf(docxPaths, outDir) {
    if (!docxPaths.length) return;
    // Isolated user profile per run. pathToFileURL gives a valid file URL on both Windows
    // (file:///C:/…) and Linux (file:///…) — a hand-built 'file://' + path is malformed on
    // Windows (C: is read as a host) and LibreOffice then fails with a "config corrupt" error.
    const profileDir = path.join(os.tmpdir(), `lo_profile_${process.pid}_${Date.now()}`);
    const profile = pathToFileURL(profileDir).href;
    await new Promise((resolve, reject) => {
        const args = ['--headless', '--norestore', `-env:UserInstallation=${profile}`,
            '--convert-to', 'pdf:writer_pdf_Export', '--outdir', outDir, ...docxPaths];
        const p = spawn(SOFFICE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);   // binary missing etc. — fatal
        p.on('close', code => {
            // Non-zero can mean one document failed while others converted; don't fail the batch
            // (the caller checks which PDFs exist). Log it for diagnostics.
            if (code !== 0) console.warn(`[cqDocs] soffice batch exited ${code}: ${err.trim()}`);
            resolve();
        });
    });
}

// ── Orchestration ────────────────────────────────────────────────────────────────

const slugify = (s) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'category';

export async function generateCQDocs(programId) {
    const program = await Program.findByPk(programId);
    if (!program) throw new Error('Program not found');
    const categories = await getProgramCQData(programId);
    if (!categories.length) throw new Error('No categories found for this program');

    const dir = cqDir(programId);
    await fsp.mkdir(dir, { recursive: true });

    const prefix = slugify(program.slug || program.name);
    const files = [];
    const docxPaths = [];

    const writeDocx = async (baseName, label, cats, combined, categoryid) => {
        const docxPath = path.join(dir, `${baseName}.docx`);
        await fsp.writeFile(docxPath, await buildDoc(program, cats, { combined }));
        files.push({ categoryid: categoryid || null, label, docx: `${baseName}.docx`, pdf: null, base: baseName });
        docxPaths.push(docxPath);
    };

    // Write all the Word documents first: combined (all categories) + one per category.
    await writeDocx(`${prefix}_All_Categories`, 'All Categories', categories, true, null);
    for (const cat of categories) {
        await writeDocx(`${prefix}_${slugify(cat.shortname || cat.name)}`, cat.name, [cat], false, cat.categoryid);
    }

    // Convert them all to PDF in a single LibreOffice run, then record which PDFs were produced.
    try {
        await docxBatchToPdf(docxPaths, dir);
    } catch (e) {
        console.error('[cqDocs] PDF batch conversion failed -', e.message);
    }
    for (const entry of files) {
        const pdfName = `${entry.base}.pdf`;
        if (fs.existsSync(path.join(dir, pdfName))) entry.pdf = pdfName;
        delete entry.base;
    }

    const manifest = { generatedAt: new Date().toISOString(), programName: program.name, files };
    await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    // Rebuild the portal Downloads page HTML to link the generated files.
    await program.update({ downloadpagehtml: buildDownloadHtml(program, manifest) });

    return manifest;
}

// ── Background job (queued generation; worker in services/cqDocsJob.js) ─────────────

export async function getLatestCqDocsJob(programId) {
    const pool = await getPool();
    return (await pool.request().input('p', sql.Int, programId).query(`
        SELECT TOP 1 cqdocsjobid, status, filecount, errormsg, requestedat, finishedat
        FROM CqDocsJob WHERE programid=@p ORDER BY cqdocsjobid DESC`)).recordset[0] || null;
}

// Run one claimed job row: generate the documents, stamp the row done/error. Called by the worker.
export async function runCqDocsJob(row) {
    const pool = await getPool();
    const id = row.cqdocsjobid;
    try {
        const manifest = await generateCQDocs(row.programid);
        await pool.request().input('id', sql.Int, id).input('n', sql.Int, manifest.files.length)
            .query("UPDATE CqDocsJob SET status='done', filecount=@n, finishedat=SYSUTCDATETIME() WHERE cqdocsjobid=@id");
        // downloadpagehtml changed — bust this node's program cache (other nodes expire via 60s TTL).
        try {
            const { bustProgramCache } = await import('./auth.js');
            const p = await Program.findByPk(row.programid);
            if (p) bustProgramCache(p.slug, p.fqdn);
        } catch { /* non-fatal */ }
        return { ok: true, count: manifest.files.length };
    } catch (err) {
        await pool.request().input('id', sql.Int, id).input('e', sql.NVarChar, String(err.message).slice(0, 1000))
            .query("UPDATE CqDocsJob SET status='error', errormsg=@e, finishedat=SYSUTCDATETIME() WHERE cqdocsjobid=@id").catch(() => {});
        return { ok: false, error: err.message };
    }
}

export async function getCQManifest(programId) {
    try {
        const raw = await fsp.readFile(path.join(cqDir(programId), 'manifest.json'), 'utf8');
        return JSON.parse(raw);
    } catch { return null; }
}

export function cqFilePath(programId, filename) {
    if (!filename || /[\\/]|\.\./.test(filename)) return null;
    return path.join(cqDir(programId), filename);
}

function buildDownloadHtml(program, manifest) {
    const base = `/${program.slug}/cqDocs/download?file=`;
    const link = (f, kind) => f ? `<a href="${base}${encodeURIComponent(f)}">${kind}</a>` : `<span style="color:#666">${kind} n/a</span>`;
    const rows = manifest.files.map(f => {
        const isAll = f.categoryid == null;
        return `<tr${isAll ? ' style="font-weight:600;border-bottom:2px solid #444;"' : ''}>` +
            `<td style="padding:6px 12px;">${f.label}</td>` +
            `<td style="padding:6px 12px;text-align:center;">${link(f.docx, 'Word')}</td>` +
            `<td style="padding:6px 12px;text-align:center;">${link(f.pdf, 'PDF')}</td></tr>`;
    }).join('');
    const when = new Date(manifest.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    return `<h2>Categories, Criteria &amp; Questions</h2>
<p>Download the full entry guide — category descriptions, eligibility, judging criteria and the entry-form questions — as Word or PDF.</p>
<table style="border-collapse:collapse;width:100%;max-width:640px;">
<thead><tr style="border-bottom:1px solid #555;"><th style="padding:6px 12px;text-align:left;">Document</th><th style="padding:6px 12px;">Word</th><th style="padding:6px 12px;">PDF</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="color:#888;font-size:12px;margin-top:10px;">Last updated ${when}.</p>`;
}
