-- Existing group buys and orders retain the fixed self-pickup behavior.
CREATE TYPE "FulfillmentMethod" AS ENUM ('SELF_PICKUP', 'SEVEN_ELEVEN');

ALTER TABLE "GroupBuy"
  ADD COLUMN "allowsSelfPickup" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "allowsSevenEleven" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order"
  ADD COLUMN "fulfillmentMethod" "FulfillmentMethod" NOT NULL DEFAULT 'SELF_PICKUP',
  ADD COLUMN "sevenElevenStoreId" TEXT,
  ADD COLUMN "sevenElevenStoreName" TEXT,
  ADD COLUMN "sevenElevenStoreAddress" TEXT,
  ALTER COLUMN "groupBuyPickupId" DROP NOT NULL,
  ALTER COLUMN "pickupName" DROP NOT NULL,
  ALTER COLUMN "pickupAddress" DROP NOT NULL;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_fulfillment_snapshot_check" CHECK (
    (
      "fulfillmentMethod" = 'SELF_PICKUP'
      AND "groupBuyPickupId" IS NOT NULL
      AND "pickupName" IS NOT NULL
      AND "pickupAddress" IS NOT NULL
      AND "sevenElevenStoreId" IS NULL
      AND "sevenElevenStoreName" IS NULL
      AND "sevenElevenStoreAddress" IS NULL
    ) OR (
      "fulfillmentMethod" = 'SEVEN_ELEVEN'
      AND "groupBuyPickupId" IS NULL
      AND "pickupName" IS NULL
      AND "pickupAddress" IS NULL
      AND "pickupStartAt" IS NULL
      AND "pickupEndAt" IS NULL
      AND "sevenElevenStoreId" IS NOT NULL
      AND "sevenElevenStoreName" IS NOT NULL
      AND "sevenElevenStoreAddress" IS NOT NULL
    )
  );

CREATE TABLE "SevenElevenStoreSelection" (
  "id" UUID NOT NULL,
  "stateHash" TEXT NOT NULL,
  "merchantTradeNo" TEXT NOT NULL,
  "selectionTokenHash" TEXT,
  "browserBindingHash" TEXT,
  "groupBuyId" UUID NOT NULL,
  "orderId" UUID,
  "storeId" TEXT,
  "storeName" TEXT,
  "storeAddress" TEXT,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SevenElevenStoreSelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SevenElevenStoreSelection_stateHash_key" ON "SevenElevenStoreSelection"("stateHash");
CREATE UNIQUE INDEX "SevenElevenStoreSelection_merchantTradeNo_key" ON "SevenElevenStoreSelection"("merchantTradeNo");
CREATE UNIQUE INDEX "SevenElevenStoreSelection_selectionTokenHash_key" ON "SevenElevenStoreSelection"("selectionTokenHash");
CREATE UNIQUE INDEX "SevenElevenStoreSelection_orderId_key" ON "SevenElevenStoreSelection"("orderId");
CREATE INDEX "SevenElevenStoreSelection_groupBuyId_expiresAt_idx" ON "SevenElevenStoreSelection"("groupBuyId", "expiresAt");
CREATE INDEX "SevenElevenStoreSelection_expiresAt_idx" ON "SevenElevenStoreSelection"("expiresAt");

ALTER TABLE "SevenElevenStoreSelection"
  ADD CONSTRAINT "SevenElevenStoreSelection_groupBuyId_fkey"
  FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SevenElevenStoreSelection"
  ADD CONSTRAINT "SevenElevenStoreSelection_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SevenElevenStoreSelection"
  ADD CONSTRAINT "SevenElevenStoreSelection_state_check" CHECK (
    (
      "selectionTokenHash" IS NULL
      AND "browserBindingHash" IS NULL
      AND "storeId" IS NULL
      AND "storeName" IS NULL
      AND "storeAddress" IS NULL
      AND "consumedAt" IS NULL
      AND "orderId" IS NULL
    ) OR (
      "selectionTokenHash" IS NOT NULL
      AND "browserBindingHash" IS NOT NULL
      AND "storeId" IS NOT NULL
      AND "storeName" IS NOT NULL
      AND "storeAddress" IS NOT NULL
      AND (("consumedAt" IS NULL AND "orderId" IS NULL) OR ("consumedAt" IS NOT NULL AND "orderId" IS NOT NULL))
    )
  );
