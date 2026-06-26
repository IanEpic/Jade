-- 065_joblease.sql
-- Leader election for background jobs. Both nodes run identical code/config; they coordinate
-- through this single-row lease so only ONE node (the lease holder) runs the gated background
-- jobs at a time. The holder renews the lease periodically; if it dies, the lease expires and
-- the other node takes over. This replaces the per-node BACKGROUND_JOBS env flag.

IF OBJECT_ID('dbo.JobLease', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.JobLease (
        leaseid   INT          NOT NULL PRIMARY KEY,   -- always 1 (single global lease)
        holder    NVARCHAR(100) NULL,                   -- node id (hostname:pid) currently holding it
        expiresat DATETIME      NULL
    );
END
