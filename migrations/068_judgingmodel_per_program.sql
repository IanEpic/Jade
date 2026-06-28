-- 068_judgingmodel_per_program.sql
-- Two related structural changes for the judge conflict-of-interest feature:
--
-- 1. Add JudgingModel.judgeconflictmodel (INT, NOT NULL, default 0). This is the
--    per-program conflict-of-interest policy, ordered LEAST → MOST restrictive:
--       0 = No conflict management      (admin does anything)            [default]
--       1 = Allow, exclude own scores   (assignable, flagged, self-scores dropped at Calc Final Scores)
--       2 = No judging own entry        (gate at judge allocation)
--       3 = No judging own category     (gate at judge category-assignment)
--       4 = Judges cannot enter         (judge <-> entrant mutually exclusive)
--    All existing programs default to 0 (unchanged behaviour).
--
-- 2. Give every Program its OWN JudgingModel row. Currently 37 programs share just
--    3 model rows (most share id 1), so editing one program's judging model — incl.
--    this new policy or any AI rule — would silently change other programs. We clone
--    the shared model per program and repoint Program.judgingmodelid, so each program
--    is independent. No code changes needed: every reader already loads the model via
--    Program.judgingmodelid. This also sets up backlog #17 (per-program AI rules).
--
-- Idempotent: the clone loop only fires while a model is shared by >1 program; after a
-- single run every program owns a distinct model, so re-running is a no-op.

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1. New column (default 0 = no conflict management).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.JudgingModel') AND name = 'judgeconflictmodel'
)
BEGIN
    ALTER TABLE dbo.JudgingModel
        ADD judgeconflictmodel INT NOT NULL
        CONSTRAINT DF_JudgingModel_judgeconflictmodel DEFAULT 0;
END;
GO
-- GO above: the new column must be committed to the catalog before the next batch
-- (the clone INSERT) is compiled, otherwise it fails name resolution. The explicit
-- transaction spans both batches on the same connection.

-- 2. Clone shared models so each program owns its own row.
WHILE EXISTS (
    SELECT 1 FROM dbo.Program p
    WHERE p.judgingmodelid IS NOT NULL
      AND (SELECT COUNT(*) FROM dbo.Program p2 WHERE p2.judgingmodelid = p.judgingmodelid) > 1
)
BEGIN
    DECLARE @pid INT, @mid INT, @new INT;

    SELECT TOP 1 @pid = p.programid, @mid = p.judgingmodelid
    FROM dbo.Program p
    WHERE p.judgingmodelid IS NOT NULL
      AND (SELECT COUNT(*) FROM dbo.Program p2 WHERE p2.judgingmodelid = p.judgingmodelid) > 1
    ORDER BY p.programid;

    INSERT INTO dbo.JudgingModel
        (scorebasis, minscore, maxscore, scoreincrement, nullscoreallowed,
         nullscorelabel, nullscorevalue, judgeinstructions, commentsallowed,
         commentsrequired, submitbuttonlabel, commentguidelines, finalisttextrules,
         commentexamplesgood, commentexamplesbad, citationrules, judgeconflictmodel)
    SELECT
         scorebasis, minscore, maxscore, scoreincrement, nullscoreallowed,
         nullscorelabel, nullscorevalue, judgeinstructions, commentsallowed,
         commentsrequired, submitbuttonlabel, commentguidelines, finalisttextrules,
         commentexamplesgood, commentexamplesbad, citationrules, judgeconflictmodel
    FROM dbo.JudgingModel
    WHERE judgingmodelid = @mid;

    SET @new = SCOPE_IDENTITY();
    UPDATE dbo.Program SET judgingmodelid = @new WHERE programid = @pid;
END;

COMMIT;
