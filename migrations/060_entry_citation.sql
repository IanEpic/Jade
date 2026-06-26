-- 060_entry_citation.sql
-- Winner citations for the awards night. Each category winner gets a two-part citation
-- (a short celebratory description of what they did + a "The judges said:" praise line
-- paraphrased from the judging comments). Winners that also feed a headline award get a
-- SEPARATE headline citation (the audience will have heard the category one earlier).
-- The generation length/tone is configured per program via JudgingModel.citationrules.

IF COL_LENGTH('dbo.Entry', 'citation') IS NULL
    ALTER TABLE dbo.Entry ADD citation NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.Entry', 'headlinecitation') IS NULL
    ALTER TABLE dbo.Entry ADD headlinecitation NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.JudgingModel', 'citationrules') IS NULL
    ALTER TABLE dbo.JudgingModel ADD citationrules NVARCHAR(MAX) NULL;
