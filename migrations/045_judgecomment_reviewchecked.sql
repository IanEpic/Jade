-- Migration 045: Background-check tracking flag on JudgeComment
-- The cross-entry comment-review job (repetition / entry-specificity) processes
-- each comment once. reviewchecked = 0 means "not yet checked by the background
-- job"; it is reset to 0 whenever a comment is created or edited so the job
-- re-evaluates the new text. The job sets it to 1 after processing.

IF COL_LENGTH('dbo.JudgeComment', 'reviewchecked') IS NULL
    ALTER TABLE [dbo].[JudgeComment] ADD reviewchecked BIT NOT NULL CONSTRAINT DF_JudgeComment_reviewchecked DEFAULT 0;
GO

-- Baseline: treat all pre-existing comments as already checked so the background
-- cross-entry job only evaluates comments created/edited from here on. Without
-- this it would re-audit the entire comment history (API cost + queue noise).
UPDATE JudgeComment SET reviewchecked = 1 WHERE reviewchecked = 0;
