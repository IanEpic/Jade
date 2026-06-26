-- 057_beststate_result.sql
-- Persist the computed "Best Event State or Territory" award so the Calc Best State page can
-- reload it without recomputing (admins force a fresh run with Recalculate). One snapshot row
-- per program: the full result (per-state points/nominees/winners/population/per-capita, the
-- winning state, the population figures used, and the entry counts) stored as JSON.

IF OBJECT_ID('dbo.BestStateResult', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BestStateResult (
        beststateresultid INT IDENTITY(1,1) PRIMARY KEY,
        programid         INT            NOT NULL,
        snapshot          NVARCHAR(MAX)  NOT NULL,
        computedby        INT            NULL,
        computedat        DATETIME       NOT NULL DEFAULT GETDATE()
    );
    CREATE UNIQUE INDEX UX_BestStateResult_program ON dbo.BestStateResult(programid);
END
