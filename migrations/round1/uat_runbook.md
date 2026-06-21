# UAT Deployment Runbook

Run this top-to-bottom against a **restored copy of the production DB** (e.g. `JadeUAT`).
Do NOT run against the live `Jade` DB until UAT is signed off.

Steps marked **[NODE SCRIPT]** require the Node app's `.env` to point at `JadeUAT` before running.
Steps marked **[FILE EDIT]** are changes to Apache/wwwref files on the web server, not SQL.

---

## UAT run notes (2026-06-12)

Any deviations from the script discovered during the UAT run are noted under each migration.
These notes carry forward to the production runbook.

- SQL Server address from the LXC is `192.168.16.4` (not hostname `EPIC-VS-SQL-01`)
- App entry point is `src/app.js` (not `app.js`) — systemd `ExecStart` must reflect this
- `DB_NAME=JadeUAT`, all other DB creds same as dev
- Migration 007: ALTER TABLE + UPDATE must be run as separate sqlcmd batches (SQL Server won't resolve new column in same batch)
- Migration 007: 276 users with email but no credential — all in programid=4 (defunct program) with no password and no login history. Expected, not an error.

---

## Pre-flight

1. Restore a backup of the live `Jade` DB as `JadeUAT` on the same SQL Server instance.
2. Update `.env` in the Node project:
   ```
   DB_DATABASE=JadeUAT
   ```
3. Verify the Node app can connect and the root `/login` page loads before running any migrations.

---

## Migration 001 — Add slug column to Program

```sql
ALTER TABLE Program ADD slug NVARCHAR(50) NULL;

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

-- Confirm every Program has a slug before enforcing NOT NULL
SELECT programid, name FROM Program WHERE slug IS NULL;
-- If any rows returned, add slugs above and re-run before proceeding.

ALTER TABLE Program ALTER COLUMN slug NVARCHAR(50) NOT NULL;
CREATE UNIQUE INDEX UQ_Program_slug ON Program (slug);
```

---

## Migration 002 — Widen User.password for bcrypt

```sql
ALTER TABLE [User] ALTER COLUMN password NVARCHAR(100);
```

---

## Migration 003 — Create ProgramDiscount table

```sql
CREATE TABLE ProgramDiscount (
    discountid   INT IDENTITY(1,1) PRIMARY KEY,
    programid    INT NOT NULL,
    categoryid   INT NULL,
    type         NVARCHAR(20) NOT NULL,
    code         NVARCHAR(50) NULL,
    amount       DECIMAL(10,2) NOT NULL,
    amounttype   NVARCHAR(10) NOT NULL,
    validfrom    DATETIME NULL,
    validto      DATETIME NULL,
    maxuses      INT NULL,
    usecount     INT NOT NULL DEFAULT 0,
    active       BIT NOT NULL DEFAULT 1,
    FOREIGN KEY (programid) REFERENCES Program(programid),
    FOREIGN KEY (categoryid) REFERENCES Category(categoryid)
);
```

---

## Migration 004 — Add name to ProgramDiscount

```sql
ALTER TABLE ProgramDiscount ADD name NVARCHAR(100) NULL;
```

---

## Migration 005 — Create UserCredential table

```sql
CREATE TABLE UserCredential (
    credentialid INT IDENTITY(1,1) PRIMARY KEY,
    email        NVARCHAR(255) NOT NULL,
    password     NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_UserCredential_email UNIQUE (email)
);
```

---

## Migration 006 — Populate UserCredential from User data

Picks the password from the most-recently-logged-in User row for each unique email.

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

-- Verify: should be roughly the number of distinct emails in User
SELECT COUNT(*) FROM UserCredential;
```

---

## Migration 007 — Add credentialid FK to User

```sql
ALTER TABLE [User] ADD credentialid INT NULL;

UPDATE u
SET u.credentialid = uc.credentialid
FROM [User] u
INNER JOIN UserCredential uc ON uc.email = u.email;

ALTER TABLE [User] ADD CONSTRAINT FK_User_Credential
    FOREIGN KEY (credentialid) REFERENCES UserCredential(credentialid);

-- Verify: users with email but no credential (should be 0)
SELECT COUNT(*) FROM [User]
WHERE email IS NOT NULL AND LEN(LTRIM(RTRIM(email))) > 0 AND credentialid IS NULL;
```

---

## Migration 008 — Soft-delete ghost User rows

Users who registered across multiple programs via Perl but never actually logged into a program,
and have no entries/invoices/payments there.

**Step 1: Inspect first**
```sql
SELECT
    u.userid, u.email, u.programid, p.slug, p.name AS programname,
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
```

**Step 2: Soft-delete (reversible)**
```sql
UPDATE [User]
SET deleted = 1
WHERE deleted = 0
  AND credentialid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM LogOnRecord lor WHERE lor.userid = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Entry       e   WHERE e.userid   = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Invoice     i   WHERE i.userid   = [User].userid)
  AND NOT EXISTS (SELECT 1 FROM Payment     pay WHERE pay.userid = [User].userid);
