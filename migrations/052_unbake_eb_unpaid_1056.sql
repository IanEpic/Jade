-- Migration 052: Stop baking the early-bird discount into outstanding invoices
-- Early-bird is now applied at PAYMENT time (based on payment date), not baked into the
-- invoice at creation. Clear the erroneously-baked ebdiscount from 1056 invoices that
-- still have unaccepted entries (the ones yet to be processed) so they show full owing.
-- Already-processed invoices are left as-is.

UPDATE i SET i.ebdiscount = 0
FROM Invoice i
WHERE i.userid IN (SELECT userid FROM [User] WHERE programid = 1056)
  AND i.deleted = 0
  AND ISNULL(i.ebdiscount, 0) <> 0
  AND EXISTS (SELECT 1 FROM Entry e WHERE e.invoiceid = i.invoiceid AND e.deleted = 0
                AND (e.entryaccepted IS NULL OR e.entryaccepted = 0));
