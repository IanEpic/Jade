# JADE DB Migration Log

All schema changes required for the multi-program slug / SaaS refactor.
Run these in order against the live DB when ready to deploy.

Tested against: copy of live DB (JadeTest)
Target: live DB (Jade) — run after testing confirmed

---

## 001 — Add slug column to Program table

**Date tested:** 2026-06-04
**Purpose:** Each program gets a unique URL slug for routing (replaces fqdn-based lookup).

```sql
-- Step 1: Add the column (nullable initially so existing rows don't fail)
ALTER TABLE Program ADD slug NVARCHAR(50) NULL;

-- Step 2: Populate slugs for all existing programs
UPDATE Program SET slug = 'aea09'      WHERE programid = 1;
UPDATE Program SET slug = 'aea10'      WHERE programid = 2;
UPDATE Program SET slug = 'demo'       WHERE programid = 3;
UPDATE Program SET slug = 'mta11'      WHERE programid = 5;
UPDATE Program SET slug = 'sbts11'     WHERE programid = 6;
UPDATE Program SET slug = 'acs11'      WHERE programid = 7;
UPDATE Program SET slug = 'aea11'      WHERE programid = 15;
UPDATE Program SET slug = 'mta12'      WHERE programid = 16;
UPDATE Program SET slug = 'aea12'      WHERE programid = 17;
UPDATE Program SET slug = 'aea13'      WHERE programid = 18;
UPDATE Program SET slug = 'mta14'      WHERE programid = 19;
UPDATE Program SET slug = 'aea14'      WHERE programid = 20;
UPDATE Program SET slug = 'iabca15'    WHERE programid = 21;
UPDATE Program SET slug = 'aea15'      WHERE programid = 22;
UPDATE Program SET slug = 'mta15'      WHERE programid = 23;
UPDATE Program SET slug = 'pca16'      WHERE programid = 25;
UPDATE Program SET slug = 'iabca16'    WHERE programid = 26;
UPDATE Program SET slug = 'aea16'      WHERE programid = 1026;
UPDATE Program SET slug = 'rpay16'     WHERE programid = 1027;
UPDATE Program SET slug = 'mta16'      WHERE programid = 1028;
UPDATE Program SET slug = 'pca17'      WHERE programid = 1029;
UPDATE Program SET slug = 'rpay17'     WHERE programid = 1031;
UPDATE Program SET slug = 'aea17'      WHERE programid = 1033;
UPDATE Program SET slug = 'blank'      WHERE programid = 1034;
UPDATE Program SET slug = 'nrla'       WHERE programid = 1035;
UPDATE Program SET slug = 'rpay18'     WHERE programid = 1036;
UPDATE Program SET slug = 'pca18'      WHERE programid = 1037;
UPDATE Program SET slug = 'aea18'      WHERE programid = 1038;
UPDATE Program SET slug = 'exportnsw'  WHERE programid = 1047;
UPDATE Program SET slug = 'aea19'      WHERE programid = 1048;
UPDATE Program SET slug = 'aea20'      WHERE programid = 1049;
UPDATE Program SET slug = 'aea21'      WHERE programid = 1051;
UPDATE Program SET slug = 'aea22'      WHERE programid = 1052;
UPDATE Program SET slug = 'aea23'      WHERE programid = 1053;
UPDATE Program SET slug = 'aea24'      WHERE programid = 1054;
UPDATE Program SET slug = 'aea25'      WHERE programid = 1055;
UPDATE Program SET slug = 'aea26'      WHERE programid = 1056;

-- Step 3: Enforce NOT NULL and unique once all rows are populated
ALTER TABLE Program ALTER COLUMN slug NVARCHAR(50) NOT NULL;
CREATE UNIQUE INDEX UQ_Program_slug ON Program (slug);
```

---

## 002 — Widen User.password column for bcrypt

**Date tested:** 2026-06-04
**Purpose:** Legacy Perl used DES crypt (max 13 chars). Node uses bcrypt which produces 60-char hashes. The existing `NVARCHAR(50)` column truncates them.

```sql
ALTER TABLE [User] ALTER COLUMN password NVARCHAR(100);
```

---

