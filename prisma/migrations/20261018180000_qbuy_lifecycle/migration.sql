-- DropIndex
DROP INDEX "CheckoutOutbox_checkoutId_event_key";

-- DropIndex
DROP INDEX "RefundObligation_checkoutId_reason_key";

-- AlterTable
ALTER TABLE "CheckoutOutbox" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "audience" VARCHAR(16) NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "lastError" VARCHAR(200),
ADD COLUMN     "leaseUntil" TIMESTAMPTZ(3),
ADD COLUMN     "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "RefundObligation" ADD COLUMN     "bankReference" VARCHAR(120),
ADD COLUMN     "cancellationId" UUID,
ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "processedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "customerAccountId" UUID NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),
    "actorId" UUID,
    "explanation" VARCHAR(500),
    "quote" JSONB NOT NULL,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentAdjustment" (
    "id" UUID NOT NULL,
    "fulfillmentGroupId" UUID NOT NULL,
    "cancellationId" UUID NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shippingAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfillmentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbShipment" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "fulfillmentGroupId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "previousShipmentId" UUID,
    "status" VARCHAR(24) NOT NULL DEFAULT 'CREATED',
    "method" VARCHAR(20) NOT NULL,
    "delivery" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "trackingNumber" VARCHAR(128) NOT NULL,
    "evidence" VARCHAR(500) NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "QbShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbShipmentEvent" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "evidence" VARCHAR(500) NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QbShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbReturnCase" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
    "inspection" JSONB,
    "responsibility" VARCHAR(24),
    "method" VARCHAR(20),
    "delivery" JSONB,
    "fee" INTEGER,
    "paidAt" TIMESTAMPTZ(3),
    "bankReference" VARCHAR(120),
    "actorId" UUID NOT NULL,
    "evidence" VARCHAR(500) NOT NULL,

    CONSTRAINT "QbReturnCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineRecipient" (
    "id" UUID NOT NULL,
    "customerAccountId" UUID,
    "adminId" UUID,
    "messagingUserId" VARCHAR(64) NOT NULL,
    "providerId" VARCHAR(100) NOT NULL,
    "consentAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "evidence" VARCHAR(500) NOT NULL,

    CONSTRAINT "LineRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "outboxId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "retryKey" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRequest_requestId_key" ON "CancellationRequest"("requestId");

-- CreateIndex
CREATE INDEX "CancellationRequest_checkoutId_status_idx" ON "CancellationRequest"("checkoutId", "status");

-- CreateIndex
CREATE INDEX "CancellationRequest_status_submittedAt_idx" ON "CancellationRequest"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentAdjustment_fulfillmentGroupId_cancellationId_key" ON "FulfillmentAdjustment"("fulfillmentGroupId", "cancellationId");

-- CreateIndex
CREATE UNIQUE INDEX "QbShipment_requestId_key" ON "QbShipment"("requestId");

-- CreateIndex
-- Multiple voided resend attempts may reference the same returned shipment.

-- CreateIndex
CREATE UNIQUE INDEX "QbShipment_trackingNumber_key" ON "QbShipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "QbShipment_checkoutId_createdAt_idx" ON "QbShipment"("checkoutId", "createdAt");

-- CreateIndex
CREATE INDEX "QbShipment_fulfillmentGroupId_status_idx" ON "QbShipment"("fulfillmentGroupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QbShipmentEvent_requestId_key" ON "QbShipmentEvent"("requestId");

-- CreateIndex
CREATE INDEX "QbShipmentEvent_shipmentId_createdAt_idx" ON "QbShipmentEvent"("shipmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QbReturnCase_shipmentId_key" ON "QbReturnCase"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "QbReturnCase_bankReference_key" ON "QbReturnCase"("bankReference");

-- CreateIndex
CREATE INDEX "QbReturnCase_status_deadline_idx" ON "QbReturnCase"("status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "LineRecipient_customerAccountId_key" ON "LineRecipient"("customerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "LineRecipient_adminId_key" ON "LineRecipient"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "LineRecipient_messagingUserId_key" ON "LineRecipient"("messagingUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_retryKey_key" ON "NotificationDelivery"("retryKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_outboxId_recipientId_key" ON "NotificationDelivery"("outboxId", "recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutOutbox_eventKey_key" ON "CheckoutOutbox"("eventKey");

-- CreateIndex
CREATE INDEX "CheckoutOutbox_status_nextAttemptAt_idx" ON "CheckoutOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "CheckoutOutbox_checkoutId_event_idx" ON "CheckoutOutbox"("checkoutId", "event");

-- CreateIndex
CREATE UNIQUE INDEX "RefundObligation_eventKey_key" ON "RefundObligation"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "RefundObligation_cancellationId_key" ON "RefundObligation"("cancellationId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundObligation_bankReference_key" ON "RefundObligation"("bankReference");

-- CreateIndex
CREATE INDEX "RefundObligation_checkoutId_reason_idx" ON "RefundObligation"("checkoutId", "reason");

-- AddForeignKey
ALTER TABLE "RefundObligation" ADD CONSTRAINT "RefundObligation_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "CancellationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "QbOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentAdjustment" ADD CONSTRAINT "FulfillmentAdjustment_cancellationId_fkey" FOREIGN KEY ("cancellationId") REFERENCES "CancellationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentAdjustment" ADD CONSTRAINT "FulfillmentAdjustment_fulfillmentGroupId_fkey" FOREIGN KEY ("fulfillmentGroupId") REFERENCES "FulfillmentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbShipment" ADD CONSTRAINT "QbShipment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbShipment" ADD CONSTRAINT "QbShipment_fulfillmentGroupId_fkey" FOREIGN KEY ("fulfillmentGroupId") REFERENCES "FulfillmentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbShipment" ADD CONSTRAINT "QbShipment_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbShipmentEvent" ADD CONSTRAINT "QbShipmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbShipmentEvent" ADD CONSTRAINT "QbShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "QbShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbReturnCase" ADD CONSTRAINT "QbReturnCase_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbReturnCase" ADD CONSTRAINT "QbReturnCase_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QbReturnCase" ADD CONSTRAINT "QbReturnCase_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "QbShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineRecipient" ADD CONSTRAINT "LineRecipient_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineRecipient" ADD CONSTRAINT "LineRecipient_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "LineRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "CheckoutOutbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Preserve the existing obligations/events under stable identities.
UPDATE "RefundObligation" SET "eventKey" = 'legacy:' || "id"::text WHERE "eventKey" IS NULL;
UPDATE "CheckoutOutbox" SET "eventKey" = 'legacy:' || "id"::text WHERE "eventKey" IS NULL;
CREATE UNIQUE INDEX "CancellationRequest_one_pending" ON "CancellationRequest" ("orderId") WHERE status IN ('PENDING','REVIEW_REQUIRED');
CREATE UNIQUE INDEX "QbShipment_one_active" ON "QbShipment" ("fulfillmentGroupId") WHERE status NOT IN ('VOIDED','RETURNED');
ALTER TABLE "QbShipment" ADD CONSTRAINT "QbShipment_previous" FOREIGN KEY ("previousShipmentId") REFERENCES "QbShipment"(id) ON DELETE RESTRICT;
ALTER TABLE "QbReturnCase" ADD CONSTRAINT "QbReturnCase_fee" CHECK (fee IS NULL OR fee >= 0);
ALTER TABLE "LineRecipient" ADD CONSTRAINT "LineRecipient_owner" CHECK (("customerAccountId" IS NULL) <> ("adminId" IS NULL));
CREATE TRIGGER "FulfillmentAdjustment_append_only" BEFORE UPDATE OR DELETE ON "FulfillmentAdjustment" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
CREATE TRIGGER "QbShipmentEvent_append_only" BEFORE UPDATE OR DELETE ON "QbShipmentEvent" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
-- Never ship earlier after a deadline was shortened; record every edit.
CREATE TABLE "GroupBuyDeadlineHistory" (id BIGSERIAL PRIMARY KEY, "groupBuyId" UUID NOT NULL REFERENCES "GroupBuy"(id), "oldEndAt" TIMESTAMPTZ(3) NOT NULL, "newEndAt" TIMESTAMPTZ(3) NOT NULL, "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now());
CREATE FUNCTION "record_group_deadline"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."endAt" IS DISTINCT FROM OLD."endAt" AND EXISTS (SELECT 1 FROM "CheckoutItem" WHERE "groupBuyId"=OLD.id) THEN INSERT INTO "GroupBuyDeadlineHistory" ("groupBuyId","oldEndAt","newEndAt") VALUES (OLD.id,OLD."endAt",NEW."endAt"); END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER "GroupBuy_deadline_history" AFTER UPDATE OF "endAt" ON "GroupBuy" FOR EACH ROW EXECUTE FUNCTION "record_group_deadline"();
CREATE TRIGGER "GroupBuyDeadlineHistory_append_only" BEFORE UPDATE OR DELETE ON "GroupBuyDeadlineHistory" FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();
-- Database-level retention of financial and logistics snapshots.
CREATE FUNCTION "protect_qb_shipment_snapshot"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'QB shipment history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-'status'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updatedAt') THEN RAISE EXCEPTION 'QB shipment snapshot is immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER "QbShipment_snapshot" BEFORE UPDATE OR DELETE ON "QbShipment" FOR EACH ROW EXECUTE FUNCTION "protect_qb_shipment_snapshot"();
CREATE FUNCTION "protect_qb_refund"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Refund obligations cannot be deleted'; END IF;
 IF OLD.status='REFUNDED' OR (to_jsonb(NEW)-'status'-'processedAt'-'bankReference') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'processedAt'-'bankReference') THEN RAISE EXCEPTION 'Refund obligation is immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER "RefundObligation_preserve" BEFORE UPDATE OR DELETE ON "RefundObligation" FOR EACH ROW EXECUTE FUNCTION "protect_qb_refund"();
CREATE FUNCTION "protect_cancellation_history"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cancellation history cannot be deleted'; END IF;
 IF OLD.status NOT IN ('PENDING','REVIEW_REQUIRED') OR (to_jsonb(NEW)-'status'-'reviewedAt'-'actorId'-'explanation'-'quote') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'reviewedAt'-'actorId'-'explanation'-'quote') THEN RAISE EXCEPTION 'Cancellation history is immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER "CancellationRequest_preserve" BEFORE UPDATE OR DELETE ON "CancellationRequest" FOR EACH ROW EXECUTE FUNCTION "protect_cancellation_history"();
CREATE FUNCTION "protect_notification_payload"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Notification history cannot be deleted'; END IF;
 IF NEW.payload IS DISTINCT FROM OLD.payload OR NEW."checkoutId" IS DISTINCT FROM OLD."checkoutId" OR NEW.event IS DISTINCT FROM OLD.event OR NEW."eventKey" IS DISTINCT FROM OLD."eventKey" OR NEW.audience IS DISTINCT FROM OLD.audience THEN RAISE EXCEPTION 'Notification identity is immutable'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER "CheckoutOutbox_payload" BEFORE UPDATE OR DELETE ON "CheckoutOutbox" FOR EACH ROW EXECUTE FUNCTION "protect_notification_payload"();
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_status" CHECK (status IN ('PENDING','REVIEW_REQUIRED','APPROVED','REJECTED','WITHDRAWN'));
ALTER TABLE "QbShipment" ADD CONSTRAINT "QbShipment_status" CHECK (status IN ('CREATED','SHIPPED','IN_TRANSIT','READY','DELIVERED','COMPLETED','RETURNED','VOIDED'));
ALTER TABLE "FulfillmentAdjustment" ADD CONSTRAINT "FulfillmentAdjustment_amounts" CHECK (subtotal>=0 AND "shippingAmount">=0);
ALTER TABLE "LineRecipient" ADD COLUMN "verifiedById" UUID, ADD COLUMN "disabledById" UUID, ADD COLUMN "disabledAt" TIMESTAMPTZ(3), ADD COLUMN "disabledReason" VARCHAR(500);
ALTER TABLE "LineRecipient" ADD CONSTRAINT "LineRecipient_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LineRecipient" ADD CONSTRAINT "LineRecipient_disabledById_fkey" FOREIGN KEY ("disabledById") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
