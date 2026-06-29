// services/cqDocsJob.js
// Background worker (runs on the elected leader node): builds queued Category Documents jobs so the
// generation survives the admin navigating away or a request timeout. Mirrors prExportJob.

import { getPool } from '../config/database.js';
import { isLeader } from './jobLease.js';
import { runCqDocsJob } from './cqDocs.js';

// Atomically claim one pending job (pending → running) so two nodes never build the same one.
// READPAST skips a row another node just claimed.
async function processNextPending() {
    const pool = await getPool();
    const row = (await pool.request().query(`
        UPDATE dbo.CqDocsJob SET status='running'
        OUTPUT INSERTED.cqdocsjobid, INSERTED.programid
        WHERE cqdocsjobid = (
            SELECT TOP 1 cqdocsjobid FROM dbo.CqDocsJob WITH (UPDLOCK, READPAST)
            WHERE status='pending' ORDER BY cqdocsjobid
        )
    `)).recordset[0];
    if (!row) return false;
    await runCqDocsJob(row);
    return true;
}

export function startCqDocsJob({ intervalMs = 5 * 1000 } = {}) {
    let running = false;
    setInterval(async () => {
        if (running || !isLeader()) return;   // only the elected leader builds documents
        running = true;
        try {
            const did = await processNextPending();
            if (did) { running = false; return; }   // more may be queued — check again soon
        } catch (err) {
            console.error('[cqDocsJob]', err.message);
        }
        running = false;
    }, intervalMs);
    console.log('[cqDocsJob] started');
}
