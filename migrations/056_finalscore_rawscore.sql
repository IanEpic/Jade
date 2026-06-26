-- Migration 056: store the average raw score alongside the final score.
-- Calc Final Scores already computes a per-entry weighted raw score (the min-quality gate);
-- persist it so other features don't have to recompute it.
IF COL_LENGTH('dbo.FinalScore','rawscore') IS NULL
    ALTER TABLE [dbo].[FinalScore] ADD rawscore FLOAT NULL;
