// services/jobLease.js
// Single-leader election for background jobs. Every node runs the same code; they all try to
// hold one shared DB lease (JobLease, migration 065). Only the holder runs the gated jobs.
// The holder renews the lease on an interval; if it stops (crash/restart/network), the lease
// expires and another node acquires it on its next tick — automatic failover, no env flags.

import os from 'os';
import { getPool, sql } from '../config/database.js';

const NODE_ID = `${os.hostname()}:${process.pid}`;
let amLeader = false;

export function isLeader() { return amLeader; }
export function nodeId() { return NODE_ID; }

// Atomically take the lease if it's free/expired or already ours, then report whether we hold it.
async function acquireOrRenew(ttlSec) {
    const pool = await getPool();
    const holder = (await pool.request()
        .input('me', sql.NVarChar, NODE_ID)
        .input('ttl', sql.Int, ttlSec)
        .query(`
            MERGE dbo.JobLease WITH (HOLDLOCK) AS t
            USING (SELECT 1 AS leaseid) AS s ON t.leaseid = s.leaseid
            WHEN MATCHED AND (t.expiresat < SYSUTCDATETIME() OR t.holder = @me OR t.holder IS NULL) THEN
                UPDATE SET holder = @me, expiresat = DATEADD(SECOND, @ttl, SYSUTCDATETIME())
            WHEN NOT MATCHED THEN
                INSERT (leaseid, holder, expiresat) VALUES (1, @me, DATEADD(SECOND, @ttl, SYSUTCDATETIME()));
            SELECT holder FROM dbo.JobLease WHERE leaseid = 1;
        `)).recordset[0]?.holder;
    amLeader = holder === NODE_ID;
    return amLeader;
}

// Start renewing the lease. renewMs should be comfortably below ttlSec so the holder keeps it.
export function startLeaderLoop({ renewMs = 20 * 1000, ttlSec = 60 } = {}) {
    const tick = () => acquireOrRenew(ttlSec).catch(err => {
        amLeader = false;                       // lost DB contact → don't assume leadership
        console.error('[jobLease]', err.message);
    });
    tick();
    setInterval(tick, renewMs);
    console.log(`[jobLease] node ${NODE_ID} participating in leader election`);
}
