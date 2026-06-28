-- 072_dedupe_response_rows.sql
-- One-time cleanup of duplicate autosave Response rows. The form autosave used a non-atomic
-- "IF NOT EXISTS INSERT ELSE UPDATE", so concurrent saves for the same (entryid, questionid)
-- accumulated duplicate non-deleted rows (prod: ~8,479 redundant rows across 3,770 groups).
-- The companion code change makes the upsert race-safe; this collapses the existing dupes.
--
-- For each (entryid, questionid) group with >1 non-deleted row, keep MAX(responseid) — the
-- latest row (repeated saves update all dupes to the same value, and readers already take the
-- latest) — and soft-delete the rest. Safe to run while entrants are editing; idempotent
-- (re-running finds no groups). DEPLOY THE CODE FIX FIRST, then run this.

UPDATE r
   SET r.deleted = 1
  FROM Response r
  JOIN (
        SELECT entryid, questionid, MAX(responseid) AS keepid
          FROM Response
         WHERE deleted = 0
         GROUP BY entryid, questionid
        HAVING COUNT(*) > 1
       ) k
    ON k.entryid = r.entryid AND k.questionid = r.questionid
 WHERE r.deleted = 0
   AND r.responseid <> k.keepid;
