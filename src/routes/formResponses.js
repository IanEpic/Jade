// routes/formResponses.js
// Equivalent of formResponses.cgi
// The main entry response form — renders questions for an entry and saves answers.
//
// Key design notes from the Perl:
//  - Field names are encoded as HHH{questionid}HHH{responseid}HHH{type}
//    type: tf=textfield, ta=textarea, ul=file, im=image, vid=video,
//          dd=dropdown, cb=checkbox, ra=radio
//  - responseid is empty for new responses, numeric for existing ones
//  - Save is AJAX — returns JSON {status:'OK'} not a page redirect
//  - Files are stored on disk; value column stores the filename

import { Router }       from 'express';
import { requireAuth }  from '../middleware/auth.js';
import { getPool, sql } from '../config/database.js';
import multer           from 'multer';
import path             from 'path';
import fs               from 'fs/promises';
import { randomFilename } from '../services/helpers.js';

const router = Router();
router.use(requireAuth);

// ── File upload config ────────────────────────────────────────────────────────
// Mirrors get_network_filestore_root() + subdirectory subs from EPIC::JADE::Common.
// Set FILESTORE_ROOT in .env — NAS UNC path in production, local path in dev.
const FILESTORE_ROOT       = process.env.FILESTORE_ROOT || 'C:/Data/LocalJadeFilestore';
const ORIGINAL_IMAGES_DIR  = path.join(FILESTORE_ROOT, 'originalImages');
const CONVERTED_IMAGES_DIR = path.join(FILESTORE_ROOT, 'convertedImageStore');
const ORIGINAL_VIDEOS_DIR  = path.join(FILESTORE_ROOT, 'originalVideos');
const CONVERTED_VIDEOS_DIR = path.join(FILESTORE_ROOT, 'convertedVideoStore');
const ORIGINAL_FILES_DIR   = path.join(FILESTORE_ROOT, 'originalFiles');

