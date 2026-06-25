-- Migration 044: Human-review flag on JudgeComment
-- The AI guideline check (and, later, a background cross-entry repetition check)
-- can mark a comment as needing a human (admin) look without blocking the judge.
-- The admin Review Comments page surfaces only comments where reviewrequested = 1.

IF COL_LENGTH('dbo.JudgeComment', 'reviewrequested') IS NULL
    ALTER TABLE [dbo].[JudgeComment] ADD reviewrequested BIT NOT NULL CONSTRAINT DF_JudgeComment_reviewrequested DEFAULT 0;

IF COL_LENGTH('dbo.JudgeComment', 'reviewreason') IS NULL
    ALTER TABLE [dbo].[JudgeComment] ADD reviewreason NVARCHAR(500) NULL;
