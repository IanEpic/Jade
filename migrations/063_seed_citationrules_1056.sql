-- 063_seed_citationrules_1056.sql
-- Pre-seed the winner-citation length rule for the 2026 program (1056). Idempotent: only sets
-- it when the program's citation rules are still empty, so any later edit on the AI Rules page
-- is preserved.

UPDATE jm SET jm.citationrules = '50-70 words in total'
FROM dbo.JudgingModel jm
JOIN dbo.Program p ON p.judgingmodelid = jm.judgingmodelid
WHERE p.programid = 1056 AND (jm.citationrules IS NULL OR jm.citationrules = '');
