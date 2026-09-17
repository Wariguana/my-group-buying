CREATE TABLE "OrderNumberSequence" (
    "dateKey" VARCHAR(8) NOT NULL,
    "lastValue" INTEGER NOT NULL,

    CONSTRAINT "OrderNumberSequence_pkey" PRIMARY KEY ("dateKey"),
    CONSTRAINT "OrderNumberSequence_dateKey_format_check" CHECK ("dateKey" ~ '^[0-9]{8}$'),
    CONSTRAINT "OrderNumberSequence_lastValue_range_check" CHECK ("lastValue" BETWEEN 1 AND 9999)
);

ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT COUNT(*) AS order_count
            FROM "Order"
            GROUP BY to_char("createdAt" AT TIME ZONE 'Asia/Taipei', 'YYYYMMDD')
            HAVING COUNT(*) > 9999
        ) AS over_capacity
    ) THEN
        RAISE EXCEPTION 'Cannot backfill order numbers: a Taipei business date has more than 9999 orders';
    END IF;
END $$;

WITH ranked_orders AS (
    SELECT
        "id",
        to_char("createdAt" AT TIME ZONE 'Asia/Taipei', 'YYYYMMDD') AS date_key,
        row_number() OVER (
            PARTITION BY to_char("createdAt" AT TIME ZONE 'Asia/Taipei', 'YYYYMMDD')
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS daily_sequence
    FROM "Order"
)
UPDATE "Order" AS orders
SET "orderNumber" = ranked_orders.date_key || lpad(ranked_orders.daily_sequence::text, 4, '0')
FROM ranked_orders
WHERE orders."id" = ranked_orders."id";

INSERT INTO "OrderNumberSequence" ("dateKey", "lastValue")
SELECT
    substring("orderNumber" FROM 1 FOR 8),
    MAX(substring("orderNumber" FROM 9 FOR 4)::integer)
FROM "Order"
GROUP BY substring("orderNumber" FROM 1 FOR 8);

ALTER TABLE "Order" ALTER COLUMN "orderNumber" SET NOT NULL;

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_orderNumber_format_check"
CHECK ("orderNumber" ~ '^[0-9]{12}$');
