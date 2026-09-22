-- Authenticated ownership is assigned only to new orders created from a
-- verified CustomerSession. Existing orders intentionally remain unowned.
ALTER TABLE "Order" ADD COLUMN "customerAccountId" UUID;

CREATE INDEX "Order_customerAccountId_createdAt_idx"
ON "Order"("customerAccountId", "createdAt");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_customerAccountId_fkey"
FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
