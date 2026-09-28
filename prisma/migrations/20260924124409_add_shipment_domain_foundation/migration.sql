-- CreateEnum
CREATE TYPE "ShipmentProvider" AS ENUM ('SEVEN_ELEVEN_MYSHIP');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shipmentRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order" ADD CONSTRAINT "Order_shipment_required_method_check"
  CHECK (NOT "shipmentRequired" OR "fulfillmentMethod" = 'SEVEN_ELEVEN');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" "ShipmentProvider" NOT NULL,
    "trackingNumber" VARCHAR(128) NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "sevenElevenStoreId" TEXT NOT NULL,
    "sevenElevenStoreName" TEXT NOT NULL,
    "sevenElevenStoreAddress" TEXT NOT NULL,
    "shippedAt" TIMESTAMPTZ(3),
    "arrivedAt" TIMESTAMPTZ(3),
    "returnedAt" TIMESTAMPTZ(3),
    "voidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shipment_orderId_createdAt_idx" ON "Shipment"("orderId", "createdAt");

CREATE UNIQUE INDEX "Shipment_one_open_per_order_key" ON "Shipment"("orderId")
  WHERE "returnedAt" IS NULL AND "voidedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_provider_trackingNumber_key" ON "Shipment"("provider", "trackingNumber");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_arrived_after_shipped_check"
    CHECK ("arrivedAt" IS NULL OR ("shippedAt" IS NOT NULL AND "arrivedAt" >= "shippedAt")),
  ADD CONSTRAINT "Shipment_returned_after_shipped_check"
    CHECK ("returnedAt" IS NULL OR ("shippedAt" IS NOT NULL AND "returnedAt" >= "shippedAt")),
  ADD CONSTRAINT "Shipment_voided_before_shipped_check"
    CHECK ("voidedAt" IS NULL OR "shippedAt" IS NULL),
  ADD CONSTRAINT "Shipment_terminal_exclusive_check"
    CHECK (NOT ("returnedAt" IS NOT NULL AND "voidedAt" IS NOT NULL)),
  ADD CONSTRAINT "Shipment_returned_after_arrived_check"
    CHECK ("arrivedAt" IS NULL OR "returnedAt" IS NULL OR "returnedAt" >= "arrivedAt"),
  ADD CONSTRAINT "Shipment_trackingNumber_trimmed_check"
    CHECK ("trackingNumber" = btrim("trackingNumber") AND char_length("trackingNumber") BETWEEN 1 AND 128),
  ADD CONSTRAINT "Shipment_recipientName_nonblank_check" CHECK (char_length(btrim("recipientName")) > 0),
  ADD CONSTRAINT "Shipment_recipientPhone_nonblank_check" CHECK (char_length(btrim("recipientPhone")) > 0),
  ADD CONSTRAINT "Shipment_sevenElevenStoreId_nonblank_check" CHECK (char_length(btrim("sevenElevenStoreId")) > 0),
  ADD CONSTRAINT "Shipment_sevenElevenStoreName_nonblank_check" CHECK (char_length(btrim("sevenElevenStoreName")) > 0),
  ADD CONSTRAINT "Shipment_sevenElevenStoreAddress_nonblank_check" CHECK (char_length(btrim("sevenElevenStoreAddress")) > 0);