```

> **UAT note:** Skip the hard-delete (step 3 from migration_log.md) for now.
> Run it only after UAT is signed off and you're confident the soft-delete is correct.

---

## Migration 009 — De-dupe emails, re-enable users with login history

```sql
-- Inspect: duplicate emails within same program
SELECT email, programid, COUNT(*) AS cnt
FROM [User]
WHERE deleted = 0
GROUP BY email, programid
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- Soft-delete the weaker duplicate
UPDATE [User]
SET deleted = 1
WHERE deleted = 0
  AND userid NOT IN (
      SELECT userid FROM (
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
      ) ranked
      WHERE rn = 1
  )
  AND email IN (
      SELECT email FROM [User]
      WHERE deleted = 0
      GROUP BY email, programid
      HAVING COUNT(*) > 1
  );

-- Re-enable disabled users who have login history
UPDATE [User]
SET enabled = 1
WHERE enabled = 0
  AND deleted = 0
  AND EXISTS (SELECT 1 FROM LogOnRecord lor WHERE lor.userid = [User].userid);
```

---

## Migration 010 — Delete orphaned UserCredential rows

Run after migration 008 step 2. Removes credential rows with no active User referencing them.

```sql
-- Inspect
SELECT uc.credentialid, uc.email
FROM UserCredential uc
WHERE NOT EXISTS (
    SELECT 1 FROM [User] u WHERE u.credentialid = uc.credentialid
);

-- Delete
DELETE FROM UserCredential
WHERE NOT EXISTS (
    SELECT 1 FROM [User] u WHERE u.credentialid = UserCredential.credentialid
);
```

---

## Migration 011 — Add commentguidelines to JudgingModel

```sql
ALTER TABLE JudgingModel ADD commentguidelines NVARCHAR(MAX) NULL;
```

---

## Migration 012 — Add mustchangepassword to UserCredential

```sql
ALTER TABLE UserCredential ADD mustchangepassword BIT NOT NULL DEFAULT 0;
```

---

## Migration 013 — Add email activation columns to UserCredential

```sql
ALTER TABLE UserCredential ADD activated BIT NOT NULL DEFAULT 1;
ALTER TABLE UserCredential ADD activationtoken NVARCHAR(100) NULL;
```

---

## Migration 014 — Add orda to CategoryQuestionLink

```sql
ALTER TABLE CategoryQuestionLink ADD orda INT NULL;

UPDATE cql
SET cql.orda = sub.rn
FROM CategoryQuestionLink cql
INNER JOIN (
    SELECT linkid,
           ROW_NUMBER() OVER (PARTITION BY categoryid ORDER BY questionid) AS rn
    FROM CategoryQuestionLink
) sub ON sub.linkid = cql.linkid;

