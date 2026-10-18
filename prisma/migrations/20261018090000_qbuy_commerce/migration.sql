BEGIN;

-- Additive expansion only: no legacy stock, UUIDs, or transaction snapshots change.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "skuInventoryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProductSku" ADD COLUMN     "displayName" VARCHAR(160),
ADD COLUMN     "heightMm" INTEGER,
ADD COLUMN     "lengthMm" INTEGER,
ADD COLUMN     "shippingMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shippingNote" VARCHAR(500),
ADD COLUMN     "temperature" VARCHAR(16) NOT NULL DEFAULT 'AMBIENT',
ADD COLUMN     "weightGrams" INTEGER,
ADD COLUMN     "widthMm" INTEGER;

-- AlterTable
ALTER TABLE "GroupBuy" ADD COLUMN     "allowsCombinedShipping" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "categoryId" UUID,
ADD COLUMN     "featuredSort" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBuySku" (
    "id" UUID NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "purchaseLimit" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GroupBuySku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuInventory" (
    "skuId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SkuInventory_pkey" PRIMARY KEY ("skuId")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "skuId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "beforeOnHand" INTEGER NOT NULL,
    "afterOnHand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL,
    "allocated" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "GroupBuySku_skuId_idx" ON "GroupBuySku"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuySku_groupBuyId_skuId_key" ON "GroupBuySku"("groupBuyId", "skuId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_requestId_key" ON "InventoryMovement"("requestId");

-- CreateIndex
CREATE INDEX "InventoryMovement_skuId_createdAt_idx" ON "InventoryMovement"("skuId", "createdAt");

-- AddForeignKey
ALTER TABLE "GroupBuy" ADD CONSTRAINT "GroupBuy_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuySku" ADD CONSTRAINT "GroupBuySku_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuySku" ADD CONSTRAINT "GroupBuySku_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuInventory" ADD CONSTRAINT "SkuInventory_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "ProductSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GroupBuySku" ADD CONSTRAINT "GroupBuySku_price_limit_check" CHECK ("salePrice" BETWEEN 0 AND 10000000 AND ("purchaseLimit" IS NULL OR "purchaseLimit" BETWEEN 1 AND 9999));
ALTER TABLE "SkuInventory" ADD CONSTRAINT "SkuInventory_balance_check" CHECK ("onHand" BETWEEN 0 AND 10000000 AND "reserved" >= 0 AND "allocated" >= 0 AND "reserved"::bigint + "allocated"::bigint <= "onHand" AND "version" > 0);
ALTER TABLE "ProductSku" ADD CONSTRAINT "ProductSku_shipping_check" CHECK (
  "temperature" IN ('AMBIENT','CHILLED','FROZEN') AND "shippingMethods" <@ ARRAY['SEVEN_ELEVEN','FAMILY_MART','HOME_DELIVERY']::text[]
  AND ("weightGrams" IS NULL OR "weightGrams" >= 0) AND ("lengthMm" IS NULL OR "lengthMm" >= 0)
  AND ("widthMm" IS NULL OR "widthMm" >= 0) AND ("heightMm" IS NULL OR "heightMm" >= 0));

-- Serialize authority switching against ALL legacy order creation, including SQL.
CREATE FUNCTION "guard_legacy_inventory_authority"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE managed boolean;
BEGIN
  SELECT p."skuInventoryEnabled" INTO managed FROM "Product" p JOIN "GroupBuyItem" i ON i."productId" = p.id
    WHERE i.id = NEW."groupBuyItemId" FOR UPDATE OF p;
  IF managed THEN RAISE EXCEPTION 'Product uses global SKU inventory; legacy purchasing is disabled' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "OrderItem_inventory_authority" BEFORE INSERT OR UPDATE OF "groupBuyItemId" ON "OrderItem"
  FOR EACH ROW EXECUTE FUNCTION "guard_legacy_inventory_authority"();

CREATE FUNCTION "guard_inventory_switch"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."skuInventoryEnabled" AND NOT NEW."skuInventoryEnabled" THEN
    RAISE EXCEPTION 'Inventory authority cannot revert to legacy';
  END IF;
  IF NOT OLD."skuInventoryEnabled" AND NEW."skuInventoryEnabled" AND EXISTS (
    SELECT 1 FROM "OrderItem" oi JOIN "GroupBuyItem" i ON i.id = oi."groupBuyItemId" JOIN "Order" o ON o.id = oi."orderId"
    WHERE i."productId" = NEW.id AND o.status = 'PLACED' AND o."pickedUpAt" IS NULL
  ) THEN RAISE EXCEPTION 'Unfulfilled legacy orders require reconciliation before switching'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "Product_inventory_switch" BEFORE UPDATE OF "skuInventoryEnabled" ON "Product"
  FOR EACH ROW EXECUTE FUNCTION "guard_inventory_switch"();

CREATE FUNCTION "protect_inventory_ledger"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory ledger is append-only'; END; $$;
CREATE TRIGGER "InventoryMovement_append_only" BEFORE UPDATE OR DELETE ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION "protect_inventory_ledger"();

CREATE FUNCTION "protect_referenced_sku_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."productId" <> OLD."productId" OR NEW."combinationKey" <> OLD."combinationKey" THEN
    IF EXISTS (SELECT 1 FROM "GroupBuySku" WHERE "skuId" = OLD.id) OR EXISTS (SELECT 1 FROM "SkuInventory" WHERE "skuId" = OLD.id) THEN
      RAISE EXCEPTION 'Referenced SKU identity is immutable';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "ProductSku_history_identity" BEFORE UPDATE ON "ProductSku"
  FOR EACH ROW EXECUTE FUNCTION "protect_referenced_sku_identity"();

COMMIT;
