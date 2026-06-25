-- Migration 053: Seed the 1056 early-bird discount (PROD has none; dev was created via UI).
-- Early-bird is applied at PAYMENT time based on the payment date; this discount lets the
-- admin record pre-cutoff payments at the discounted amount. Idempotent — skips if a
-- 1056 early-bird discount already exists. Admins can adjust values via Admin → Setup → Discounts.

IF NOT EXISTS (SELECT 1 FROM ProgramDiscount WHERE programid = 1056 AND type = 'earlybird')
BEGIN
    INSERT INTO ProgramDiscount (programid, name, type, amount, amounttype, validfrom, validto, active)
    VALUES (1056, 'Early Starters Discount', 'earlybird', 80.30, 'dollars', '2026-01-01', '2026-06-01', 1);
END