// Ensure upload dirs exist on startup
for (const dir of [ORIGINAL_IMAGES_DIR, ORIGINAL_VIDEOS_DIR, ORIGINAL_FILES_DIR]) {
    fs.mkdir(dir, { recursive: true }).catch(() => {});
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // For the /upload endpoint the fieldname is just 'file', so fall back to req.query.type
        const type    = getFieldType(file.fieldname);
        const qtype   = req.query.type || '';
        const resolved = type || (qtype === 'image' ? 'im' : qtype === 'video' ? 'vid' : '');
        cb(null, resolved === 'im' ? ORIGINAL_IMAGES_DIR : resolved === 'vid' ? ORIGINAL_VIDEOS_DIR : ORIGINAL_FILES_DIR);
    },
    filename: (req, file, cb) => {
        const ext  = path.extname(file.originalname);
        const name = randomFilename() + ext;
        cb(null, name);
    },
});
const upload = multer({ storage, limits: { fileSize: 2000 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFieldType(fieldname) {
    const parts = fieldname.split('HHH');
    return parts[3] || '';
}

function parseFieldName(fieldname) {
    const parts = fieldname.split('HHH');
    if (!parts[1]) return null;
    return {
        questionid: parseInt(parts[1]),
        responseid: parts[2] ? parseInt(parts[2]) : null,
        type:       parts[3],
    };
}

async function getQuestionsForEntry(entryid) {
    const pool = await getPool();
    const r = await pool.request()
        .input('entryid', sql.Int, entryid)
        .query(`
            SELECT q.*
            FROM Question q
            INNER JOIN CategoryQuestionLink cql ON cql.questionid = q.questionid
            INNER JOIN Entry e ON e.categoryid = cql.categoryid
            WHERE e.entryid = @entryid AND q.deleted = 0
            ORDER BY q.orda, q.questionid
        `);
    return r.recordset;
}

async function getResponsesForEntry(entryid) {
    const pool = await getPool();
    const r = await pool.request()
        .input('entryid', sql.Int, entryid)
        .query(`SELECT * FROM Response WHERE entryid=@entryid AND deleted=0`);
    const map = {};
    for (const resp of r.recordset) map[resp.questionid] = resp;
    return map;
}

async function getInputOptions(questionid) {
    const pool = await getPool();
    const r = await pool.request()
        .input('questionid', sql.Int, questionid)
        .query(`SELECT * FROM InputOption WHERE questionid=@questionid AND deleted=0 ORDER BY orda, inputoptionid`);
    return r.recordset;
}

async function getEntry(entryid) {
    const pool = await getPool();
    const r = await pool.request()
        .input('entryid', sql.Int, entryid)
        .query(`
            SELECT e.*, en.userid AS entrantuserid, c.entriesopen, c.name AS categoryname
            FROM Entry e
            INNER JOIN Entrant en ON e.entrantid = en.entrantid
            INNER JOIN Category c ON e.categoryid = c.categoryid
            WHERE e.entryid = @entryid AND e.deleted = 0
        `);
    return r.recordset[0] || null;
}

// ── GET /formResponses ────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
    try {
        const user    = req.user;
        const program = user.program;
        const entryid = parseInt(req.query.entryid);

        if (!entryid) return res.redirect('/home');

        const entry = await getEntry(entryid);
        if (!entry) return res.redirect('/home');

        // Security: entry must belong to this user (via entrant)
        if (entry.entrantuserid !== user.userid && !user.admin) return res.redirect('/home');

        // Check entries are open
        if (!entry.entriesopen && !entry.entryopen && !user.admin) {
            return res.renderInShell('formResponses', {
                user, program, entry, questions: [], responses: {}, closed: true,
            });
        }

        const questions = await getQuestionsForEntry(entryid);
        const responses = await getResponsesForEntry(entryid);

        // Load input options for questions that need them
        for (const q of questions) {
            if (['drop down list','checkbox','radio'].includes(q.inputtype)) {
                q.options = await getInputOptions(q.questionid);
            }
        }

        return res.renderInShell('formResponses', {
            user, program, entry, questions, responses, closed: false,
        });

    } catch (err) { next(err); }
});

// ── POST /formResponses/delete-pending — delete a just-uploaded file (no DB record yet) ──

router.post('/delete-pending', async (req, res, next) => {
    try {
        const { filename, type } = req.body;
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.json({ status: 'E_INVALID' });
        }
        const dirs = type === 'image'
            ? [ORIGINAL_IMAGES_DIR, CONVERTED_IMAGES_DIR]
            : type === 'video'
            ? [ORIGINAL_VIDEOS_DIR, CONVERTED_VIDEOS_DIR]
            : [ORIGINAL_FILES_DIR];

        for (const dir of dirs) {
            const filePath = path.join(dir, filename);
            try { await fs.unlink(filePath); }
            catch (e) { console.warn(`Could not delete pending file: ${filePath} — ${e.message}`); }
        }
        return res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

// ── POST /formResponses/save-file — save a file response immediately after upload ──
// Called by the browser right after a successful upload so the Response row
// exists in the DB before the user clicks Save.  Returns the responseid.

router.post('/save-file', async (req, res, next) => {
    try {
        const entryid    = parseInt(req.body.entryid);
        const questionid = parseInt(req.body.questionid);
        const filename   = req.body.filename;
        if (!entryid || !questionid || !filename) return res.json({ status: 'E_MISSING' });

        const pool = await getPool();

        // Check entry ownership
        const entryCheck = await pool.request()
            .input('entryid', sql.Int, entryid)
            .query(`SELECT e.entryid, en.userid AS entrantuserid FROM Entry e
                    INNER JOIN Entrant en ON e.entrantid = en.entrantid
                    WHERE e.entryid = @entryid AND e.deleted = 0`);
        if (!entryCheck.recordset.length) return res.json({ status: 'E_NOTFOUND' });
        const entry = entryCheck.recordset[0];
        if (entry.entrantuserid !== req.user.userid && !req.user.admin) return res.json({ status: 'E_AUTH' });

        // Upsert the response and return the responseid
        const existing = await pool.request()
            .input('entryid',    sql.Int, entryid)
            .input('questionid', sql.Int, questionid)
            .query(`SELECT responseid FROM Response WHERE entryid=@entryid AND questionid=@questionid AND deleted=0`);

        let responseid;
        if (existing.recordset.length) {
            responseid = existing.recordset[0].responseid;
            await pool.request()
                .input('responseid', sql.Int,     responseid)
                .input('value',      sql.NVarChar, filename)
                .query(`UPDATE Response SET value=@value WHERE responseid=@responseid`);
        } else {
            const insert = await pool.request()
                .input('entryid',    sql.Int,     entryid)
                .input('questionid', sql.Int,     questionid)
                .input('value',      sql.NVarChar, filename)
                .query(`INSERT INTO Response (entryid, questionid, value, deleted)
                        OUTPUT INSERTED.responseid
                        VALUES (@entryid, @questionid, @value, 0)`);
            responseid = insert.recordset[0].responseid;
        }

        return res.json({ status: 'OK', responseid });
    } catch (err) { next(err); }
});

// ── POST /formResponses/delete-file — AJAX soft-delete a file response ───────

router.post('/delete-file', async (req, res, next) => {
    try {
        const responseid = parseInt(req.body.responseid);
        if (!responseid) return res.json({ status: 'E_NOID' });

        const pool = await getPool();

        // Fetch the response so we know the filename and question type
        const r = await pool.request()
            .input('responseid', sql.Int, responseid)
            .query(`
                SELECT r.value, q.inputtype
                FROM Response r
                INNER JOIN Question q ON q.questionid = r.questionid
                WHERE r.responseid = @responseid AND r.deleted = 0
            `);

        if (r.recordset.length) {
            const { value: filename, inputtype } = r.recordset[0];
            if (filename) {
                // Delete from both possible locations (original + converted)
                const dirs = inputtype === 'image'
                    ? [ORIGINAL_IMAGES_DIR, CONVERTED_IMAGES_DIR]
                    : inputtype === 'video'
                    ? [ORIGINAL_VIDEOS_DIR, CONVERTED_VIDEOS_DIR]
                    : [ORIGINAL_FILES_DIR];

                for (const dir of dirs) {
                    const filePath = path.join(dir, filename);
                    try {
                        await fs.unlink(filePath);
                    } catch (e) {
                        console.warn(`Could not delete file: ${filePath} — ${e.message}`);
                    }
                }
            }
        }

        // Soft-delete the DB record
        await pool.request()
            .input('responseid', sql.Int, responseid)
            .query('UPDATE Response SET deleted=1 WHERE responseid=@responseid');

        return res.json({ status: 'OK' });
    } catch (err) { next(err); }
});

// ── POST /formResponses — AJAX save ───────────────────────────────────────────

router.post('/', upload.any(), async (req, res, next) => {
    try {
        const user    = req.user;
        const body    = req.body;
        const files   = req.files || [];
        const entryid = parseInt(body.entryid);

        if (!entryid) return res.json({ status: 'E_NOID' });

        const entry = await getEntry(entryid);
        if (!entry) return res.json({ status: 'E_NOTFOUND' });
        if (entry.entrantuserid !== user.userid && !user.admin) return res.json({ status: 'E_AUTH' });

        if (!entry.entriesopen && !entry.entryopen && !user.admin) {
            return res.json({ status: 'E_CLOSED', msg: 'Cannot upload. Entries are closed.' });
        }

        const pool = await getPool();

        // Process file uploads (multer already saved them)
        const fileValues = {};
        for (const file of files) {
            const parsed = parseFieldName(file.fieldname);
            if (parsed) fileValues[file.fieldname] = file.filename;
        }

        // Process all fields
        for (const [fieldname, rawValue] of Object.entries(body)) {
            // Handle DEL{responseid} — soft delete a file response
            if (fieldname.startsWith('DEL')) {
                const delId = parseInt(fieldname.replace('DEL', ''));
                if (delId) {
                    await pool.request()
                        .input('responseid', sql.Int, delId)
                        .query('UPDATE Response SET deleted=1 WHERE responseid=@responseid');
                }
                continue;
            }

            const parsed = parseFieldName(fieldname);
            if (!parsed) continue;
            const { questionid, responseid, type } = parsed;

            // Skip meta types
            if (['vidtype','imgtype','tac','c'].includes(type)) continue;

            let value;
            if (type === 'cb') {
                // Checkboxes can have multiple values
                const vals = Array.isArray(rawValue) ? rawValue : [rawValue];
                value = vals.filter(v => v && v !== 'cb').join('~');
            } else {
                value = rawValue || '';
            }

            // For file fields the value is the filename from the immediate upload.
            // Skip empty — don't create a blank response row.
            if (['ul','im','vid'].includes(type) && !value) continue;

            await upsertResponse(pool, entryid, questionid, responseid, value);
        }

        // Process file fields from multer
        for (const file of files) {
            const parsed = parseFieldName(file.fieldname);
            if (!parsed) continue;
            const { questionid, responseid } = parsed;
            await upsertResponse(pool, entryid, questionid, responseid, file.filename);
        }

        // Process caption fields (CAP{questionid})
        for (const [fieldname, value] of Object.entries(body)) {
            if (!fieldname.startsWith('CAP')) continue;
            const questionid = parseInt(fieldname.slice(3));
            if (!questionid) continue;
            await upsertCaption(pool, entryid, questionid, value || '');
        }

        return res.json({ status: 'OK', userid: user.userid });

    } catch (err) {
        console.error('formResponses POST error:', err);
        return res.json({ status: 'E_ERROR', msg: err.message });
    }
});

async function upsertCaption(pool, entryid, questionid, caption) {
    await pool.request()
        .input('entryid',    sql.Int,      entryid)
        .input('questionid', sql.Int,      questionid)
        .input('caption',    sql.NVarChar, caption)
        .query(`
            IF EXISTS (SELECT 1 FROM Response WHERE entryid=@entryid AND questionid=@questionid AND deleted=0)
                UPDATE Response SET caption=@caption WHERE entryid=@entryid AND questionid=@questionid AND deleted=0
            ELSE
                INSERT INTO Response (entryid, questionid, value, caption, deleted) VALUES (@entryid, @questionid, '', @caption, 0)
        `);
}

async function upsertResponse(pool, entryid, questionid, responseid, value) {
    if (responseid) {
        await pool.request()
            .input('responseid', sql.Int,     responseid)
            .input('value',      sql.NVarChar, value)
            .query('UPDATE Response SET value=@value, deleted=0 WHERE responseid=@responseid');
    } else {
        await pool.request()
            .input('entryid',    sql.Int,     entryid)
            .input('questionid', sql.Int,     questionid)
            .input('value',      sql.NVarChar, value)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM Response WHERE entryid=@entryid AND questionid=@questionid AND deleted=0)
                INSERT INTO Response (entryid, questionid, value, deleted) VALUES (@entryid, @questionid, @value, 0)
                ELSE
                UPDATE Response SET value=@value WHERE entryid=@entryid AND questionid=@questionid AND deleted=0
            `);
    }
}

// ── POST /formResponses/upload — single file auto-upload ─────────────────────
// Called immediately when user selects/drops a file.
// Returns JSON { filename, url } so JS can show a preview.

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ status: 'E_NOFILE' });

        const filename = req.file.filename;
        const type     = req.query.type || 'file'; // 'image', 'video', 'file'

        // Use the /preview route so the file can be served before it's saved as a response
        const previewUrl = type === 'image'
            ? `/formResponses/preview?type=image&file=${encodeURIComponent(filename)}`
            : null;

        // Trigger media processing after responding — images are fast (inline await),
        // videos can take minutes so fire-and-forget
        if (type === 'image') {
            // Don't await — let it run in background, preview serves from originalImages in the meantime
            processImage(filename).catch(err => console.error('[upload] image processing error:', err.message));
        } else if (type === 'video') {
            processVideo(filename); // always async
        }

        return res.json({ status: 'OK', filename, previewUrl, originalname: req.file.originalname });
    } catch (err) {
        return res.json({ status: 'E_ERROR', msg: err.message });
    }
});

// ── GET /formResponses/preview — serve a just-uploaded file before it's in DB ──
router.get('/preview', async (req, res, next) => {
    try {
        const { type, file } = req.query;
        if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
            return res.status(400).send('Bad request');
        }
        const dir = type === 'image' ? ORIGINAL_IMAGES_DIR : type === 'video' ? ORIGINAL_VIDEOS_DIR : ORIGINAL_FILES_DIR;
        res.sendFile(path.join(dir, file));
    } catch (err) { next(err); }
});

// ── Static serving of uploads ─────────────────────────────────────────────────
import { createReadStream } from 'fs';
import { processImage, processVideo } from '../services/mediaProcessor.js';

router.get('/download', async (req, res, next) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('responseid', sql.Int, parseInt(req.query.responseid))
            .query('SELECT value FROM Response WHERE responseid=@responseid');
        if (!r.recordset.length) return res.status(404).send('Not found');
        const filename = r.recordset[0].value;
        // Try with extension (Node uploads) then without (legacy Perl uploads)
        const withExt    = path.join(ORIGINAL_FILES_DIR, filename);
        const withoutExt = path.join(ORIGINAL_FILES_DIR, noExt(filename));
        try {
            await fs.access(withExt);
            res.download(withExt, filename);
        } catch {
            res.download(withoutExt, filename); // serve with original name for download
        }
    } catch (err) { next(err); }
});

// Try a list of candidate paths in order, serve the first one that exists.
async function serveFirstExisting(res, next, candidates) {
    for (const p of candidates) {
        try { await fs.access(p); return res.sendFile(p); } catch {}
    }
    res.status(404).send('File not found');
}

// Perl stored filenames in the DB with extension (e.g. abc123.jpg) but wrote
// the file to disk WITHOUT extension (e.g. originalImages/abc123).
// New Node uploads include the extension on disk.
// So we try: converted (with ext) → original (with ext) → original (no ext, legacy)
function noExt(filename) {
    return path.parse(filename).name;
}

router.get('/image', async (req, res, next) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('responseid', sql.Int, parseInt(req.query.responseid))
            .query('SELECT value FROM Response WHERE responseid=@responseid');
        if (!r.recordset.length) return res.status(404).send('Not found');
        const filename = r.recordset[0].value;
        await serveFirstExisting(res, next, [
            path.join(CONVERTED_IMAGES_DIR, noExt(filename) + '.jpg'), // Sharp converted (with ext)
            path.join(CONVERTED_IMAGES_DIR, noExt(filename)),          // Perl converted (no ext)
            path.join(ORIGINAL_IMAGES_DIR,  filename),                 // Node upload (with ext)
            path.join(ORIGINAL_IMAGES_DIR,  noExt(filename)),          // Perl upload (no ext)
        ]);
    } catch (err) { next(err); }
});

router.get('/video', async (req, res, next) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('responseid', sql.Int, parseInt(req.query.responseid))
            .query('SELECT value FROM Response WHERE responseid=@responseid');
        if (!r.recordset.length) return res.status(404).send('Not found');
        const filename = r.recordset[0].value;
        await serveFirstExisting(res, next, [
            path.join(CONVERTED_VIDEOS_DIR, noExt(filename) + '.mp4'), // ffmpeg converted
            path.join(ORIGINAL_VIDEOS_DIR,  filename),                 // Node upload (with ext)
            path.join(ORIGINAL_VIDEOS_DIR,  noExt(filename)),          // Perl upload (no ext)
        ]);
    } catch (err) { next(err); }
});

export default router;
