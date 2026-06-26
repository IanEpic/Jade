-- 061_entry_headlinewinner.sql
-- Marks which feeder-category winner actually won a headline award (e.g. which of the Best
-- Event category winners is "Australian Event of the Year"). Set on the Admin → Judging →
-- Headline Winners page. Headline categories themselves hold no entries, so the flag lives on
-- the winning entry (an entry feeds exactly one headline via its type's feedsto).

IF COL_LENGTH('dbo.Entry', 'headlinewinner') IS NULL
    ALTER TABLE dbo.Entry ADD headlinewinner BIT NULL;
