-- Migration 035: Move personal profile fields from User to UserCredential
-- and add superadmin flag to UserCredential.
--
-- ADDITIVE ONLY — does not drop columns from User yet.
-- Column drops happen in migration 036 after all code is updated.
--
-- Run on UAT first, verify, then run on PROD before go-live.
-- Rollback: tag pre-user-migration is the safe restore point.

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Add profile columns to UserCredential
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE UserCredential ADD
    firstname    NVARCHAR(100) NULL,
    lastname     NVARCHAR(100) NULL,
    organisation NVARCHAR(200) NULL,
    telephone    NVARCHAR(50)  NULL,
    mobile       NVARCHAR(50)  NULL,
    fax          NVARCHAR(50)  NULL,
    superadmin   BIT           NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Backfill UserCredential profile from User
--
-- A credential may have many User rows (one per program).
-- Strategy: prefer the row with the most complete profile (firstname not null),
-- breaking ties by taking the most recent program (highest programid).
-- ─────────────────────────────────────────────────────────────────────────────

WITH RankedUsers AS (
    SELECT
        credentialid,
        firstname, lastname, organisation, telephone, mobile, fax,
        ROW_NUMBER() OVER (
            PARTITION BY credentialid
            ORDER BY
                CASE WHEN firstname IS NOT NULL AND firstname <> '' THEN 0 ELSE 1 END,
                programid DESC
        ) AS rn
    FROM [User]
    WHERE credentialid IS NOT NULL
)
UPDATE uc
SET
    uc.firstname    = ru.firstname,
    uc.lastname     = ru.lastname,
    uc.organisation = ru.organisation,
    uc.telephone    = ru.telephone,
    uc.mobile       = ru.mobile,
    uc.fax          = ru.fax
FROM UserCredential uc
INNER JOIN RankedUsers ru ON ru.credentialid = uc.credentialid AND ru.rn = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries — run these after the migration to sanity check
-- ─────────────────────────────────────────────────────────────────────────────

-- How many credentials now have a firstname?
-- SELECT COUNT(*) FROM UserCredential WHERE firstname IS NOT NULL;

-- Spot check a known user:
-- SELECT uc.credentialid, uc.email, uc.firstname, uc.lastname, uc.organisation
-- FROM UserCredential uc WHERE uc.email = 'ian.steigrad@gmail.com';

-- How many credentials are missing a firstname (anonymous/incomplete registrations)?
-- SELECT COUNT(*) FROM UserCredential WHERE firstname IS NULL;
