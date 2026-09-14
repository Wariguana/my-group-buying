-- Existing orders intentionally remain without customer self-service credentials.
ALTER TABLE "Order" ADD COLUMN "accessTokenHash" TEXT;

CREATE UNIQUE INDEX "Order_accessTokenHash_key" ON "Order"("accessTokenHash");
