-- Migration 033: Add faviconfile column to Program
-- Stores the filename of a program-specific favicon uploaded by the admin.
-- NULL means use the JADE platform default (/favicon.svg).

ALTER TABLE Program ADD faviconfile NVARCHAR(255) NULL;