## 003 — Create ProgramDiscount table

**Date tested:** 2026-06-04
**Purpose:** Flexible discount system supporting early bird deadlines and discount codes, per-program (categoryid nullable for future per-category expansion).

```sql
CREATE TABLE ProgramDiscount (
    discountid   INT IDENTITY(1,1) PRIMARY KEY,
    programid    INT NOT NULL,
    categoryid   INT NULL,
    type         NVARCHAR(20) NOT NULL,      -- 'earlybird' | 'code'
    code         NVARCHAR(50) NULL,          -- NULL for earlybird, code string for discount codes
    amount       DECIMAL(10,2) NOT NULL,
    amounttype   NVARCHAR(10) NOT NULL,      -- 'dollars' | 'percent'
    validfrom    DATETIME NULL,
    validto      DATETIME NULL,              -- early bird deadline
    maxuses      INT NULL,                   -- NULL = unlimited
    usecount     INT NOT NULL DEFAULT 0,
    active       BIT NOT NULL DEFAULT 1,
    FOREIGN KEY (programid) REFERENCES Program(programid),
    FOREIGN KEY (categoryid) REFERENCES Category(categoryid)
);
```

---

## 004 — Add name column to ProgramDiscount

**Date tested:** 2026-06-04
**Purpose:** Human-readable label for each discount, shown in admin UI, payment options banner, and invoice notes.

```sql
ALTER TABLE ProgramDiscount ADD name NVARCHAR(100) NULL;
```

---

## 005 — Create UserCredential table

**Date tested:**
**Purpose:** Separate authentication (email + password) from program membership. One credential row per email address, shared across all programs the user belongs to.

```sql
CREATE TABLE UserCredential (
    credentialid INT IDENTITY(1,1) PRIMARY KEY,
    email        NVARCHAR(255) NOT NULL,
    password     NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_UserCredential_email UNIQUE (email)
);
```

---

## 006 — Populate UserCredential from existing User data

**Date tested:**
**Purpose:** For each unique email, pick the password from the User row with the most recent LogOnRecord entry. Falls back to lowest userid for emails with no login history.

```sql
INSERT INTO UserCredential (email, password)
SELECT email, password
FROM (
    SELECT
        u.email,
        u.password,
        ROW_NUMBER() OVER (
            PARTITION BY u.email
            ORDER BY ISNULL(
                (SELECT MAX(lor.timestamp) FROM LogOnRecord lor WHERE lor.userid = u.userid),
                '1900-01-01'
            ) DESC, u.userid ASC
        ) AS rn
    FROM [User] u
    WHERE u.email IS NOT NULL
      AND LEN(LTRIM(RTRIM(u.email))) > 0
      AND u.password IS NOT NULL
      AND LEN(u.password) > 0
) ranked
WHERE rn = 1;
```

---

## 007 — Add credentialid FK to User table

**Date tested:**
**Purpose:** Link each User row to its UserCredential. Nullable so deleted/no-email users don't block the migration.

```sql
-- Step 1: Add column
ALTER TABLE [User] ADD credentialid INT NULL;

-- Step 2: Populate from email match
UPDATE u
SET u.credentialid = uc.credentialid
FROM [User] u
INNER JOIN UserCredential uc ON uc.email = u.email;

-- Step 3: Add FK (nullable — some rows may not link if they have no email)
ALTER TABLE [User] ADD CONSTRAINT FK_User_Credential
    FOREIGN KEY (credentialid) REFERENCES UserCredential(credentialid);
```

---

## 008 — Soft-delete User rows with no login history

**Date tested:**
**Purpose:** After migration 007 linked all User rows to UserCredential by email, users who
registered across multiple programs now appear in each other's program switchers. This cleans
up rows where the person never actually logged into that program, has no entries/invoices/payments,
and therefore has no meaningful data there.

Run the inspection query first to review what will be affected before running the cleanup.

