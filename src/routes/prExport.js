// routes/prExport.js
// Admin: request/track/download the "Export PR Info" zip (high-res media of accepted entries).
//   POST /prExport/request            → queue a build (background worker picks it up), returns id
//   GET  /prExport/status?id=         → { status, filecount, ... } for the page to poll
//   GET  /prExport/download?id=       → stream the finished zip (marks it downloaded → auto-delete)

import { Router } from 'express';
import fs from 'fs';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPool, sql } from '../config/database.js';
import UserCredential from '../models/UserCredential.js';
import { prExportPath } from '../services/prExport.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/request', async (req, res, next) => {
    try {
        const pool = await getPool();
        // Reuse an in-flight request rather than queueing duplicates.
        const existing = (await pool.request().input('p', sql.Int, req.program.programid)
            .query("SELECT TOP 1 prexportid FROM PrExport WHERE programid=@p AND status IN ('pending','running') ORDER BY prexportid DESC")).recordset[0];
        if (existing) return res.json({ ok: true, id: existing.prexportid, reused: true });

        const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0];
        const host  = req.get('x-forwarded-host') || req.get('host');
        const baseurl = `${proto}://${host}`;

        // Email lives on UserCredential (source of truth post-migration), not on req.user.
        let email = req.user?.email || null;
        if (req.user?.credentialid) {
            const cred = await UserCredential.findByPk(req.user.credentialid);
            if (cred?.email) email = cred.email;
        }

        const r = await pool.request()
            .input('p', sql.Int, req.program.programid)
            .input('u', sql.Int, req.user?.userid || null)
            .input('e', sql.NVarChar, email)
            .input('b', sql.NVarChar, baseurl)
            .query(`INSERT INTO PrExport (programid, status, requestedby, requestedemail, baseurl)
                    OUTPUT INSERTED.prexportid VALUES (@p, 'pending', @u, @e, @b)`);
        res.json({ ok: true, id: r.recordset[0].prexportid });
    } catch (err) { next(err); }
});

router.get('/status', async (req, res, next) => {
    try {
        const id = parseInt(req.query.id);
        const pool = await getPool();
        const row = (await pool.request().input('id', sql.Int, id).input('p', sql.Int, req.program.programid)
            .query('SELECT prexportid, status, filecount, errormsg, downloadedat, deletedat FROM PrExport WHERE prexportid=@id AND programid=@p')).recordset[0];
        if (!row) return res.json({ ok: false });
        res.json({ ok: true, status: row.status, filecount: row.filecount, error: row.errormsg,
                   downloaded: !!row.downloadedat, deleted: !!row.deletedat });
    } catch (err) { next(err); }
});

router.get('/download', async (req, res, next) => {
    try {
        const id = parseInt(req.query.id);
        const pool = await getPool();
        const row = (await pool.request().input('id', sql.Int, id).input('p', sql.Int, req.program.programid)
            .query("SELECT filename, status FROM PrExport WHERE prexportid=@id AND programid=@p")).recordset[0];
        if (!row || row.status !== 'done' || !row.filename) return res.status(404).send('Export not available.');
        const filePath = prExportPath(row.filename);
        if (!filePath || !fs.existsSync(filePath)) return res.status(410).send('Export file no longer available — please request a new one.');

        res.download(filePath, row.filename, async (err) => {
            if (err) return;   // client aborted; leave for the sweep
            // Mark downloaded so the worker sweep removes the file a few minutes later.
            await pool.request().input('id', sql.Int, id)
                .query('UPDATE PrExport SET downloadedat=SYSUTCDATETIME() WHERE prexportid=@id AND downloadedat IS NULL')
                .catch(() => {});
        });
    } catch (err) { next(err); }
});

export default router;
