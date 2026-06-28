-- 070_finalscorecriteria_nullable.sql
-- The per-criteria breakdown written by Calc Final Scores includes section-header criteria
-- (e.g. "1. Quality of the Event") that have NO weight and NO score — they group the
-- weighted sub-criteria beneath them. FinalScoreCriteria.weight and .score were NOT NULL,
-- so any program whose criteria include such headers failed the breakdown insert entirely
-- (rolled back → no breakdown stored, and the calc could error). Make both columns nullable.

IF COL_LENGTH('dbo.FinalScoreCriteria','weight') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.FinalScoreCriteria') AND name='weight' AND is_nullable=0)
    ALTER TABLE dbo.FinalScoreCriteria ALTER COLUMN weight FLOAT NULL;

IF COL_LENGTH('dbo.FinalScoreCriteria','score') IS NOT NULL
   AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dbo.FinalScoreCriteria') AND name='score' AND is_nullable=0)
    ALTER TABLE dbo.FinalScoreCriteria ALTER COLUMN score FLOAT NULL;
