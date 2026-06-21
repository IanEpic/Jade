-- 039: Drop postaladdressid from User table
-- Address is now on UserCredential (migration 038). FK and column no longer needed on User.

ALTER TABLE [User] DROP CONSTRAINT FK_User_Address;
ALTER TABLE [User] DROP COLUMN postaladdressid;
