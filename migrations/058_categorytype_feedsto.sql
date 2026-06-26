-- 058_categorytype_feedsto.sql
-- A category type can "feed" the winners of all its categories into a headline award
-- (e.g. the Industry type feeds the "Event Supplier of the Year" headline category). This
-- mapping drives the headline sections of the Finalist VO Script. Configurable on the
-- Category Types admin page so it doesn't rely on a fixed structure.
--
-- CategoryType.feedsto = the headline Category's categoryid (NULL = doesn't feed a headline).

IF COL_LENGTH('dbo.CategoryType', 'feedsto') IS NULL
    ALTER TABLE dbo.CategoryType ADD feedsto INT NULL;
