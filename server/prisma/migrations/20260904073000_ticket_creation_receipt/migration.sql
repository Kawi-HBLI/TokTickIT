-- Additive: existing tickets retain NULL receipts; published migrations are unchanged.
ALTER TABLE "Ticket" ADD COLUMN "creationFingerprint" TEXT,
                     ADD COLUMN "creationResponse" JSONB;
-- Rollback: stop receipt-aware writers, then a NEW migration may drop these columns.
-- This discards retry receipts; never rollback while serving traffic.
