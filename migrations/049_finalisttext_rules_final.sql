-- Migration 049: Final finalist-text generation rules (refined from 2025 data)
-- Sets the program-wide rules (shared JudgingModel) and the per-type rules for the
-- eventawards programs (1055, 1056). Tuned against the 2025 finalist texts. ASCII-clean.
-- Idempotent (straight UPDATEs). Code change: generator reads Entrant.legalentity.

UPDATE jm SET finalisttextrules = N'- The organisation is an organisation, council or company - NEVER an individual person''s name. Use the Entrant organisation; only if the Entrant itself is a person''s name, use the organising organisation named in the entry (never fall back to the person''s name).
- Alphabetisation reorder: if the NAME BEING ALPHABETISED begins with a leading "The", "A", or an ordinal like "3rd"/"43rd" (its first word only), strip that word and append it in brackets at the very end of that name, after any year. Examples: "The Electric Canvas" -> "Electric Canvas (The)"; "3rd Annual AIDN Policy Symposium 2024" -> "Annual AIDN Policy Symposium (3rd) 2024"; "The Carlsberg Beach Club 2025" -> "Carlsberg Beach Club 2025 (The)". Do NOT move a "The"/"A" that is not the first word.'
FROM JudgingModel jm INNER JOIN Program p ON p.judgingmodelid = jm.judgingmodelid
WHERE p.programid IN (1055, 1056);

UPDATE CategoryType SET rules = N'Format: "Event Name Year, Organisation, STATE".
- The name being alphabetised is the EVENT name. Apply the leading-The/A/ordinal reorder to the EVENT name only; leave the organisation''s own leading "The" in place (e.g. "...2025, The Bite Project, SA").
- Place the year at the END of the event name (e.g. "AIATSIS Summit 2025", not "2025 AIATSIS Summit"); otherwise keep the event name exactly as written.
- List EVERY state/territory the event was staged in, comma-separated (e.g. "NSW, VIC, QLD"). If 4 or more, use "National Event" instead of listing them.
- Do NOT append a state/territory if the organisation name already identifies it - this includes spelled-out forms. Examples where NO state is added: "Events ACT", "Destination NSW", "South Australian Tourism Commission", "Northern Territory Major Events Company" (Northern Territory = NT), "Tasmanian ...", "Queensland ...". Append the state only when the organisation does not already name it.
- The organisation is the body that owns or organised the event (usually the entrant; drop legal suffixes Ltd/Pty Ltd/Inc). Example: "Deni Ute Muster 2024, Deni Play On The Plains Festival, NSW". If the organisation''s name is essentially the same as the event name (a self-named event), omit the organisation entirely - just "Event Name Year, STATE" (e.g. "Adelaide Fringe 2025, SA"; "State of Social 2024, WA").'
WHERE programid IN (1055, 1056) AND name = N'Best Event' AND deleted = 0;

UPDATE CategoryType SET rules = N'Format: "Organisation for their work on Project/Event Name Year". Lead with the organisation or team that did the work (drop legal suffixes), then "for their work on", then the project/event and its year. Best Export entries that cover general international work rather than one named project use "for their 2024/2025 International Achievements". Examples: "Mellen Events & We Are Gather for their work on Pair''d Margaret River Region 2024"; "Artists in Motion for their 2024/2025 International Achievements".'
WHERE programid IN (1055, 1056) AND name = N'Achievements' AND deleted = 0;

UPDATE CategoryType SET rules = N'Company / supplier "of the Year" categories. Use the organisation or company name only, dropping legal suffixes (Ltd, Pty Ltd, Inc). No event name, project or state. Example: "Clean Vibes".'
WHERE programid IN (1055, 1056) AND name = N'Industry' AND deleted = 0;

UPDATE CategoryType SET rules = N'Agency or in-house team "of the Year" categories. Use the organisation, agency or team name only, dropping legal suffixes (Ltd, Pty Ltd, Inc). No event name, project or state. Example: "Moonee Valley City Council".'
WHERE programid IN (1055, 1056) AND name = N'Management' AND deleted = 0;

UPDATE CategoryType SET rules = N'Overall / headline awards, usually drawn from finalists in other categories. The format follows the kind of award: event awards (e.g. Australian Event of the Year) use "Event Name Year, Organisation, STATE"; supplier or agency awards use the organisation name only. Follow the example finalist texts for the specific category. Drop legal suffixes.'
WHERE programid IN (1055, 1056) AND name = N'Headline' AND deleted = 0;
