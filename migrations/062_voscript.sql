-- 062_voscript.sql
-- Editable Finalist VO Script. The script is derived from finalist text, but admins tweak the
-- wording (pronunciation, headings) before the awards night, so the edited version is saved
-- here (one JSON snapshot per program) and used for the Word export. "Regenerate from Finalist
-- Text" rebuilds it from the current finalists, discarding edits.

IF OBJECT_ID('dbo.VoScript', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VoScript (
        voscriptid INT IDENTITY(1,1) PRIMARY KEY,
        programid  INT            NOT NULL,
        content    NVARCHAR(MAX)  NOT NULL,
        updatedat  DATETIME       NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_VoScript_program ON dbo.VoScript(programid);
END
