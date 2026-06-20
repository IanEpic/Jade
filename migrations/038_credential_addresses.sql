-- 038: Move postal/street address references to UserCredential
-- Postal address was per-program on User; now shared per-person on UserCredential.
-- Street address was never on User (only on Entrant); adding to UserCredential for profile use.
--
-- Migration 039 (deferred): ALTER TABLE [User] DROP COLUMN postaladdressid

ALTER TABLE UserCredential ADD postaladdressid INT NULL;
ALTER TABLE UserCredential ADD streetaddressid INT NULL;
GO

-- Backfill: for each credential pick the most recently-created User row that has a postaladdressid
UPDATE uc
SET uc.postaladdressid = sub.postaladdressid
FROM UserCredential uc
INNER JOIN (
    SELECT credentialid, postaladdressid,
           ROW_NUMBER() OVER (PARTITION BY credentialid ORDER BY userid DESC) AS rn
    FROM [User]
    WHERE postaladdressid IS NOT NULL
) sub ON sub.credentialid = uc.credentialid AND sub.rn = 1;

-- streetaddressid has no historical source on User; will populate as users save their profiles.
