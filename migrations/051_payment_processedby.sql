-- Migration 051: Track which admin recorded a payment
-- Admin "Receive Payment" records the payment under the ENTRANT's userid (so it shows
-- in their My Payments), but we also want to know which admin processed it.

IF COL_LENGTH('dbo.Payment', 'processedby') IS NULL
    ALTER TABLE [dbo].[Payment] ADD processedby INT NULL;
