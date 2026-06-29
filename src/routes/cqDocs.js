// routes/cqDocs.js
// Category Documents — Admin → Tools queues a background build (worker: services/cqDocsJob.js) of
// the branded Word/PDF set, which also (re)writes program.downloadpagehtml. Entrants download the
// files via /cqDocs/download from the portal Downloads page.
//   POST /cqDocs/generate           (admin) → enqueue a build, returns { id }
//   GET  /cqDocs/status?id=         (admin) → { status, filecount, error } for the page to poll
//   GET  /cqDocs/download?file=...           → stream a generated file

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getPool, sql } from '../config/database.js';
import { cqFilePath } from '../services/cqDocs.js';

const router = Router();

router.post('/generate', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const pool = await getPool();
        // Reuse an in-flight job rather than queueing duplicates.
        const existing = (await pool.request().input('p', sql.Int, req.program.programid)
            .query("SELECT TOP 1 cqdocsjobid FROM CqDocsJob WHERE programid=@p AND status IN ('pending','running') ORDER BY cqdocsjobid DESC")).recordset[0];
        if (existing) return res.json({ ok: true, id: existing.cqdocsjobid, reused: true });

        const r = await pool.request()
            .input('p', sql.Int, req.program.programid)
            .input('u', sql.Int, req.user?.userid || null)
            .query("INSERT INTO CqDocsJob (programid, status, requestedby) OUTPUT INSERTED.cqdocsjobid VALUES (@p, 'pending', @u)");
        res.json({ ok: true, id: r.recordset[0].cqdocsjobid });
    } catch (err) { next(err); }
});

router.get('/status', requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const id = parseInt(req.query.id);
        const pool = await getPool();
        const row = (await pool.request().input('id', sql.Int, id).input('p', sql.Int, req.program.programid)
            .query('SELECT status, filecount, errormsg FROM CqDocsJob WHERE cqdocsjobid=@id AND programid=@p')).recordset[0];
        if (!row) return res.json({ ok: false });
        res.json({ ok: true, status: row.status, filecount: row.filecount, error: row.errormsg });
    } catch (err) { next(err); }
});

router.get('/download', requireAuth, async (req, res) => {
    const filePath = cqFilePath(req.program.programid, req.query.file);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('Not found');
    res.download(filePath, path.basename(filePath));
});

export default router;
