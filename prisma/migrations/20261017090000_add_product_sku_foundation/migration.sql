-- Expand only: no legacy columns, prices, stock or transaction rows are changed.
-- Default SKU backfill is an explicit, separately reviewed operation.
BEGIN;
CREATE TABLE "ProductSku" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "combinationKey" VARCHAR(1024) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProductSku_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductSku_code_format_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  CONSTRAINT "ProductSku_default_identity_check" CHECK (
    ("combinationKey" = 'default' AND "id" = "productId" AND "code" = 'DEFAULT-' || upper("productId"::text))
    OR ("combinationKey" <> 'default' AND "code" NOT LIKE 'DEFAULT-%')
  )
);

CREATE TABLE "ProductOption" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductOption_name_check" CHECK ("name" = btrim("name") AND char_length("name") > 0)
);

CREATE TABLE "ProductOptionValue" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "optionId" UUID NOT NULL,
  "value" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductOptionValue_value_check" CHECK ("value" = btrim("value") AND char_length("value") > 0)
);

CREATE TABLE "ProductSkuOptionValue" (
  "skuId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "optionId" UUID NOT NULL,
  "optionValueId" UUID NOT NULL,
  CONSTRAINT "ProductSkuOptionValue_pkey" PRIMARY KEY ("skuId", "optionId")
);

CREATE UNIQUE INDEX "ProductSku_code_key" ON "ProductSku"("code");
CREATE UNIQUE INDEX "ProductSku_productId_combinationKey_key" ON "ProductSku"("productId", "combinationKey");
CREATE UNIQUE INDEX "ProductSku_id_productId_key" ON "ProductSku"("id", "productId");
CREATE UNIQUE INDEX "ProductOption_productId_name_key" ON "ProductOption"("productId", "name");
CREATE UNIQUE INDEX "ProductOption_id_productId_key" ON "ProductOption"("id", "productId");
CREATE UNIQUE INDEX "ProductOptionValue_optionId_value_key" ON "ProductOptionValue"("optionId", "value");
CREATE UNIQUE INDEX "ProductOptionValue_id_optionId_productId_key" ON "ProductOptionValue"("id", "optionId", "productId");
CREATE INDEX "ProductSkuOptionValue_skuId_productId_idx" ON "ProductSkuOptionValue"("skuId", "productId");
CREATE INDEX "ProductSkuOptionValue_optionValueId_optionId_productId_idx" ON "ProductSkuOptionValue"("optionValueId", "optionId", "productId");

ALTER TABLE "ProductSku" ADD CONSTRAINT "ProductSku_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_productId_fkey"
  FOREIGN KEY ("optionId", "productId") REFERENCES "ProductOption"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductSkuOptionValue" ADD CONSTRAINT "ProductSkuOptionValue_skuId_productId_fkey"
  FOREIGN KEY ("skuId", "productId") REFERENCES "ProductSku"("id", "productId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSkuOptionValue" ADD CONSTRAINT "ProductSkuOptionValue_optionValueId_optionId_productId_fkey"
  FOREIGN KEY ("optionValueId", "optionId", "productId") REFERENCES "ProductOptionValue"("id", "optionId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A unique key alone is insufficient if callers can lie about the selected
-- values. Verify the canonical key at COMMIT, after nested Prisma inserts.
-- IDs are sorted as text with C collation, matching the server's UUID ordering.
CREATE FUNCTION "check_product_sku_combination"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected UUID[];
  target UUID;
  stored_key TEXT;
  actual_key TEXT;
  selected_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'ProductSku' THEN
    IF TG_OP = 'INSERT' THEN affected := ARRAY[NEW."id"];
    ELSIF TG_OP = 'DELETE' THEN affected := ARRAY[OLD."id"];
    ELSE affected := ARRAY[OLD."id", NEW."id"]; END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN affected := ARRAY[NEW."skuId"];
    ELSIF TG_OP = 'DELETE' THEN affected := ARRAY[OLD."skuId"];
    ELSE affected := ARRAY[OLD."skuId", NEW."skuId"]; END IF;
  END IF;
  FOR target IN SELECT DISTINCT unnest(affected) ORDER BY 1 LOOP
    SELECT "combinationKey" INTO stored_key FROM "ProductSku" WHERE "id" = target FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT coalesce(string_agg("optionValueId"::text, ',' ORDER BY "optionValueId"::text COLLATE "C"), 'default'), count(*)
      INTO actual_key, selected_count FROM "ProductSkuOptionValue" WHERE "skuId" = target;
    IF stored_key <> actual_key OR selected_count > 20 THEN
      RAISE EXCEPTION 'SKU combination does not match selected option values'
        USING ERRCODE = '23514', CONSTRAINT = 'ProductSku_combination_matches_options_check';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ProductSku_combination_check"
  AFTER INSERT OR UPDATE ON "ProductSku" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_product_sku_combination"();
CREATE CONSTRAINT TRIGGER "ProductSkuOptionValue_combination_check"
  AFTER INSERT OR UPDATE OR DELETE ON "ProductSkuOptionValue" DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_product_sku_combination"();

COMMIT;