```sql
-- Inspection: review rows that will be soft-deleted
SELECT
    u.userid,
    u.email,
    u.programid,
    p.slug,
    p.name AS programname,
    (SELECT COUNT(*) FROM LogOnRecord lor WHERE lor.userid = u.userid) AS logincount,
    (SELECT COUNT(*) FROM Entry     e   WHERE e.userid   = u.userid) AS entrycount,
    (SELECT COUNT(*) FROM Invoice   i   WHERE i.userid   = u.userid) AS invoicecount,
    (SELECT COUNT(*) FROM Payment   pay WHERE pay.userid = u.userid) AS paymentcount
FROM [User] u
INNER JOIN Program p ON p.programid = u.programid
WHERE u.deleted = 0
  AND u.credentialid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM LogOnRecord lor WHERE lor.userid = u.userid)
  AND NOT EXISTS (SELECT 1 FROM Entry       e   WHERE e.userid   = u.userid)
  AND NOT EXISTS (SELECT 1 FROM Invoice     i   WHERE i.userid   = u.userid)
  AND NOT EXISTS (SELECT 1 FROM Payment     pay WHERE pay.userid = u.userid)
ORDER BY u.email, u.programid;

-- Step 1: Soft-delete for verification (reversible)
UPDATE [User]
SET deleted = 1
WHERE deleted = 0
  AND credentialid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM LogOnRecord lor WHERE lor.userid = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Entry       e   WHERE e.userid   = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Invoice     i   WHERE i.userid   = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Payment     pay WHERE pay.userid = [User].userid);

-- Step 2: Hard-delete once soft-delete has been verified working
-- (~35,000 rows on live DB — run after confirming the app behaves correctly with soft-deleted rows)
DELETE FROM [User]
WHERE deleted = 1
  AND credentialid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM LogOnRecord lor WHERE lor.userid = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Entry       e   WHERE e.userid   = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Invoice     i   WHERE i.userid   = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Payment     pay WHERE pay.userid = [User].userid);
```

---

## 009 — Clean up duplicate emails and re-enable users with login history

**Date tested:**
**Purpose:** Two housekeeping fixes:
1. Where the same email appears more than once in a program, soft-delete the row(s) with no
   login history, keeping the one that has actually been used.
2. Re-enable any disabled user (enabled=0) who has a LogOnRecord entry — these are real users
   who were incorrectly disabled or whose disable was inadvertent.

```sql
-- Inspection: duplicate emails within same program
SELECT email, programid, COUNT(*) AS cnt
FROM [User]
WHERE deleted = 0
GROUP BY email, programid
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- Step 1: Soft-delete the weaker duplicate (no login history, fewest entries)
-- Keeps the row with the most recent login; where tied, keeps lowest userid.
UPDATE [User]
SET deleted = 1
WHERE deleted = 0
  AND userid NOT IN (
      -- The "winner" for each email+program — most recent login, else lowest userid
      SELECT winner FROM (
          SELECT
              u.userid,
              ROW_NUMBER() OVER (
                  PARTITION BY u.email, u.programid
                  ORDER BY ISNULL(
                      (SELECT MAX(lor.timestamp) FROM LogOnRecord lor WHERE lor.userid = u.userid),
                      '1900-01-01'
                  ) DESC, u.userid ASC
              ) AS rn
          FROM [User] u
          WHERE u.deleted = 0
      ) ranked(userid, rn)
      WHERE rn = 1
  )
  AND email IN (
      SELECT email FROM [User]
      WHERE deleted = 0
      GROUP BY email, programid
      HAVING COUNT(*) > 1
  );

-- Step 2: Re-enable disabled users who have login history
UPDATE [User]
SET enabled = 1
WHERE enabled = 0
  AND deleted = 0
  AND EXISTS (SELECT 1 FROM LogOnRecord lor WHERE lor.userid = [User].userid);
```

---

## 010 — Delete orphaned UserCredential rows

**Date tested:**
**Purpose:** After migration 008 hard-deletes ghost User rows, some UserCredential rows will have
no active User rows referencing them. Clean these up.

Run after migration 008 step 2 is complete.

```sql
-- Inspection: review orphaned credentials
SELECT uc.credentialid, uc.email
FROM UserCredential uc
WHERE NOT EXISTS (
    SELECT 1 FROM [User] u WHERE u.credentialid = uc.credentialid
);

-- Cleanup
DELETE FROM UserCredential
WHERE NOT EXISTS (
    SELECT 1 FROM [User] u WHERE u.credentialid = UserCredential.credentialid
);
```

