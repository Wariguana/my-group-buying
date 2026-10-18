-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "beforeAllocated" INTEGER,
ADD COLUMN     "beforeReserved" INTEGER,
ADD COLUMN     "checkoutId" UUID,
ALTER COLUMN "actorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Checkout" (
    "id" UUID NOT NULL,
    "customerAccountId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "customerName" VARCHAR(80) NOT NULL,
    "customerPhone" VARCHAR(20) NOT NULL,
    "delivery" JSONB NOT NULL,
    "bankSnapshot" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shippingAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutItem" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "fulfillmentGroupId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "groupTitle" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "shippingSnapshot" JSONB NOT NULL,

    CONSTRAINT "CheckoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentGroup" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "temperature" VARCHAR(16) NOT NULL,
    "compatibilityKey" TEXT NOT NULL,
    "rateSnapshot" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shippingAmount" INTEGER NOT NULL,
    "waitUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FulfillmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "method" VARCHAR(24) NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" VARCHAR(32) NOT NULL DEFAULT 'AWAITING_REPORT',
    "reportedAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedAmount" INTEGER NOT NULL DEFAULT 0,
    "anomalyReason" TEXT,
    "anomalyNote" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransferReport" (
    "paymentId" UUID NOT NULL,
    "lastFive" VARCHAR(5) NOT NULL,
    "screenshot" BYTEA NOT NULL,
    "mimeType" VARCHAR(20) NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,

    CONSTRAINT "BankTransferReport_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "BankReceipt" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "bankReference" VARCHAR(120) NOT NULL,
    "amount" INTEGER NOT NULL,
    "bankReceivedAt" TIMESTAMPTZ(3) NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID NOT NULL,
    "note" VARCHAR(500) NOT NULL,

    CONSTRAINT "BankReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbOrder" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(14) NOT NULL,
    "checkoutId" UUID NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PAID',
    "itemsSnapshot" JSONB NOT NULL,
    "deliverySnapshot" JSONB NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "shippingAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QbOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbNumberSequence" (
    "dateKey" VARCHAR(8) NOT NULL,
    "lastValue" INTEGER NOT NULL,

    CONSTRAINT "QbNumberSequence_pkey" PRIMARY KEY ("dateKey")
);

-- CreateTable
CREATE TABLE "CheckoutAudit" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "actorId" UUID,
    "event" VARCHAR(40) NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundObligation" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutOutbox" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "event" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(3),

    CONSTRAINT "CheckoutOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bankName" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankAccount" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "temperature" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "fee" INTEGER NOT NULL,
    "freeThreshold" INTEGER,
    "maxWeightGrams" INTEGER NOT NULL,
    "maxLengthMm" INTEGER NOT NULL,
    "maxWidthMm" INTEGER NOT NULL,
    "maxHeightMm" INTEGER NOT NULL,
    "capabilityEvidence" VARCHAR(500) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkout_status_expiresAt_idx" ON "Checkout"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Checkout_customerAccountId_createdAt_idx" ON "Checkout"("customerAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_customerAccountId_requestId_key" ON "Checkout"("customerAccountId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutItem_checkoutId_offerId_key" ON "CheckoutItem"("checkoutId", "offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutId_key" ON "Payment"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReceipt_requestId_key" ON "BankReceipt"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "BankReceipt_bankReference_key" ON "BankReceipt"("bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "QbOrder_orderNumber_key" ON "QbOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QbOrder_checkoutId_groupBuyId_key" ON "QbOrder"("checkoutId", "groupBuyId");

-- CreateIndex
CREATE INDEX "CheckoutAudit_checkoutId_createdAt_idx" ON "CheckoutAudit"("checkoutId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundObligation_checkoutId_reason_key" ON "RefundObligation"("checkoutId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutOutbox_checkoutId_event_key" ON "CheckoutOutbox"("checkoutId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_method_temperature_key" ON "ShippingRate"("method", "temperature");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutItem" ADD CONSTRAINT "CheckoutItem_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutItem" ADD CONSTRAINT "CheckoutItem_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutItem" ADD CONSTRAINT "CheckoutItem_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutItem" ADD CONSTRAINT "CheckoutItem_fulfillmentGroupId_fkey" FOREIGN KEY ("fulfillmentGroupId") REFERENCES "FulfillmentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentGroup" ADD CONSTRAINT "FulfillmentGroup_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransferReport" ADD CONSTRAINT "BankTransferReport_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReceipt" ADD CONSTRAINT "BankReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbOrder" ADD CONSTRAINT "QbOrder_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbOrder" ADD CONSTRAINT "QbOrder_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutAudit" ADD CONSTRAINT "CheckoutAudit_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutAudit" ADD CONSTRAINT "CheckoutAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundObligation" ADD CONSTRAINT "RefundObligation_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutOutbox" ADD CONSTRAINT "CheckoutOutbox_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_amounts" CHECK ("subtotal" >= 0 AND "shippingAmount" >= 0 AND "totalAmount" = "subtotal"::bigint + "shippingAmount");
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_status" CHECK ("status" IN ('AWAITING_PAYMENT','REPORTED','ANOMALY','EXPIRED','RECEIVED','FINALIZED','REFUND_REQUIRED'));
ALTER TABLE "CheckoutItem" ADD CONSTRAINT "CheckoutItem_amounts" CHECK ("unitPrice" >= 0 AND "quantity" BETWEEN 1 AND 9999 AND "discount" = 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts" CHECK ("confirmedAmount" >= 0);
ALTER TABLE "BankReceipt" ADD CONSTRAINT "BankReceipt_amount" CHECK ("amount" > 0);
ALTER TABLE "BankReceipt" ADD CONSTRAINT "BankReceipt_actor" FOREIGN KEY ("actorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "BankTransferReport" ADD CONSTRAINT "BankTransferReport_content" CHECK ("lastFive" ~ '^[0-9]{5}$' AND octet_length("screenshot") BETWEEN 1 AND 5242880 AND "mimeType" IN ('image/png','image/jpeg'));
ALTER TABLE "QbOrder" ADD CONSTRAINT "QbOrder_number" CHECK ("orderNumber" ~ '^QB[0-9]{12}$');
ALTER TABLE "QbOrder" ADD CONSTRAINT "QbOrder_amounts" CHECK ("totalAmount" >= 0 AND "shippingAmount" >= 0 AND "paidAmount" = "totalAmount");
ALTER TABLE "QbNumberSequence" ADD CONSTRAINT "QbNumberSequence_range" CHECK ("dateKey" ~ '^[0-9]{8}$' AND "lastValue" BETWEEN 1 AND 9999);
ALTER TABLE "RefundObligation" ADD CONSTRAINT "RefundObligation_amount" CHECK ("amount" > 0);
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_limits" CHECK ("fee" >= 0 AND ("freeThreshold" IS NULL OR "freeThreshold" >= 0) AND "maxWeightGrams" > 0 AND "maxLengthMm" > 0 AND "maxWidthMm" > 0 AND "maxHeightMm" > 0 AND "method" IN ('SEVEN_ELEVEN','FAMILY_MART','HOME_DELIVERY') AND "temperature" IN ('AMBIENT','CHILLED','FROZEN'));
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_checkout_event" CHECK ("actorId" IS NOT NULL OR "checkoutId" IS NOT NULL);
ALTER TABLE "CheckoutItem" ADD CONSTRAINT "CheckoutItem_offer" FOREIGN KEY ("offerId") REFERENCES "GroupBuySku"(id) ON DELETE RESTRICT;
CREATE TRIGGER "CheckoutAudit_append_only" BEFORE UPDATE OR DELETE ON "CheckoutAudit" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
CREATE TRIGGER "BankReceipt_append_only" BEFORE UPDATE OR DELETE ON "BankReceipt" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
CREATE TRIGGER "CheckoutItem_immutable" BEFORE UPDATE OR DELETE ON "CheckoutItem" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
CREATE TRIGGER "FulfillmentGroup_immutable" BEFORE UPDATE OR DELETE ON "FulfillmentGroup" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
