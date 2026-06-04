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

## 009 — (reserved)

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

_(further migrations will be added as we go)_
