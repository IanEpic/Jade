-- Migration 041: Add entryclosedate to Program
-- When set, auto-closes all categories for the program at this datetime.
-- Nullable — null means no auto-close date configured.

ALTER TABLE [dbo].[Program]
ADD entryclosedate datetime NULL;
