# JADE DB Migration Log — Round 2

Round 1 migrations (001–042) are archived in `migrations/round1/`. All were applied to production on 2026-06-21.

Round 2 covers ongoing development on the live platform. Number from 043 onwards.

---

## 043 — Drop orphaned TopMenu FK columns from Program

`043_drop_program_topmenu_columns.sql`

Drops `adminmenu`, `usermenu`, `judgemenu` from `Program`. These integer FK
columns pointed at the `TopMenu` table, which (along with `TopMenuButton`)
was removed in a prior Round 1 migration. Dead `TopMenu` model/associations/
query were removed from the codebase in the same change. No defaults or FK
constraints on the columns; nothing in the Node app read them.

- Applied to PROD: 2026-06-22 ✓ (code deployed to both nodes first, then columns dropped)

---

## 044 — Human-review flag on JudgeComment

`044_judgecomment_review_flag.sql`

Adds `reviewrequested BIT DEFAULT 0` and `reviewreason NVARCHAR(500)` to
`JudgeComment`. The AI guideline check (borderline verdict) and the background
cross-entry job mark a comment for admin review without blocking the judge; the
admin Review Comments page surfaces only `reviewrequested = 1` comments.

- Applied to DEV: 2026-06-23 ✓  | PROD: 2026-06-25 ✓ (deploy with judging-flow work)

---

## 045 — Background-check flag on JudgeComment

`045_judgecomment_reviewchecked.sql`

Adds `reviewchecked BIT DEFAULT 0` and baselines all existing comments to
`reviewchecked = 1` so the background cross-entry comment-review job only
evaluates comments created/edited after deploy (avoids re-auditing the entire
history). recordScores resets it to 0 on create/edit.

- Applied to DEV: 2026-06-23 ✓  | PROD: 2026-06-25 ✓
- ⚠️ Deploy note: set env `BACKGROUND_JOBS=true` on ONE prod node only (the job
  runs in-process; two nodes would double-process). See deployment_parameters.

## 046 — Category types for finalist-text generation

`046_category_types.sql`

Creates `CategoryType` (per-program groups: Best Event, Achievements, Industry,
Management) with per-group `rules`; adds `Category.categorytypeid` (nullable link)
and `JudgingModel.finalisttextrules` (program-wide rules). These drive the AI
finalist-text generator (global rules + the category's type rules + few-shot
examples + entry data).

- Applied to DEV: 2026-06-24 ✓  | PROD: 2026-06-25 ✓

## 047 — Seed category types for eventawards (1055, 1056)

`047_seed_category_types_eventawards.sql`

Seeds the four types with starter rules for programs 1055 & 1056 (idempotent —
skips a program that already has types). Admins refine rules and assign categories
via Admin → Judging → Category Types. Categories start unassigned (`categorytypeid`
NULL); the generator falls back to examples-only until assigned.

- Applied to DEV: 2026-06-24 ✓  | PROD: 2026-06-25 ✓

## 048 — Assign eventawards categories to types + refine rules

`048_assign_category_types_eventawards.sql`

Adds a 5th **Headline** type (overall awards), refines all five types' rules from
the 2025 finalist-text patterns (Best Event = "Event Name Year, Org, STATE";
Achievements = "Org for their work on Project Year"; Industry/Management = org name
only; Headline = follows the underlying award), and assigns every 1055/1056 category
to its type per https://eventawards.com.au/award-categories/. Idempotent (name-matched
joins). 1055: Best Event 16, Achievements 4, Industry 9, Management 5, Headline 5 —
no category left unassigned.

- Applied to DEV: 2026-06-24 ✓  | PROD: 2026-06-25 ✓

## 050 — Editable good/bad comment examples

`050_comment_examples.sql`

Adds `commentexamplesgood` / `commentexamplesbad` (NVARCHAR(MAX)) to JudgingModel and
seeds them (1055/1056, only when empty) from the examples previously hardcoded in the
comment-check prompt. The checker (`checkComments`) now reads them alongside the
guidelines, and admins edit them at Admin → AI Rules → Judging Guidelines.

- Applied to DEV: 2026-06-24 ✓  | PROD: 2026-06-25 ✓

## 049 — Final finalist-text generation rules

`049_finalisttext_rules_final.sql`

Sets the final program-wide rules (shared JudgingModel.finalisttextrules) and the
per-type rules for 1055 & 1056, tuned against the 2025 finalist texts over several
generate-vs-actual passes (70 → 115/161 exact, ~71%). Captures: org from the
entrant's legal entity; year at the end; list all states / "National Event" at 4+;
omit the state when the org names it; bracket leading The/A/ordinals; self-named
events omit the org. Idempotent (straight UPDATEs). Companion code changes (not in
this migration): the generator now reads `Entrant.legalentity` for the org, caps
response length, and blanks model refusals on incomplete entries.

