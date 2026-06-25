// services/jobState.js
// Dirty-flag gate for background jobs (BackgroundJobState table, migration 054).
// A triggering event marks a job dirty; the job skips its tick when it isn't dirty,
// so "nothing changed" means no scan and no AI calls. Reusable across jobs.
//
// Usage:
//   markJobDirty('commentReview')   — on the triggering event (e.g. comment saved)
//   isJobDirty('commentReview')     — job checks before doing work
//   clearJobDirty('commentReview')  — job claims the work (clear, then process)

import { getPool, sql } from '../config/database.js';

export async function markJobDirty(jobname) {
    const pool = await getPool();
    await pool.request().input('j', sql.NVarChar, jobname).query(`
        UPDATE BackgroundJobState SET dirty = 1 WHERE jobname = @j;
        IF @@ROWCOUNT = 0 INSERT INTO BackgroundJobState (jobname, dirty) VALUES (@j, 1);
    `);
}

export async function isJobDirty(jobname) {
    const pool = await getPool();
    const r = await pool.request().input('j', sql.NVarChar, jobname)
        .query('SELECT dirty FROM BackgroundJobState WHERE jobname = @j');
    return r.recordset.length ? !!r.recordset[0].dirty : false;
}

// Clear the flag and stamp the run time. Called when the job claims the work.
export async function clearJobDirty(jobname) {
    const pool = await getPool();
    await pool.request().input('j', sql.NVarChar, jobname)
        .query('UPDATE BackgroundJobState SET dirty = 0, lastrun = GETDATE() WHERE jobname = @j');
}