---

## 011 — Add commentguidelines to JudgingModel

**Date tested:**
**Purpose:** Store per-program judging comment guidelines used by the AI comment checker
to validate judge comments before they are saved.

```sql
ALTER TABLE JudgingModel ADD commentguidelines NVARCHAR(MAX) NULL;
```

---

## 012 — Add mustchangepassword to UserCredential

**Date tested:**
**Purpose:** Flag set when a password reset is issued. Forces the user to choose a new password
on next login before reaching the portal.

```sql
ALTER TABLE UserCredential ADD mustchangepassword BIT NOT NULL DEFAULT 0;
```

---

## 013 — Add email activation to UserCredential

**Date tested:**
**Purpose:** New users who self-register via the signup form must confirm their email before
they can log in a second time. Existing users default to activated = 1 so they are unaffected.

```sql
ALTER TABLE UserCredential ADD activated BIT NOT NULL DEFAULT 1;
ALTER TABLE UserCredential ADD activationtoken NVARCHAR(100) NULL;
```

---

## 014 — Add orda to CategoryQuestionLink

**Date tested:**
**Purpose:** Allow per-category question ordering. Previously questions were ordered at the
program level; this enables each category to have its own question sequence.

```sql
-- Step 1: Add column
ALTER TABLE CategoryQuestionLink ADD orda INT NULL;

-- Step 2: Populate with per-category row numbers ordered by questionid
UPDATE cql
SET cql.orda = sub.rn
FROM CategoryQuestionLink cql
INNER JOIN (
    SELECT linkid,
           ROW_NUMBER() OVER (PARTITION BY categoryid ORDER BY questionid) AS rn
    FROM CategoryQuestionLink
) sub ON sub.linkid = cql.linkid;
```

---

## 015 — Populate orda on CategoryEligibilityLink

**Date tested:**
**Purpose:** Allow per-category eligibility rule ordering. The `orda FLOAT` column already
exists in the table (no ALTER needed). Just populate existing rows so they have a default order.

```sql
UPDATE cel
SET cel.orda = sub.rn
FROM CategoryEligibilityLink cel
INNER JOIN (
    SELECT linkid,
           ROW_NUMBER() OVER (PARTITION BY categoryid ORDER BY eligibilityid) AS rn
    FROM CategoryEligibilityLink
) sub ON sub.linkid = cel.linkid;
```

---

## 016 — Clean up loginpagetext on all Program rows

**Date tested:** 2026-06-07
**Purpose:** Modernise login page content for Node app — the new login form handles
password reset and new user signup inline, so legacy links/text in loginpagetext are
redundant. Also removes "Please Log In..." intro sentence which is obvious from the form.

Three sequential updates — run all three in order:

### Step 1 — Strip everything after &lt;~form~&gt; except "Still having issues..." line

```sql
-- Preview what will change
SELECT programid, name, loginpagetext
FROM Program
WHERE loginpagetext LIKE '%~form~%'
  AND loginpagetext LIKE '%Still having issues%';
```

This is a data transformation — run via the Node script below (too complex for raw SQL
due to per-row regex substitution needed). Alternatively do it by hand in the admin UI
for each program.

**What it removes (after the form marker):**
- "Note: If you have not used this portal before..." paragraph
- "Click here to reset your password" link
- Any `<br><br>` / `<p>` spacers between form and "Still having issues"

**What it keeps:**
- The `&lt;~form~&gt;` marker itself
- `<h6><a href="mailto:support@shadedsolutions.com.au">Still having issues logging in...</a></h6>`

### Step 2 — Remove "Please Log In..." sentence (preceded by newline or `<p>` tag)

Removes the sentence starting with `Please Log In below or set up a new user...`
that appears on its own line/paragraph immediately before the marker.

### Step 3 — Remove "Please Log In..." sentence (preceded by `<br><br>` within a `<p>`)

Same as step 2 but for programs where the Please sentence was inside a `<p>` tag
along with the welcome heading, separated by `<br /><br />`.

**Node script to run all three steps against prod DB:**

