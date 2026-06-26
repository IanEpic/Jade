-- 064_prexport.sql
-- "Export PR Info": an admin requests a zip of all high-res images/videos from accepted entries.
-- The zip is built in the background (node1 worker) onto shared filestore and the admin is
-- emailed a download link. One row per request; the worker and the download route update status.
-- Rows are swept (zip deleted) shortly after download, or after a TTL.

IF OBJECT_ID('dbo.PrExport', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PrExport (
        prexportid    INT IDENTITY(1,1) PRIMARY KEY,
        programid     INT            NOT NULL,
        status        NVARCHAR(20)   NOT NULL DEFAULT 'pending',  -- pending|running|done|error
        requestedby   INT            NULL,
        requestedemail NVARCHAR(255) NULL,
        baseurl       NVARCHAR(255)  NULL,   -- host the admin used, for the email download link
        filename      NVARCHAR(255)  NULL,   -- zip file name on shared filestore (prExports/)
        filecount     INT            NULL,
        errormsg      NVARCHAR(MAX)  NULL,
        createdat     DATETIME       NOT NULL DEFAULT SYSUTCDATETIME(),
        finishedat    DATETIME       NULL,
        downloadedat  DATETIME       NULL,
        deletedat     DATETIME       NULL
    );
    CREATE INDEX IX_PrExport_status ON dbo.PrExport(status);
END