- Applied to DEV: 2026-06-24 ✓  | PROD: 2026-06-25 ✓

## 051 — Track admin who recorded a payment

`051_payment_processedby.sql`

Adds `Payment.processedby` (INT, nullable). Admin Receive Payment records the payment
under the ENTRANT's userid (so it appears in their My Payments) and stores the admin's
userid in processedby. Companion code: getPaymentsByUser now also returns manual
(EFT/cheque) payments — previously filtered to `ewayTrxnStatus='True'`, which hid EFT.

- Applied to DEV: 2026-06-25 ✓  | PROD: 2026-06-25 ✓

## 052 — Stop baking early-bird discount into invoices

`052_unbake_eb_unpaid_1056.sql`

Early-bird is now applied at PAYMENT time (by payment date), not baked into the invoice
at creation. Clears the erroneously-baked `ebdiscount` from 1056 invoices that still have
unaccepted entries (the ones yet to be processed) so they show the full amount owing.
Companion code: `formInvoice` no longer bakes the earlybird discount (other discounts
still bake); `receivePayment` applies the best valid early-bird discount for the payment
date via `getApplicableDiscounts(paymentDate)` (supports multiple tiers), setting the
invoice's `ebdiscount` only when the amount paid matches the discounted amount.
`formPayment` (entrant online card payment of existing invoices) now computes the
early-bird live at payment time — charges the discounted amount when an EB discount is
still valid today and records it on the invoice (invoices with a stored `ebdiscount`
keep theirs). Without this, un-baking would have charged the full amount during an active
EB window in the next program.

- Applied to DEV: 2026-06-25 ✓  | PROD: 2026-06-25 ✓
- Note: admin configures the early-bird discount(s) on Admin → Setup → Discounts
  (ProgramDiscount type=earlybird, amount + valid-to); the discount applies at payment.

## 053 — Seed early-bird discount for 1056

`053_seed_earlybird_1056.sql`

Seeds the 1056 early-bird discount ("Early Starters Discount", $80.30/entry,
valid 2026-01-01 → 2026-06-01) on PROD. Dev already has this row (created via the
Discounts UI), so the migration is idempotent and a no-op there. Lets admins record
pre-cutoff payments at the discounted amount (early-bird is applied at payment time).

- DEV: already present (via UI) ✓  | PROD: 2026-06-25 ✓ (apply with this deploy)

## 054 — Dirty-flag gate for background jobs

`054_background_job_state.sql`

Creates `BackgroundJobState (jobname PK, dirty, lastrun)`. A triggering event marks a
job dirty; the recurring job skips its tick entirely when not dirty (no DB scan, no AI),
so "nothing changed" = no work. Companion code: `services/jobState.js`
(markJobDirty/isJobDirty/clearJobDirty); `recordScores` marks `commentReview` dirty on
comment create/edit; `commentReviewJob` checks the flag, clears it before processing
(claims the work, so a comment saved mid-run re-arms it), and re-arms if a full batch
suggests more remain. Seed is dirty=1 only if unchecked comments already exist, else 0.
Generalises to any future background job.

- Applied to DEV: 2026-06-25 ✓  | PROD: 2026-06-25 ✓

## 055 — Entry.eventstates for the State-Finalist tool

`055_entry_eventstates.sql`

Adds `Entry.eventstates` (NVARCHAR(100), nullable) — the state(s)/territory an event ran
in, decoded from the structured "In which states or territories…" checkbox (comma-joined
codes e.g. `NSW, VIC`, or `NATIONAL` for 4+, or `UNKNOWN`). Populated at finalist-text time
and by the State-Finalist tool's preview. Companion code (deterministic, no AI):
`services/eventStates.js`, `services/stateFinalists.js`, the Admin → Tools → "Get State
Finalists" action (preview → write `Entry.statefinalist`; read-back from DB after).
Also fixes the multi-select checkbox decode in `getEntryResponsesForText` (`~`-separated,
not `,`), so the finalist-text AI sees multi-state events.

- Applied to DEV: 2026-06-25 ✓  | PROD: 2026-06-25 ✓

## 056 — Store average raw score on FinalScore

`056_finalscore_rawscore.sql`

Adds `FinalScore.rawscore` (FLOAT, nullable). Calc Final Scores already computes a per-entry
weighted raw score (the min-quality gate); it's now persisted alongside `finalscore` so other
features don't recompute it. Companion code: `FinalScore` model + the calcfinalscores confirm
handler write `rawscore`. Existing FinalScore rows stay NULL until the next Calc Final Scores run.

- Applied to DEV: 2026-06-25 ✓  | PROD: 2026-06-25 ✓

## 057 — Best Event State or Territory award snapshot

`057_beststate_result.sql`

