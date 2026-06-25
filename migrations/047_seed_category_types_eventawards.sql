-- Migration 047: Seed the four category types for the eventawards programs (1055, 1056)
-- with starter generation rules. Admins refine the rules and assign categories via the UI.
-- Idempotent: only seeds a program that has no category types yet.

DECLARE @progs TABLE (programid INT);
INSERT INTO @progs (programid) VALUES (1055), (1056);

DECLARE @pid INT;
DECLARE cur CURSOR FOR SELECT programid FROM @progs;
OPEN cur;
FETCH NEXT FROM cur INTO @pid;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM CategoryType WHERE programid = @pid AND deleted = 0)
    BEGIN
        INSERT INTO CategoryType (programid, name, orda, rules) VALUES
        (@pid, 'Best Event', 1,
            'Format: "Event Name Year, Organisation, STATE". The organisation is the body that owns or organised the event (usually the entrant — drop legal suffixes like Ltd / Pty Ltd / Inc). Always include the state/territory abbreviation (NSW, VIC, QLD, WA, SA, TAS, NT, ACT). Keep the event name exactly as the entrant wrote it, including its year.'),
        (@pid, 'Achievements', 2,
            'Individual or team achievement categories. Use the person or team name, or the organisation, following the example style for the category. No event name or state unless the examples include one.'),
        (@pid, 'Industry', 3,
            'Company / supplier "of the Year" categories. Use the organisation or company name only, dropping legal suffixes (Ltd / Pty Ltd / Inc). Do not include an event name or state.'),
        (@pid, 'Management', 4,
            'Agency / management company categories. Use the organisation or company name only, dropping legal suffixes (Ltd / Pty Ltd / Inc). Do not include an event name or state.');
    END
    FETCH NEXT FROM cur INTO @pid;
END
CLOSE cur;
DEALLOCATE cur;
