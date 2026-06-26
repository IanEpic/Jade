-- 066_entry_statewinner.sql
-- State WINNER flag, set by the State/Territory Finalists tool alongside statefinalist. For each
-- Best Event category + state, the top-scoring state finalist is that state's winner. Stored as
-- the comma-joined state code(s) an entry won (an entry can win one state and be runner-up in
-- another). Cleared and rewritten whenever the tool is re-run.

IF COL_LENGTH('dbo.Entry', 'statewinner') IS NULL
    ALTER TABLE dbo.Entry ADD statewinner NVARCHAR(100) NULL;
