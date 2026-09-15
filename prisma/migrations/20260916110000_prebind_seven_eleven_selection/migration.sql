-- Pending selections created before browser pre-binding cannot be safely
-- associated with their original browser. Keep them for auditability but
-- expire them before requiring a binding hash on every selection state.
UPDATE "SevenElevenStoreSelection"
SET
  "browserBindingHash" = 'legacy-unbound:' || "stateHash",
  "expiresAt" = LEAST("expiresAt", CURRENT_TIMESTAMP)
WHERE "browserBindingHash" IS NULL;

ALTER TABLE "SevenElevenStoreSelection"
  DROP CONSTRAINT "SevenElevenStoreSelection_state_check";

ALTER TABLE "SevenElevenStoreSelection"
  ALTER COLUMN "browserBindingHash" SET NOT NULL;

ALTER TABLE "SevenElevenStoreSelection"
  ADD CONSTRAINT "SevenElevenStoreSelection_state_check" CHECK (
    (
      "selectionTokenHash" IS NULL
      AND "browserBindingHash" IS NOT NULL
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
