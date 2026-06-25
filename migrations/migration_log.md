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

- Applied to DEV: 2026-06-23 ✓  | PROD: pending (deploy with judging-flow work)

---

## 045 — Background-check flag on JudgeComment

`045_judgecomment_reviewchecked.sql`

Adds `reviewchecked BIT DEFAULT 0` and baselines all existing comments to
`reviewchecked = 1` so the background cross-entry comment-review job only
evaluates comments created/edited after deploy (avoids re-auditing the entire
history). recordScores resets it to 0 on create/edit.

- Applied to DEV: 2026-06-23 ✓  | PROD: pending
- ⚠️ Deploy note: set env `BACKGROUND_JOBS=true` on ONE prod node only (the job
  runs in-process; two nodes would double-process). See deployment_parameters.

## 046 — Category types for finalist-text generation

`046_category_types.sql`

Creates `CategoryType` (per-program groups: Best Event, Achievements, Industry,
Management) with per-group `rules`; adds `Category.categorytypeid` (nullable link)
and `JudgingModel.finalisttextrules` (program-wide rules). These drive the AI
finalist-text generator (global rules + the category's type rules + few-shot
examples + entry data).

- Applied to DEV: 2026-06-24 ✓  | PROD: pending

## 047 — Seed category types for eventawards (1055, 1056)

`047_seed_category_types_eventawards.sql`

Seeds the four types with starter rules for programs 1055 & 1056 (idempotent —
skips a program that already has types). Admins refine rules and assign categories
via Admin → Judging → Category Types. Categories start unassigned (`categorytypeid`
NULL); the generator falls back to examples-only until assigned.

- Applied to DEV: 2026-06-24 ✓  | PROD: pending

## 048 — Assign eventawards categories to types + refine rules

`048_assign_category_types_eventawards.sql`

Adds a 5th **Headline** type (overall awards), refines all five types' rules from
the 2025 finalist-text patterns (Best Event = "Event Name Year, Org, STATE";
Achievements = "Org for their work on Project Year"; Industry/Management = org name
only; Headline = follows the underlying award), and assigns every 1055/1056 category
to its type per https://eventawards.com.au/award-categories/. Idempotent (name-matched
joins). 1055: Best Event 16, Achievements 4, Industry 9, Management 5, Headline 5 —
no category left unassigned.

- Applied to DEV: 2026-06-24 ✓  | PROD: pending

## 050 — Editable good/bad comment examples

`050_comment_examples.sql`

Adds `commentexamplesgood` / `commentexamplesbad` (NVARCHAR(MAX)) to JudgingModel and
seeds them (1055/1056, only when empty) from the examples previously hardcoded in the
comment-check prompt. The checker (`checkComments`) now reads them alongside the
guidelines, and admins edit them at Admin → AI Rules → Judging Guidelines.

- Applied to DEV: 2026-06-24 ✓  | PROD: pending

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

- Applied to DEV: 2026-06-24 ✓  | PROD: pending

## 051 — Track admin who recorded a payment

`051_payment_processedby.sql`

Adds `Payment.processedby` (INT, nullable). Admin Receive Payment records the payment
under the ENTRANT's userid (so it appears in their My Payments) and stores the admin's
userid in processedby. Companion code: getPaymentsByUser now also returns manual
(EFT/cheque) payments — previously filtered to `ewayTrxnStatus='True'`, which hid EFT.

- Applied to DEV: 2026-06-25 ✓  | PROD: pending

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

- Applied to DEV: 2026-06-25 ✓  | PROD: pending
- Note: admin configures the early-bird discount(s) on Admin → Setup → Discounts
  (ProgramDiscount type=earlybird, amount + valid-to); the discount applies at payment.

## 053 — Seed early-bird discount for 1056

`053_seed_earlybird_1056.sql`

Seeds the 1056 early-bird discount ("Early Starters Discount", $80.30/entry,
valid 2026-01-01 → 2026-06-01) on PROD. Dev already has this row (created via the
Discounts UI), so the migration is idempotent and a no-op there. Lets admins record
pre-cutoff payments at the discounted amount (early-bird is applied at payment time).

- DEV: already present (via UI) ✓  | PROD: pending (apply with this deploy)
