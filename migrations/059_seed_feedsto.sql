-- 059_seed_feedsto.sql
-- Seed the CategoryType.feedsto headline mapping (added in 058) for the existing Australian
-- Event Awards programs. Maps by NAME so it works across programs (1055, 1056, …) regardless
-- of ids. Idempotent: only fills types that don't already have a feedsto set, so any manual
-- configuration via the Category Types admin page is preserved.

UPDATE ct SET ct.feedsto = hc.categoryid
FROM dbo.CategoryType ct
JOIN dbo.Category hc ON hc.programid = ct.programid AND hc.deleted = 0
WHERE ct.deleted = 0 AND ct.feedsto IS NULL
  AND ((ct.name = 'Best Event' AND hc.name = 'Australian Event of the Year')
    OR (ct.name = 'Industry'   AND hc.name = 'Event Supplier of the Year')
    OR (ct.name = 'Management'  AND hc.name = 'Event Agency of the Year'));
