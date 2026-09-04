-- CreateEnum
CREATE TYPE "GroupBuyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "lineContact" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "defaultPrice" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "supplierId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupLocation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickupLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBuy" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "status" "GroupBuyStatus" NOT NULL DEFAULT 'DRAFT',
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GroupBuy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBuyItem" (
    "id" UUID NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL,
    "stock" INTEGER,
    "purchaseLimit" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GroupBuyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBuyPickup" (
    "id" UUID NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "pickupLocationId" UUID NOT NULL,
    "pickupStartAt" TIMESTAMPTZ(3),
    "pickupEndAt" TIMESTAMPTZ(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GroupBuyPickup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuy_slug_key" ON "GroupBuy"("slug");

-- CreateIndex
CREATE INDEX "GroupBuy_status_startAt_idx" ON "GroupBuy"("status", "startAt");

-- CreateIndex
CREATE INDEX "GroupBuy_status_endAt_idx" ON "GroupBuy"("status", "endAt");

-- CreateIndex
CREATE INDEX "GroupBuyItem_productId_idx" ON "GroupBuyItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyItem_groupBuyId_productId_key" ON "GroupBuyItem"("groupBuyId", "productId");

-- CreateIndex
CREATE INDEX "GroupBuyPickup_pickupLocationId_idx" ON "GroupBuyPickup"("pickupLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyPickup_groupBuyId_pickupLocationId_key" ON "GroupBuyPickup"("groupBuyId", "pickupLocationId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuyItem" ADD CONSTRAINT "GroupBuyItem_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuyItem" ADD CONSTRAINT "GroupBuyItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuyPickup" ADD CONSTRAINT "GroupBuyPickup_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBuyPickup" ADD CONSTRAINT "GroupBuyPickup_pickupLocationId_fkey" FOREIGN KEY ("pickupLocationId") REFERENCES "PickupLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
