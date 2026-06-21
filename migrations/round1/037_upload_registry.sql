-- Migration 037: Create UploadRegistry table
-- Replaces the in-memory uploadRegistry Map in formResponses.js so that
-- chunked uploads work correctly behind a multi-node load balancer.
-- chunk-init, chunk, and chunk-complete can now land on different servers.

CREATE TABLE UploadRegistry (
    uploadid   NVARCHAR(100)  NOT NULL PRIMARY KEY,
    type       NVARCHAR(20)   NOT NULL,
    filename   NVARCHAR(500)  NOT NULL,
    filesize   BIGINT         NOT NULL,
    ext        NVARCHAR(20)   NOT NULL,
    tempfile   NVARCHAR(1000) NOT NULL,
    received   BIGINT         NOT NULL DEFAULT 0,
    createdat  DATETIME       NOT NULL DEFAULT GETDATE()
);