```javascript
// Run with: node -e "..." from the Jade project root
// Make sure DATABASE env vars point to the PRODUCTION DB before running

import('./src/models/Program.js').then(async ({default: Program}) => {
  const programs = await Program.findAll();
  const marker = '&lt;~form~&gt;';

  for (const p of programs) {
    let text = p.loginpagetext;
    if (!text || !text.includes(marker)) continue;
    const original = text;

    // Step 1: keep only 'Still having issues' after the marker
    const markerIdx = text.indexOf(marker);
    const before = text.substring(0, markerIdx + marker.length);
    const after  = text.substring(markerIdx + marker.length);
    const stillIdx = after.indexOf('Still having issues');
    if (stillIdx !== -1) {
      const tagStart  = after.lastIndexOf('<h', stillIdx);
      const closing   = tagStart !== -1 ? after.slice(tagStart).match(/<(h[0-9])[^>]*>[\s\S]*?<\/\1>/i) : null;
      const stillLine = closing ? closing[0] : '';
      text = before + (stillLine ? '\n' + stillLine : '');
    }

    // Step 2: remove 'Please Log In...' preceded by newline or <p> tag
    text = text.replace(/(?:<p[^>]*>|[\r\n]+)\s*Please\b[\s\S]*?(?=&lt;~form~&gt;)/i, '');

    // Step 3: remove 'Please Log In...' preceded by <br><br> within a <p>
    text = text.replace(/\s*(?:<br\s*\/?>[\s\r\n]*){1,2}\s*Please\b[\s\S]*?(?=&lt;~form~&gt;)/i, '\n');

    // Step 4: shorten support link text
    text = text.replace(
      'Still having issues logging in, click here to contact the support team.',
      'Click here to contact the support team.'
    );

    if (text !== original) {
      await p.update({ loginpagetext: text });
      console.log('Updated', p.programid, p.name);
    }
  }
  process.exit(0);
});
```

---

## 017 — Remove #decoration div from login shell templates

**Date tested:** 2026-06-07
**Purpose:** The `#decoration` div in login HTML templates references a `login-header.jpg`
image that no longer exists, leaving an empty 206px gap between the header and content.

Remove this block from each affected login template file in `cgi-bin/design/`:

```
<div id='decoration'>
</div>
```

**Affected files:**
- `login_eventawards2026.html`
- `login_eventawards2025.html`
- `login_eventawards2022.html`
- `login_eventawards2021.html`
- `login_eventawards2020.html`
- `login_eventawards2019.html`
- `login_eventawards2018.html`

_(These files live in Apache htdocs, not the Node project — edit directly on the server.)_

---

## Migration 019 — Category.adminonly flag (2026-06-07)

Add an `adminonly` bit column to `Category`. Categories flagged admin-only are hidden from the public "Start a New Entry" list but still exist in the DB and can be entered via admin override.

```sql
ALTER TABLE Category ADD adminonly BIT NOT NULL DEFAULT 0
```

## Migration 020 — Program default flags for new category fields (2026-06-07)

Add default columns to `Program` for the four new category phase flags.

```sql
ALTER TABLE Program
  ADD scorereadydefault       BIT NOT NULL DEFAULT 0,
      finalistreviewdefault   BIT NOT NULL DEFAULT 0,
      wildcarddecisiondefault BIT NOT NULL DEFAULT 0,
      winnernominationdefault BIT NOT NULL DEFAULT 0
```

## 021 — Add captionlabel to Question, caption to Response

**Date tested:**
**Purpose:** Image and video questions can now have an admin-specified caption prompt. The entrant's caption text is stored alongside the file response for use in reporting/download.

```sql
ALTER TABLE Question ADD captionlabel NVARCHAR(200) NULL;
ALTER TABLE Response ADD caption NVARCHAR(MAX) NULL;
```

## 022 — Migrate existing photo caption data into Response.caption