Adds `dbo.BestStateResult` (one JSON snapshot per program, unique on `programid`) so the new
Calc Best State tool (Admin → Tools) can reload its computed result without recomputing. Stores
the per-state points/nominees/winners/population/per-capita rows, the winning state, the
population figures used (+ ABS refresh metadata), and the entry counts. Companion code: the
`bestState` service/route/view, the `/beststate/refresh` AJAX population lookup, and the
`beststate` admin action. `computedat` is stored UTC (`SYSUTCDATETIME`) and formatted client-side.

- Applied to DEV: 2026-06-26 ✓  | PROD: 2026-06-26 ✓

## 058–063 — Awards-night output: VO script, headline mapping, winner citations

`058_categorytype_feedsto.sql` — `CategoryType.feedsto` (a type feeds its winners into a headline category).
`059_seed_feedsto.sql` — seeds the feeder→headline mapping by name for 1055 & 1056 (Best Event→Australian Event of the Year, Industry→Event Supplier, Management→Event Agency).
`060_entry_citation.sql` — `Entry.citation`, `Entry.headlinecitation`, `JudgingModel.citationrules`.
`061_entry_headlinewinner.sql` — `Entry.headlinewinner` (marks the headline-award winner among feeder winners).
`062_voscript.sql` — `VoScript` table (editable Finalist VO Script snapshot per program).
`063_seed_citationrules_1056.sql` — seeds citation rule "50-70 words in total" (NB: 1055 & 1056 share JudgingModel #1, so this applies to both).

Companion code: Finalist VO Script tool (editable + Word export), Citations tool (AI winner citations,
per-winner generate/edit/regenerate, headline + State/Territory citations, Word export), Headline
Winners page (Admin→Judging), Citation Rules page (Admin→AI Rules), Category Types "feeds winners
into" dropdown. New dependency: `docx` (run `npm install` on deploy).

- Applied to DEV: 2026-06-26 ✓  | PROD: 2026-06-26 ✓

## 064 — Export PR Info (PrExport job table)

`064_prexport.sql`

Adds `dbo.PrExport` — one row per admin "Export PR Info" request. A background worker (node1,
BACKGROUND_JOBS) zips all high-res images/videos from accepted entries onto shared filestore
(`prExports/`), emails the admin a download link (from the program's emailfromaddress via its
SMTP), and the worker sweeps the zip a few minutes after download (or after 24h). Files named
`[entryid](-DNU)-[pic|vid]-[NNN].ext` — DNU tag when the entrant ticked the media opt-out
checkbox. New dependency: `archiver` (v8, ESM) — run `npm install` on deploy.

- Applied to DEV: 2026-06-26 ✓  | PROD: 2026-06-26 ✓

## 065 — Background-job leader election (JobLease)

`065_joblease.sql`

Adds `dbo.JobLease` (single-row shared lease). Both nodes now run identical code AND identical
env: a DB lease elects ONE leader to run the gated background jobs (commentReview, prExport),
renewed every 20s with a 60s TTL, so the other node auto-takes-over if the leader dies. Replaces
the per-node `BACKGROUND_JOBS` env flag (now removed from node .23's .env; code no longer reads
it). prExport also claims pending rows atomically (UPDLOCK/READPAST) as defence-in-depth.

- Applied to DEV: 2026-06-26 ✓  | PROD: 2026-06-26 ✓

## 066–067 — State winner + certificate text; Results report

`066_entry_statewinner.sql` — `Entry.statewinner` (top state finalist per category-state, set by
the State/Territory Finalists tool alongside statefinalist).
`067_entry_certificatetext.sql` — `Entry.certificatetext` (certificate wording per entry, written
by the tool: national winner → blank/trophy; national finalist → "National Finalist" [+ state
winner]; state winner/finalist → state recognition). Shared `certificateText()` in eventStates.js.

Companion code: corrected state-finalist flagging (ALL top-2 incl national finalists are state
finalists; highest scorer is state winner; national finalists can win a state); the tool is now
ONE step (Re-calculate computes AND writes — no preview); new "Results" report (Admin → Reports →
landing page → Excel: final/avg score, finalist/winner/state finalist/state winner, certificate
text, finalist text, contacts; alternating category bands). Read-only report; no new dependency.

- Applied to DEV: 2026-06-26 ✓  | PROD: 2026-06-26 ✓

## 068 — Judging model per program + judge conflict-of-interest policy

`068_judgingmodel_per_program.sql`

Two changes for the conflict-of-interest feature (#16):
1. Adds `JudgingModel.judgeconflictmodel` (INT, NOT NULL, default 0) — the per-program
   COI policy, ordered least→most restrictive: 0 = no management; 1 = allow but exclude
   the judge's own-entry scores at Calc Final Scores; 2 = no judging own entry (gate at
   allocation); 3 = no judging own category (gate at judge category-assignment); 4 = judges
   cannot enter (judge↔entrant mutually exclusive). All existing programs default to 0.
2. Gives every Program its OWN JudgingModel row. 37 programs previously shared just 3 model
   rows (most shared id 1), so editing one program's judging model — incl. this policy or any
   AI rule — would silently change others. Clones the shared model per program and repoints
   `Program.judgingmodelid`. No code change needed (all readers load via Program.judgingmodelid).
   This also delivers the data side of backlog #17 (per-program AI rules). Uses a `GO` batch
   break so the new column resolves before the clone INSERT; the txn spans both batches.
   Idempotent (loop only fires while a model is shared by >1 program).

Companion code: `judgeconflictmodel` on the JudgingModel model; new "Judging Model" card on
Admin → Program; enforcement gates (judge edit, new entry, allocation, Calc Final Scores) +
viewEntry owner short-circuit safety-net.

- Applied to DEV: 2026-06-28 ✓  | PROD: 2026-06-28 ✓ (applied before code restart; 37 programs → 37 distinct models)

## 069 — User page layout (with/without sidebar)

`069_userpage_withsidebar.sql`

Adds `UserPage.withsidebar` (BIT, NOT NULL, default 0). When set, a user page renders inside the
home framework (sidebar + nav); when 0 it renders standalone (current behaviour). Admin toggles it
per page on Admin → Setup → User Pages (Layout fieldset). `/viewPage?name=` redirects to
`/home?action=userpage&pid=` when the flag is set. Both render paths are now card-formatted.
Existing pages default to 0.

Companion code: UserPage model + formPage save; viewPage redirect; viewPage-content.pug and
home/userpage.pug card styling.

- Applied to DEV: 2026-06-28 ✓  | PROD: 2026-06-28 ✓

## 070 — FinalScoreCriteria weight/score nullable

`070_finalscorecriteria_nullable.sql`

Makes `FinalScoreCriteria.weight` and `.score` nullable (the model already declared them
allowNull:true; the DB columns were NOT NULL — a mismatch). The Calc Final Scores per-criteria
breakdown includes section-header criteria (e.g. "1. Quality of the Event") that have no weight
and no score; with the columns NOT NULL the entire breakdown insert failed and rolled back, so
no breakdown was stored (and a calc could error) for any program whose criteria include headers.
After this, re-running Calc Final Scores stores the breakdown and the entrant Scores & Comments
page shows the per-criteria table. (DEV: re-ran 1055 → 1203 FinalScoreCriteria rows written.)

- Applied to DEV: 2026-06-28 ✓  | PROD: 2026-06-28 ✓

## 071 — Program.lockscores (lock Calc Final Scores)

`071_program_lockscores.sql`

Adds `Program.lockscores` (BIT, NOT NULL, default 0). When set, the Calc Final Scores tool is
disabled for that program (shows a note instead of computing/writing) so a published program's
scores, finalist flags and per-criteria breakdown can't be overwritten by an accidental recalc.
Sets lockscores=1 on every existing program EXCEPT the current live one (1056). Admin can toggle
it on Admin → Program → Judging Model card ("Lock Final Scores"). Uses a GO batch break so the
new column resolves before the UPDATE.

Companion code: Program model + formAdmin save; calcfinalscores admin action early-returns a
locked notice (covers GET preview and POST write); calcfinalscores.pug locked branch.

- Applied to DEV: 2026-06-28 ✓ (36 locked, 1056 unlocked)  | PROD: 2026-06-28 ✓ (36 locked, 1056 unlocked)

## 072 — De-duplicate autosave Response rows

`072_dedupe_response_rows.sql`

One-time cleanup of duplicate autosave Response rows. The form autosave used a non-atomic
`IF NOT EXISTS INSERT ELSE UPDATE`, so concurrent saves for the same (entryid, questionid)
accumulated duplicate non-deleted rows (prod: ~8,479 redundant across 3,770 groups; 1056: 1,044
across 374). Keeps MAX(responseid) per group (latest; readers already take the latest and repeated
saves update all dupes to the same value), soft-deletes the rest. Idempotent; safe to run live.

Companion code (deploy FIRST): `formResponses.js` — all three Response insert paths (text autosave,
caption, file upload) rewritten as race-safe upserts (UPDATE-first under UPDLOCK, SERIALIZABLE,
INSERT only if nothing updated) so no new duplicates are created. Order: deploy code, then run 072.

NOT YET DONE (optional backstop): a filtered unique index on Response(entryid, questionid) WHERE
deleted=0 would hard-prevent recurrence, but deferred to avoid risk on the live 1056 — the atomic
upserts already prevent dupes.

- Applied to DEV: 2026-06-28 ✓ (8,478 → 0)  | PROD: 2026-06-28 ✓ (8,479 → 0, code deployed first)
