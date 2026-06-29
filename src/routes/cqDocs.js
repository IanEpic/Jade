// routes/cqDocs.js
// Category Documents — Admin → Tools builds the branded "Categories, Criteria & Questions"
// Word/PDF set and (re)writes program.downloadpagehtml to link them. Entrants download the
// files via /cqDocs/download from the existing portal Downloads page.
//   POST /cqDocs/generate           (admin) → (re)build all docs, returns manifest
//   GET  /cqDocs/download?file=...           → stream a generated file

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { bustProgramCache } from '../services/auth.js';
import { generateCQDocs, cqFilePath } from '../services/cqDocs.js';

const router = Router();

router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
    try {
        const manifest = await generateCQDocs(req.program.programid);
        bustProgramCache(req.program.slug, req.program.fqdn);   // downloadpagehtml changed
        res.json({ ok: true, manifest });
    } catch (err) {
        console.error('[cqDocs] generate error:', err);
        res.json({ ok: false, error: err.message });
    }
});

router.get('/download', requireAuth, async (req, res) => {
    const filePath = cqFilePath(req.program.programid, req.query.file);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('Not found');
    res.download(filePath, path.basename(filePath));
});

export default router;
