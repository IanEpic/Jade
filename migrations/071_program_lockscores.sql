-- 071_program_lockscores.sql
-- Adds Program.lockscores (BIT, NOT NULL, default 0). When set, the Calc Final Scores tool is
-- disabled for that program (results are final — guards against an accidental recalculation that
-- would overwrite finalist flags and the per-criteria breakdown). Set on every EXISTING program
-- except the current live one (1056), which is still mid-cycle.

SET XACT_ABORT ON;
BEGIN TRAN;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Program') AND name = 'lockscores'
)
BEGIN
    ALTER TABLE dbo.Program
        ADD lockscores BIT NOT NULL
        CONSTRAINT DF_Program_lockscores DEFAULT 0;
END;
GO
-- GO: the new column must exist before the UPDATE below is compiled.

UPDATE dbo.Program SET lockscores = 1 WHERE programid <> 1056;

COMMIT;
