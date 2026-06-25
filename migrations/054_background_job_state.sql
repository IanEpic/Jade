-- Migration 054: Dirty-flag gate for background jobs.
-- Each recurring background job has a row here. A triggering event (e.g. a judge
-- comment created/edited) sets dirty=1; the job skips its tick entirely when dirty=0,
-- so "nothing changed" means no work (no scan, no AI calls). Generalises to any job.

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='BackgroundJobState' AND type='U')
BEGIN
    CREATE TABLE dbo.BackgroundJobState (
        jobname  NVARCHAR(64) NOT NULL PRIMARY KEY,
        dirty    BIT          NOT NULL CONSTRAINT DF_BackgroundJobState_dirty DEFAULT 0,
        lastrun  DATETIME     NULL
    );
END

-- Seed the comment-review job. Set dirty=1 only if unchecked comments already exist
-- (e.g. created between the feature deploy and this one); otherwise 0 — nothing to do
-- until a new/edited comment arrives.
IF NOT EXISTS (SELECT 1 FROM dbo.BackgroundJobState WHERE jobname = 'commentReview')
    INSERT INTO dbo.BackgroundJobState (jobname, dirty)
    VALUES ('commentReview',
            CASE WHEN EXISTS (SELECT 1 FROM JudgeComment WHERE reviewchecked = 0 AND deleted = 0)
                 THEN 1 ELSE 0 END);
