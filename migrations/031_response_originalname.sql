-- Migration 031: Add originalname column to Response
-- Stores the user-facing filename (e.g. "my testimonial.doc") separately from
-- the random storage filename in value (e.g. "a3f9b2c1.doc").

ALTER TABLE Response ADD originalname NVARCHAR(500) NULL;
