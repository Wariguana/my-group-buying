-- CreateTable
CREATE TABLE "GroupBuyImage" (
    "id" UUID NOT NULL,
    "groupBuyId" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "storageKey" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBuyImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingGroupBuyImageUpload" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingGroupBuyImageUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupBuyImage_storageKey_key" ON "GroupBuyImage"("storageKey");
CREATE INDEX "GroupBuyImage_groupBuyId_sortOrder_idx" ON "GroupBuyImage"("groupBuyId", "sortOrder");
CREATE UNIQUE INDEX "PendingGroupBuyImageUpload_storageKey_key" ON "PendingGroupBuyImageUpload"("storageKey");
CREATE INDEX "PendingGroupBuyImageUpload_adminUserId_expiresAt_idx" ON "PendingGroupBuyImageUpload"("adminUserId", "expiresAt");
CREATE INDEX "PendingGroupBuyImageUpload_expiresAt_consumedAt_idx" ON "PendingGroupBuyImageUpload"("expiresAt", "consumedAt");

-- AddForeignKey
ALTER TABLE "GroupBuyImage" ADD CONSTRAINT "GroupBuyImage_groupBuyId_fkey" FOREIGN KEY ("groupBuyId") REFERENCES "GroupBuy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingGroupBuyImageUpload" ADD CONSTRAINT "PendingGroupBuyImageUpload_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every legacy cover as the first gallery image. Legacy external
-- objects have no storage key and therefore are never deleted from storage.
INSERT INTO "GroupBuyImage" ("id", "groupBuyId", "imageUrl", "storageKey", "sortOrder", "createdAt")
SELECT gen_random_uuid(), "id", "coverImageUrl", NULL, 0, CURRENT_TIMESTAMP
FROM "GroupBuy"
WHERE "coverImageUrl" IS NOT NULL;

-- The gallery is now the sole source of image presentation truth.
ALTER TABLE "GroupBuy" DROP COLUMN "coverImageUrl";
