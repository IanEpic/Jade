-- Migration 048: Assign eventawards categories (1055, 1056) to their types and
-- refine the per-type generation rules from the 2025 finalist-text patterns.
-- Mapping per https://eventawards.com.au/award-categories/ (Best Event, Achievements,
-- Industry, Management, Headline). Idempotent: re-running re-applies the same values.

-- ── Add the 5th "Headline" type (overall awards) per program, if missing ──────────
INSERT INTO CategoryType (programid, name, orda, rules)
SELECT p.programid, N'Headline', 5, NULL
FROM (VALUES (1055), (1056)) AS p(programid)
WHERE NOT EXISTS (
    SELECT 1 FROM CategoryType ct WHERE ct.programid = p.programid AND ct.name = N'Headline' AND ct.deleted = 0
);

-- ── Refine the rules (learned from the 2025 finalist texts) ───────────────────────
UPDATE CategoryType SET rules =
N'Format: "Event Name including its year, Organisation, STATE". The organisation is the body that owns or organised the event — usually the entrant, but use the actual organising organisation if the entry makes it clear; drop legal suffixes (Ltd, Pty Ltd, Inc). Always include the state/territory abbreviation (NSW, VIC, QLD, WA, SA, TAS, NT, ACT). Keep the event name exactly as the entrant wrote it, including the year. Example: "Deni Ute Muster 2024, Deni Play On The Plains Festival, NSW".'
WHERE name = N'Best Event' AND programid IN (1055, 1056) AND deleted = 0;

UPDATE CategoryType SET rules =
N'Format: "Organisation for their work on Project/Event Name Year". Lead with the organisation or team that did the work (drop legal suffixes), then "for their work on", then the project/event and its year. Best Export entries that cover general international work rather than one named project use "for their 2024/2025 International Achievements". Examples: "Mellen Events & We Are Gather for their work on Pair''d Margaret River Region 2024"; "Artists in Motion for their 2024/2025 International Achievements".'
WHERE name = N'Achievements' AND programid IN (1055, 1056) AND deleted = 0;

UPDATE CategoryType SET rules =
N'Company / supplier "of the Year" categories. Use the organisation or company name only, dropping legal suffixes (Ltd, Pty Ltd, Inc). No event name, project or state. Example: "Clean Vibes".'
WHERE name = N'Industry' AND programid IN (1055, 1056) AND deleted = 0;

UPDATE CategoryType SET rules =
N'Agency or in-house team "of the Year" categories. Use the organisation, agency or team name only, dropping legal suffixes (Ltd, Pty Ltd, Inc). No event name, project or state. Example: "Moonee Valley City Council".'
WHERE name = N'Management' AND programid IN (1055, 1056) AND deleted = 0;

UPDATE CategoryType SET rules =
N'Overall / headline awards, usually drawn from finalists in other categories. The format follows the kind of award: event awards (e.g. Australian Event of the Year) use "Event Name Year, Organisation, STATE"; supplier or agency awards use the organisation name only. Follow the example finalist texts for the specific category. Drop legal suffixes.'
WHERE name = N'Headline' AND programid IN (1055, 1056) AND deleted = 0;

-- ── Assign categories to types (by name, joined to the program's type) ────────────
UPDATE c SET categorytypeid = ct.categorytypeid
FROM Category c
INNER JOIN CategoryType ct ON ct.programid = c.programid AND ct.name = N'Best Event' AND ct.deleted = 0
WHERE c.programid IN (1055, 1056) AND c.deleted = 0 AND c.name IN (
    N'Best Sporting Event', N'Best Tourism Event', N'Best Charity or Cause-Related Event',
    N'Best Congress or Conference < 500 Delegates', N'Best Congress or Conference 500 Delegates or Over',
    N'Best Association Event', N'Best Exhibition, Trade or Consumer Show', N'Best Corporate Event',
    N'Best Brand Event', N'Best Incentive Event', N'Best Community Event', N'Best Cultural, Arts or Music Event',
    N'Best Small Regional Event', N'Best Regional Event', N'Best Small Event', N'Best New Event',
    N'City of Coffs Harbour Best New Event', N'City of Coffs Harbour Best Regional Event'
);

UPDATE c SET categorytypeid = ct.categorytypeid
FROM Category c
INNER JOIN CategoryType ct ON ct.programid = c.programid AND ct.name = N'Achievements' AND ct.deleted = 0
WHERE c.programid IN (1055, 1056) AND c.deleted = 0 AND c.name IN (
    N'Best Achievement in Design', N'Best Achievement in Event Marketing or Communication',
    N'Best Technical Achievement or Innovation', N'Best Export'
);

UPDATE c SET categorytypeid = ct.categorytypeid
FROM Category c
INNER JOIN CategoryType ct ON ct.programid = c.programid AND ct.name = N'Industry' AND ct.deleted = 0
WHERE c.programid IN (1055, 1056) AND c.deleted = 0 AND c.name IN (
    N'Venue Team of the Year', N'Event Hotel of the Year', N'Caterer of the Year',
    N'Theming, Branding or Styling Company of the Year', N'Destination Marketing Business of the Year',
    N'Production Company of the Year', N'Hire Company of the Year',
    N'Exhibition Services / Event Build Company of the Year', N'Service Company of the Year'
);

UPDATE c SET categorytypeid = ct.categorytypeid
FROM Category c
INNER JOIN CategoryType ct ON ct.programid = c.programid AND ct.name = N'Management' AND ct.deleted = 0
WHERE c.programid IN (1055, 1056) AND c.deleted = 0 AND c.name IN (
    N'In-House Event Team of the Year', N'PCO of the Year', N'Small Event Agency of the Year',
    N'Public Event Agency of the Year', N'Corporate Event Agency of the Year'
);

UPDATE c SET categorytypeid = ct.categorytypeid
FROM Category c
INNER JOIN CategoryType ct ON ct.programid = c.programid AND ct.name = N'Headline' AND ct.deleted = 0
WHERE c.programid IN (1055, 1056) AND c.deleted = 0 AND (
    c.name IN (N'Judges'' Special Award', N'Event Supplier of the Year', N'Event Agency of the Year', N'Australian Event of the Year')
    OR c.name LIKE N'The State or Territory Award%'
);
