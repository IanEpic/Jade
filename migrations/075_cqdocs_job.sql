-- 075_cqdocs_job.sql
-- Background-job queue for Category Documents generation. The admin "Generate" button enqueues a
-- row; the leader node's worker (services/cqDocsJob.js) claims it (pending → running), runs the
-- Word/PDF build, and marks it done/error. The page polls status so the build survives navigating
-- away or a request timeout. Mirrors the PrExport pattern.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'CqDocsJob')
BEGIN
    CREATE TABLE dbo.CqDocsJob (
        cqdocsjobid INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        programid   INT            NOT NULL,
        status      NVARCHAR(20)   NOT NULL CONSTRAINT DF_CqDocsJob_status DEFAULT 'pending',
        filecount   INT            NULL,
        errormsg    NVARCHAR(1000) NULL,
        requestedby INT            NULL,
        requestedat DATETIME2      NOT NULL CONSTRAINT DF_CqDocsJob_requestedat DEFAULT SYSUTCDATETIME(),
        finishedat  DATETIME2      NULL
    );
    CREATE INDEX IX_CqDocsJob_program_status ON dbo.CqDocsJob (programid, status);
END;
