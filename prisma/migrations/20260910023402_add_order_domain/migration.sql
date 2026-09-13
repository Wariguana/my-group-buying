-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "publicCode" TEXT NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "groupBuyPickupId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "pickupName" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "pickupStartAt" TIMESTAMPTZ(3),
    "pickupEndAt" TIMESTAMPTZ(3),
    "totalAmount" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "groupBuyItemId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicCode_key" ON "Order"("publicCode");

-- CreateIndex
CREATE INDEX "Order_groupBuyId_createdAt_idx" ON "Order"("groupBuyId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_groupBuyId_status_idx" ON "Order"("customerId", "groupBuyId", "status");

-- CreateIndex
CREATE INDEX "Order_groupBuyPickupId_idx" ON "Order"("groupBuyPickupId");

-- CreateIndex
CREATE INDEX "OrderItem_groupBuyItemId_orderId_idx" ON "OrderItem"("groupBuyItemId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_groupBuyItemId_key" ON "OrderItem"("orderId", "groupBuyItemId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_groupBuyPickupId_fkey" FOREIGN KEY ("groupBuyPickupId") REFERENCES "GroupBuyPickup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_groupBuyItemId_fkey" FOREIGN KEY ("groupBuyItemId") REFERENCES "GroupBuyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
