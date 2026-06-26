// services/prExportJob.js
// Background worker (runs on the BACKGROUND_JOBS node): builds queued PR-media exports and
// sweeps finished zips off shared storage (a few minutes after download, or after a TTL).

import { getPool } from '../config/database.js';
import { buildPrExport, deletePrExportFile } from './prExport.js';

async function processNextPending() {
    const pool = await getPool();
    const row = (await pool.request().query(
        "SELECT TOP 1 * FROM PrExport WHERE status='pending' ORDER BY prexportid"
    )).recordset[0];
    if (!row) return false;
    await buildPrExport(row);
    return true;
}

async function sweep() {
    const pool = await getPool();
    const rows = (await pool.request().query(`
        SELECT prexportid, filename FROM PrExport
        WHERE deletedat IS NULL AND filename IS NOT NULL AND (
            (downloadedat IS NOT NULL AND downloadedat < DATEADD(MINUTE, -5, SYSUTCDATETIME())) OR
            (finishedat   IS NOT NULL AND finishedat   < DATEADD(HOUR,   -24, SYSUTCDATETIME()))
        )
    `)).recordset;
    for (const r of rows) await deletePrExportFile(r.prexportid, r.filename);
}

export function startPrExportJob({ intervalMs = 20 * 1000 } = {}) {
    if (process.env.BACKGROUND_JOBS !== 'true') return;   // one node only, like the other jobs
    let running = false;
    setInterval(async () => {
        if (running) return;
        running = true;
        try {
            const did = await processNextPending();
            await sweep();
            if (did) {                                   // more may be queued — check again soon
                running = false;
                return;
            }
        } catch (err) {
            console.error('[prExportJob]', err.message);
        }
        running = false;
    }, intervalMs);
    console.log('[prExportJob] started');
}
