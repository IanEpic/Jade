-- 067_entry_certificatetext.sql
-- Certificate wording per entry, written by the State/Territory Finalists tool when it runs
-- (depends on national finalist/winner + state finalist/winner status). National winners get a
-- trophy (blank); national finalists get "National Finalist" (+ state winner if applicable);
-- state winners/finalists get their state recognition. Handy to keep on file for printing.

IF COL_LENGTH('dbo.Entry', 'certificatetext') IS NULL
    ALTER TABLE dbo.Entry ADD certificatetext NVARCHAR(255) NULL;