-- Verify
SELECT TOP 20 categoryid, questionid, orda FROM CategoryQuestionLink ORDER BY categoryid, orda;
```

---

## Migration 015 — Populate orda on CategoryEligibilityLink

Column already exists as FLOAT — just populate it.

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

## Migration 016 — Clean up loginpagetext on all Program rows [NODE SCRIPT]

Ensure `.env` points at `JadeUAT`, then run:

```
node --input-type=module <<'EOF'
import('./src/models/Program.js').then(async ({default: Program}) => {
  const programs = await Program.findAll();
  const marker = '&lt;~form~&gt;';

  for (const p of programs) {
    let text = p.loginpagetext;
    if (!text || !text.includes(marker)) continue;
    const original = text;

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

    text = text.replace(/(?:<p[^>]*>|[\r\n]+)\s*Please\b[\s\S]*?(?=&lt;~form~&gt;)/i, '');
    text = text.replace(/\s*(?:<br\s*\/?>[\s\r\n]*){1,2}\s*Please\b[\s\S]*?(?=&lt;~form~&gt;)/i, '\n');
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
EOF
```

---

## Migration 017 — Remove #decoration div from login shell templates [FILE EDIT]

On the Apache server, remove this block from each of the 7 login HTML templates in `cgi-bin/design/`:

```html
<div id='decoration'>
</div>
```

**Affected files:**
- `login_eventawards2018.html`
- `login_eventawards2019.html`
- `login_eventawards2020.html`
- `login_eventawards2021.html`
- `login_eventawards2022.html`
- `login_eventawards2025.html`
- `login_eventawards2026.html`

---

## Migration 018 — Button border-radius in event awards CSS [FILE EDIT]

In each active event awards stylesheet (`style_sheet_eventawards2018.css` through
`style_sheet_eventawards2026.css`) in the `wwwref` folder on the web server, find the button
style block and change:

```css
text-transform: none; border: 0; border-radius: 0;
```
to:
```css
text-transform: none; border: 0; border-radius: 4px;
```

---

## Migration 019 — Add adminonly flag to Category

```sql
ALTER TABLE Category ADD adminonly BIT NOT NULL DEFAULT 0;
```

---

## Migration 020 — Add default category flags to Program

```sql
ALTER TABLE Program
  ADD scorereadydefault       BIT NOT NULL DEFAULT 0,
      finalistreviewdefault   BIT NOT NULL DEFAULT 0,
      wildcarddecisiondefault BIT NOT NULL DEFAULT 0,
      winnernominationdefault BIT NOT NULL DEFAULT 0;
```

---

## Migration 021 — Add captionlabel and caption columns

```sql
ALTER TABLE Question ADD captionlabel NVARCHAR(200) NULL;
ALTER TABLE Response ADD caption NVARCHAR(MAX) NULL;
```

---

## Migration 022 — Migrate existing photo caption data

**Run the inspection query first. Do not proceed if any ERROR rows are returned.**

### Inspection
```sql
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
SELECT q.questionid, NULL, NULL, NULL, 'ERROR: no preceding image/video in any category'
FROM Question q
WHERE q.deleted = 0
  AND q.questiontext LIKE '%Provide a caption (including names of people%'
  AND q.questionid NOT IN (SELECT caption_qid FROM pairs)
ORDER BY caption_qid;
```

### Step 1 — Copy caption value into Response.caption on the image response
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
pairs AS (SELECT DISTINCT caption_qid, image_qid FROM nearest_image WHERE rn = 1)
UPDATE r_img
SET r_img.caption = r_cap.value
FROM Response r_img
INNER JOIN Response r_cap ON r_cap.entryid = r_img.entryid AND r_cap.deleted = 0
INNER JOIN pairs p ON p.caption_qid = r_cap.questionid AND p.image_qid = r_img.questionid
WHERE r_img.deleted = 0;
```

### Step 2 — Insert image response for entries that have a caption but no image response
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
pairs AS (SELECT DISTINCT caption_qid, image_qid FROM nearest_image WHERE rn = 1)
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
```

### Verification — run after step 1, before steps 3–5
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
pairs AS (SELECT DISTINCT caption_qid, image_qid FROM nearest_image WHERE rn = 1)
SELECT r_img.entryid, r_img.questionid AS img_qid, r_img.value AS filename,
       r_img.caption, r_cap.value AS original_caption,
       CASE WHEN r_img.caption = r_cap.value THEN 'OK' ELSE 'MISMATCH' END AS check_result
FROM Response r_img
INNER JOIN Response r_cap ON r_cap.entryid = r_img.entryid AND r_cap.deleted = 0
INNER JOIN pairs p ON p.image_qid = r_img.questionid AND p.caption_qid = r_cap.questionid
WHERE r_img.deleted = 0
ORDER BY r_img.entryid, r_img.questionid;
-- All rows should show 'OK'. If any MISMATCH, investigate before continuing.
```

### Step 3 — Set captionlabel on matched image questions
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
pairs AS (SELECT DISTINCT image_qid FROM nearest_image WHERE rn = 1)
UPDATE Question
SET captionlabel = 'Please provide a caption for the photograph above (include names of people pictured).'
WHERE questionid IN (SELECT image_qid FROM pairs);
```

### Step 4 — Soft-delete caption Response rows
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
    SELECT cl.caption_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (SELECT DISTINCT caption_qid FROM nearest_image WHERE rn = 1)
UPDATE Response SET deleted = 1
WHERE questionid IN (SELECT caption_qid FROM pairs);
```

### Step 5 — Soft-delete caption Question rows
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
    SELECT cl.caption_qid,
           ROW_NUMBER() OVER (PARTITION BY cl.caption_qid, cl.categoryid ORDER BY al.sort_orda DESC, al.questionid DESC) AS rn
    FROM caption_links cl
    INNER JOIN all_links al ON al.categoryid = cl.categoryid AND al.inputtype IN ('image','video') AND al.sort_orda < cl.caption_orda
),
pairs AS (SELECT DISTINCT caption_qid FROM nearest_image WHERE rn = 1)
UPDATE Question SET deleted = 1
WHERE questionid IN (SELECT caption_qid FROM pairs);
```

---

## Migration 023 — Drop TopMenu and TopMenuButton tables

Top menu buttons are now hardcoded per role in the Node app. These tables are no longer used.

```sql
-- Inspect row counts before dropping
SELECT 'TopMenu' AS tbl, COUNT(*) AS rows FROM TopMenu
UNION ALL
SELECT 'TopMenuButton', COUNT(*) FROM TopMenuButton;

DROP TABLE TopMenuButton;
DROP TABLE TopMenu;
```

---

## Migration 024 — Update downloadpagehtml for AEA 2026

Rewrites legacy inline-styled HTML to clean semantic HTML matching the dark theme.
Run this only if the AEA2026 program (programid 1056) is in your UAT scope.

> **Note:** This was applied manually to JadeTest. Check whether the content in your
> restored `JadeUAT` already matches prod (legacy) or test (updated). If it matches prod,
> run the update via the admin UI: Admin → Program → Download Page HTML field, or apply
> via TinyMCE in `/aea26/home?action=program`.

---

## Migration 025 — Update standardwelcometext for AEA 2026

Same note as migration 024 — applies to programid 1056 only.
Update via admin UI if needed: Admin → Program → Standard Welcome Text field.

---

## Migration 026 — Update adminwelcometext for AEA 2026

Same note as migration 024 — applies to programid 1056 only.
Update via admin UI if needed: Admin → Program → Admin Welcome Text field.

---

## One-time data fix — Lock entry prices for already-invoiced entries

Entries invoiced under Perl have NULL `costex`/`gst` on the Entry row. This locks them
to the category price at invoice time, preventing price drift if category costs change later.

```sql
-- Inspect: how many entries need locking?
SELECT COUNT(*) AS needs_locking
FROM Entry
INNER JOIN Category ON Entry.categoryid = Category.categoryid
WHERE Entry.invoiceid IS NOT NULL
  AND Entry.deleted = 0
  AND Entry.costex IS NULL;

-- Lock them
UPDATE Entry
SET Entry.costex = Category.costex,
    Entry.gst    = Category.gst
FROM Entry
INNER JOIN Category ON Entry.categoryid = Category.categoryid
WHERE Entry.invoiceid IS NOT NULL
  AND Entry.deleted = 0
  AND Entry.costex IS NULL;
```

---

## Post-migration verification

```sql
-- Spot-check key columns exist
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Program'          AND COLUMN_NAME IN ('slug','scorereadydefault','finalistreviewdefault','wildcarddecisiondefault','winnernominationdefault');
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'UserCredential'   AND COLUMN_NAME IN ('mustchangepassword','activated','activationtoken');
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Category'         AND COLUMN_NAME = 'adminonly';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'CategoryQuestionLink' AND COLUMN_NAME = 'orda';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Question'         AND COLUMN_NAME = 'captionlabel';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Response'         AND COLUMN_NAME = 'caption';
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'JudgingModel'     AND COLUMN_NAME = 'commentguidelines';

-- Confirm TopMenu tables are gone
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('TopMenu','TopMenuButton');
-- Should return 0 rows.

-- Confirm all programs have slugs
SELECT COUNT(*) AS missing_slug FROM Program WHERE slug IS NULL;
-- Should be 0.
```

---

## After migrations — start the Node app

1. Confirm `.env` has `DB_DATABASE=JadeUAT` and all other vars set (FILESTORE_ROOT, MAIL_HOST, ANTHROPIC_API_KEY, etc.)
2. Start the app and log in at `http://<server>/login`
3. Test the AEA2026 program at `http://<server>/aea26/login`