**Date tested:** 2026-06-07
**Purpose:** Caption questions (matching questiontext LIKE '%Provide a caption (including names
of people%') are paired with the nearest preceding image/video question within each shared
category. "Nearest preceding image/video" skips non-image/video questions (captions from other
categories, NOTE blocks, etc.) that may have been interleaved in older programs where per-category
orda was not applied. The caption response data is migrated into `Response.caption` on the image
response row, `captionlabel` is set on the image questions, and the caption questions/responses
are soft-deleted.

Run after migration 021 (which adds the `captionlabel` and `caption` columns).

**How the pairs CTE works:**
For each (caption question, category) combination, it finds the image/video question in the same
category with the highest orda that is still less than the caption's orda. This means other
question types (captions from other categories, noinput NOTE blocks) between an image and its
caption are skipped automatically. A caption question appearing in multiple categories may
produce multiple (caption_qid → image_qid) pairs; that is intentional and correct because
different categories have different image questions.

```sql
-- ── Shared pairs CTE (used in every step) ─────────────────────────────────────
-- all_links: every non-deleted question with its per-category sort position
-- nearest_image: for each (caption, category), the nearest preceding image/video by orda
-- pairs: deduplicated (caption_qid, image_qid) — multiple rows per caption_qid are OK
--        because each entrant is in only one category and has responses for only that
--        category's questions, so the UPDATE/DELETE joins resolve correctly.

-- ── Inspection: run first — all rows should be OK ─────────────────────────────
WITH all_links AS (
    SELECT cql.categoryid,
           q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid,
           sort_orda AS caption_orda, questiontext
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid, cl.categoryid,
           al.questionid AS image_qid, al.inputtype, al.questiontext AS image_question,
           ROW_NUMBER() OVER (
               PARTITION BY cl.caption_qid, cl.categoryid
               ORDER BY al.sort_orda DESC, al.questionid DESC
           ) AS rn
    FROM caption_links cl
    INNER JOIN all_links al
        ON al.categoryid = cl.categoryid
       AND al.inputtype IN ('image','video')
       AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT caption_qid, image_qid, inputtype AS image_inputtype, image_question
    FROM nearest_image WHERE rn = 1
)
SELECT p.caption_qid, p.image_qid, p.image_inputtype, p.image_question, 'OK' AS check_result
FROM pairs p
UNION ALL
-- Caption questions that have no preceding image/video in any of their categories
SELECT q.questionid, NULL, NULL, NULL, 'ERROR: no preceding image/video in any category'
FROM Question q
WHERE q.deleted = 0
  AND q.questiontext LIKE '%Provide a caption (including names of people%'
  AND q.questionid NOT IN (SELECT caption_qid FROM pairs)
ORDER BY caption_qid;

-- Do not proceed if any ERROR row appears.

-- ── Step 1: Copy caption value → Response.caption on the matching image response ──
WITH all_links AS (
    SELECT cql.categoryid, q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid, sort_orda AS caption_orda
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid, al.questionid AS image_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT caption_qid, image_qid FROM nearest_image WHERE rn = 1
)
UPDATE r_img
SET r_img.caption = r_cap.value
FROM Response r_img
INNER JOIN Response r_cap ON r_cap.entryid = r_img.entryid AND r_cap.deleted = 0
INNER JOIN pairs p ON p.caption_qid = r_cap.questionid AND p.image_qid = r_img.questionid
WHERE r_img.deleted = 0;

-- ── Step 2: For entries with a caption but no image response, insert the image response ──
WITH all_links AS (
    SELECT cql.categoryid, q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid, sort_orda AS caption_orda
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid, al.questionid AS image_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT caption_qid, image_qid FROM nearest_image WHERE rn = 1
)
INSERT INTO Response (entryid, questionid, value, caption, deleted)
SELECT r_cap.entryid, p.image_qid, '', r_cap.value, 0
FROM Response r_cap
INNER JOIN pairs p ON p.caption_qid = r_cap.questionid
WHERE r_cap.deleted = 0
  AND NOT EXISTS (
      SELECT 1 FROM Response r_img
      WHERE r_img.entryid = r_cap.entryid
        AND r_img.questionid = p.image_qid
        AND r_img.deleted = 0
  );

-- ── Step 3: Set captionlabel on all matched image questions ──
WITH all_links AS (
    SELECT cql.categoryid, q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid, sort_orda AS caption_orda
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid, al.questionid AS image_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT image_qid FROM nearest_image WHERE rn = 1
)
UPDATE Question
SET captionlabel = 'Please provide a caption for the photograph above (include names of people pictured).'
WHERE questionid IN (SELECT image_qid FROM pairs);

-- ── Step 4: Soft-delete the caption Response rows ──
WITH all_links AS (
    SELECT cql.categoryid, q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid, sort_orda AS caption_orda
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT caption_qid FROM nearest_image WHERE rn = 1
)
UPDATE Response SET deleted = 1
WHERE questionid IN (SELECT caption_qid FROM pairs);

-- ── Step 5: Soft-delete the caption Question rows ──
WITH all_links AS (
    SELECT cql.categoryid, q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid, sort_orda AS caption_orda
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT caption_qid FROM nearest_image WHERE rn = 1
)
UPDATE Question SET deleted = 1
WHERE questionid IN (SELECT caption_qid FROM pairs);
```

**Verification query (run after step 1, before steps 4/5):**
```sql
WITH all_links AS (
    SELECT cql.categoryid, q.questionid, q.inputtype, q.questiontext,
           COALESCE(cql.orda, q.orda, q.questionid) AS sort_orda
    FROM CategoryQuestionLink cql
    INNER JOIN Question q ON q.questionid = cql.questionid AND q.deleted = 0
),
caption_links AS (
    SELECT categoryid, questionid AS caption_qid, sort_orda AS caption_orda
    FROM all_links
    WHERE questiontext LIKE '%Provide a caption (including names of people%'
),
nearest_image AS (
    SELECT cl.caption_qid, al.questionid AS image_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (
    SELECT DISTINCT caption_qid, image_qid FROM nearest_image WHERE rn = 1
)
SELECT r_img.entryid, r_img.questionid AS img_qid, r_img.value AS filename,
       r_img.caption, r_cap.value AS original_caption,
       CASE WHEN r_img.caption = r_cap.value THEN 'OK' ELSE 'MISMATCH' END AS check_result
FROM Response r_img
INNER JOIN Response r_cap ON r_cap.entryid = r_img.entryid AND r_cap.deleted = 0
INNER JOIN pairs p ON p.image_qid = r_img.questionid AND p.caption_qid = r_cap.questionid
WHERE r_img.deleted = 0
ORDER BY r_img.entryid, r_img.questionid;
```

_(further migrations will be added as we go)_

---

## 023 — Drop TopMenu and TopMenuButton tables

**Date tested:**
**Purpose:** Top menu buttons are now hardcoded per role in `src/routes/home.js`
(`buildMenuButtons`). The `TopMenu` and `TopMenuButton` tables are no longer read
by the Node app and can be removed. No foreign keys reference either table.

```sql
-- Inspection: confirm rows before dropping (should match the 3 menus / ~18 buttons
-- you reviewed when hardcoding the values)
SELECT 'TopMenu' AS tbl, COUNT(*) AS rows FROM TopMenu
UNION ALL
SELECT 'TopMenuButton', COUNT(*) FROM TopMenuButton;

-- Drop child table first (buttons reference menus by topmenulistid)
DROP TABLE TopMenuButton;
DROP TABLE TopMenu;
```

---

## 026 — Update adminwelcometext for AEA 2026

**Date applied:** 2026-06-09
**Purpose:** Rewrites adminwelcometext for programid 1056 with a concise
admin-facing welcome (key dates, entry costs, contact). Uses plain semantic
HTML — no inline styles — relying on the `.home-content` CSS added in the
same commit to apply the dark theme. Also expands `.home-content` in
main.styl to properly style all TinyMCE-emitted elements (h2/h3, p, ul,
table, a, strong).

---

## 025 — Update standardwelcometext for AEA 2026

**Date applied:** 2026-06-09
**Purpose:** Rewrites legacy TinyMCE-generated HTML (inline styles, fixed-width
table, legacy colour spans, `&nbsp;` padding) to clean semantic HTML matching
the dark theme. Key dates table uses class `entries-intro-table`. Commented-out
early-bird pricing removed (kept in git history). Applies to programid 1056
(Australian Event Awards 2026) only.

---

## 024 — Update downloadpagehtml for AEA 2026

**Date applied:** 2026-06-08
**Purpose:** Rewrites legacy TinyMCE-generated HTML (inline height styles, align
attrs, `../wwwref/` paths) to clean semantic HTML matching the new dark theme.
Sections grouped into styled `.dl-section` divs with `.dl-table` tables.
All file paths updated from `../wwwref/aeadocs/` to `/wwwref/aeadocs/`.
Applies to programid 1056 (Australian Event Awards 2026) only.

---

## 027 — Restyle standardwelcometext for AEA 2026

**Date applied:** 2026-06-12
**Purpose:** Rewrites standardwelcometext into `.welcome-section` div cards matching the dark-theme bevel-box aesthetic. Applies to programid 1056 only.

---

## 028 — Update standardwelcometext heading for AEA 2026

**Date applied:** 2026-06-12
**Purpose:** Moves the Welcome heading to a top-level `<h2>` (centred, larger), removes the card from the intro section, keeps cards for all other sections. Applies to programid 1056 only.

---

## 029 — Restyle all remaining welcome text fields for AEA 2026

**Date applied:** 2026-06-12
**Purpose:** Applies `.welcome-section` card pattern to `adminwelcometext`, `judgewelcometext`, `finalistwelcometext`, `nonfinalistwelcometext`. Note: `judgewelcometext` still contains 2025 judging dates — update separately before judging opens. Applies to programid 1056 only.

---

## 030 — Create StatsProgram table

**Date applied:** 2026-06-12
**Purpose:** Creates `StatsProgram` table to replace the hardcoded `STATS_PROGRAMS` array in `homeQueries.js`. Seeds historical AEA data from 2011–2026. Required for the `/home` stats panel — missing this table causes a 500 error on the home page.

```sql
CREATE TABLE StatsProgram (
    statsprogramid INT IDENTITY(1,1) PRIMARY KEY,
    year           INT  NOT NULL,
    programid      INT  NOT NULL,
    opendate       DATE NOT NULL,
    esdate         DATE NOT NULL,
    closedate      DATE NOT NULL,
    lifetimecat    INT  NOT NULL DEFAULT 1
);
```

Then seed with INSERT — see `migrations/030_stats_program_table.sql`.

---

## 031 — Add originalname to Response

**Date applied:** 2026-06-12
**Purpose:** Stores the user-facing filename (e.g. `my testimonial.doc`) separately from the random storage filename in `value`. Used to display and suggest the original name on download without exposing the internal storage name.

```sql
ALTER TABLE Response ADD originalname NVARCHAR(500) NULL;
```


---

## 032 — Populate commentguidelines on JudgingModel

**Date applied:** 2026-06-12
**Purpose:** Copies judging comment guidelines from the dev DB (JadeTest) into UAT and production. Content was copied manually via SSMS. An admin UI to update this field is planned for a future session.

```sql
-- Verify content is present after manual copy:
SELECT programid, LEFT(commentguidelines, 100) AS preview
FROM JudgingModel
WHERE commentguidelines IS NOT NULL;
```


---

## 033–034 — (reserved / not recorded)

Applied to UAT during earlier sessions. Check git log for context.

---

## 035 — Add profile fields to UserCredential; backfill from User

**Date applied to UAT:** 2026-06-14
**Purpose:** Move personal profile fields (firstname, lastname, organisation, telephone, mobile, fax) and platform-level superadmin flag from User to UserCredential, making them cross-program. Migration adds columns, backfills from User using ROW_NUMBER to pick the best profile per credential, then links any unlinked User rows.

See `migrations/035_usercredential_profile.sql` and `run035.js` (temporary runner, now deleted).

**Status:** Applied to UAT. Must be run on PROD before go-live.

---

## 036 — Drop profile and auth columns from User table

**Date applied to UAT:** 2026-06-18 (in two parts)
**Purpose:** Remove columns from User that are now owned by UserCredential.

Part A — profile columns (firstname, lastname, organisation, telephone, mobile, fax)
Part B — auth columns (email, password, question, answer)

See `migrations/036_user_drop_profile_columns.sql` for the full script (covers both parts).

**Status:** Applied to UAT. Must be run on PROD before go-live (after migration 035).
