-- Migration 036: Drop personal profile columns from User table
--
-- Run ONLY after all application code has been updated to read/write
-- profile data from UserCredential instead of User.
-- Verify the app is working correctly on UAT before running this.
--
-- Also drops the legacy email/password/question/answer columns from User
-- (these were the pre-UserCredential auth fields, now orphaned).

ALTER TABLE [User] DROP COLUMN firstname;
ALTER TABLE [User] DROP COLUMN lastname;
ALTER TABLE [User] DROP COLUMN organisation;
ALTER TABLE [User] DROP COLUMN telephone;
ALTER TABLE [User] DROP COLUMN mobile;
ALTER TABLE [User] DROP COLUMN fax;

-- Legacy auth columns (superseded by UserCredential)
ALTER TABLE [User] DROP COLUMN email;
ALTER TABLE [User] DROP COLUMN password;
ALTER TABLE [User] DROP COLUMN question;
ALTER TABLE [User] DROP COLUMN answer;
