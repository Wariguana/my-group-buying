-- AlterTable
ALTER TABLE "SevenElevenStoreSelection" ADD COLUMN     "checkoutId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "SevenElevenStoreSelection_checkoutId_key" ON "SevenElevenStoreSelection"("checkoutId");

-- AddForeignKey
ALTER TABLE "SevenElevenStoreSelection" ADD CONSTRAINT "SevenElevenStoreSelection_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve both legacy states and the new atomic Checkout consumption target.
ALTER TABLE "SevenElevenStoreSelection" DROP CONSTRAINT "SevenElevenStoreSelection_state_check";
ALTER TABLE "SevenElevenStoreSelection" ADD CONSTRAINT "SevenElevenStoreSelection_state_check" CHECK (
 ("selectionTokenHash" IS NULL AND "browserBindingHash" IS NOT NULL AND "storeId" IS NULL AND "storeName" IS NULL AND "storeAddress" IS NULL AND "consumedAt" IS NULL AND "orderId" IS NULL AND "checkoutId" IS NULL)
 OR
 ("selectionTokenHash" IS NOT NULL AND "browserBindingHash" IS NOT NULL AND "storeId" IS NOT NULL AND "storeName" IS NOT NULL AND "storeAddress" IS NOT NULL AND
   (("consumedAt" IS NULL AND "orderId" IS NULL AND "checkoutId" IS NULL)
    OR ("consumedAt" IS NOT NULL AND (("orderId" IS NOT NULL AND "checkoutId" IS NULL) OR ("orderId" IS NULL AND "checkoutId" IS NOT NULL)))))
);
