-- 073_response_unique_index.sql
-- Hard backstop against duplicate autosave Response rows: a filtered UNIQUE index on the live
-- (non-deleted) rows. Complements the race-safe upserts (072 companion code) — even a future
-- code regression can't create a second non-deleted row for the same (entryid, questionid).
-- Requires migration 072 (dedupe) to have run first (no existing violations).
--
-- NOTE: connections that modify Response must have ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS,
-- ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON and NUMERIC_ROUNDABORT OFF (the
-- Node mssql/tedious driver does, with enableArithAbort:true in config/database.js).

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Response_entry_question' AND object_id = OBJECT_ID('dbo.Response'))
    CREATE UNIQUE INDEX UX_Response_entry_question
        ON dbo.Response (entryid, questionid)
        WHERE deleted = 0;
