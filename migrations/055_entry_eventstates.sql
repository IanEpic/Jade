-- Migration 055: store each entry's event state(s)/territory for the State-Finalist tool.
-- Populated by the AI state-extraction step (run at finalist-text time). Holds a
-- comma-separated list of state codes (e.g. 'NSW, VIC'), or 'NATIONAL' for events held
-- in 4+ states/territories, or NULL/UNKNOWN if not yet determined.
IF COL_LENGTH('dbo.Entry','eventstates') IS NULL
    ALTER TABLE [dbo].[Entry] ADD eventstates NVARCHAR(100) NULL;
