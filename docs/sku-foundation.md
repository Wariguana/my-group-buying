# Product SKU foundation (Phase 1 PR 1)

This is an additive identity/specification foundation. The customer storefront,
Product prices, GroupBuyItem sale prices/stock, OrderItem snapshots, payment,
fulfillment and order numbering still use the existing flow. SKU has no stock
or price fields, and disabling a SKU does not disable legacy ordering.

## Model and integrity

- Product has many ProductSku and ProductOption rows. An option is a dimension
  such as color; ProductOptionValue stores its allowed values.
- ProductSkuOptionValue selects one value per dimension. Sparse combinations
  are allowed; no Cartesian product is generated.
- SKU UUIDs are stable. Codes are globally unique uppercase ASCII identifiers.
  Dimension names are unique per Product; value labels are unique per dimension.
  Different Products may reuse the same labels.
- The canonical combination key is the comma-separated, sorted lowercase option
  value UUIDs, or `default` for the empty combination. Labels do not define
  identity. The server accepts at most 20 selected values.
- A unique `(productId, combinationKey)` index prevents duplicate combinations.
  Composite foreign keys prohibit cross-product selections; the link primary
  key prohibits two values of the same dimension.
- Deferred constraint triggers recompute the canonical key at transaction end.
  Direct SQL cannot supply a fake key or remove options without updating the
  key consistently. SKU and selections must be written in one transaction.
  Tests must await COMMIT, not merely an individual INSERT.
- Referential deletion is restricted for products/dimensions/values in use.
  SKU activation changes preserve IDs and selected values. No delete operation
  or new transaction/SKU relation is introduced in this PR.

The SQL CHECKs and deferred triggers are part of the migration and cannot be
represented fully by Prisma schema alone. Preserve them in future migrations.
Any future Admin action calling sku-service must enforce requireAdmin first.
This PR does not expose a new API or Admin editor.

Product and SKU IDs are table-qualified identities: callers must use the
appropriate productId/skuId field and relation, never treat a bare UUID as a
global entity type. A random UUID collision is rejected by the SKU primary key;
mapping must fail rather than replace an unrelated SKU. This is safe rejection,
not a guarantee that randomly generated UUIDs can never collide.

Display labels may change without changing combination keys. Changing selected
values or removing a selected dimension requires updating the canonical key in
the same transaction; an invalid intermediate state is allowed only until the
deferred check executes. Referenced option/value deletion is restricted. SKU
deletion currently cascades only its selection rows, because legacy transactions
do not reference SKU yet. When transaction/SKU relations are added, they must use
`ON DELETE RESTRICT` and immutable transaction snapshots; expose deactivation,
not deletion, for an in-use SKU. This is a requirement for that later migration,
not a constraint already present on legacy OrderItem.

## Default compatibility mapping

The migration creates empty tables only. An explicit report/backfill maps each
legacy Product to one empty-specification SKU. Its SKU ID equals the Product
UUID (in a separate table); its code is `DEFAULT-` plus the uppercase Product
UUID. That code prefix is reserved. No display-name interpretation, product
deduplication, price copy, order backfill or stock aggregation is performed.

New default SKUs inherit Product.isActive once. Reruns do not update existing
identity, activation or timestamps. New Products created through the unchanged
legacy editor can be mapped by rerunning the report/backfill, or by the internal
ensureDefaultProductSku service. A product without a default but with variant
metadata is flagged `requires-review`; the apply command refuses the entire
batch rather than guess a default mapping.

After reviewing the additive migration and verifying it in an isolated database:

```powershell
npx prisma migrate status
# Apply only the reviewed migration to the intended development database.
npx prisma migrate deploy
npm run sku:backfill
# Review every mapping before opting into writes.
npm run sku:backfill -- --apply
npm run sku:backfill
```

The report is read-only. Apply uses a Serializable transaction, locks Product
rows and inserts only missing default SKUs; any error rolls back the whole batch.
Neither command prints database credentials. The tool only accepts the existing
approved loopback development/CI sources or isolated test targets and refuses
production. Production backfill needs a separately reviewed release procedure.

Development inventory checked before implementation: 1 Product, 3 GroupBuyItem
rows (all with null legacy stock), 18 Orders and 18 OrderItems. These quantities
are observations, not assumptions baked into the migration. Null legacy stock
retains its existing meaning and does not create new unlimited SKU inventory.

## Verification and rollout

`npm run test:integration:orders` runs the SKU PostgreSQL suite after the existing
order and shipment suites in a lifecycle-owned disposable database. The SKU suite
also replays the old migrations into an isolated schema, inserts historical rows,
then verifies expand/backfill against complete legacy row snapshots.

Verify global codes, canonical combinations, concurrent duplicates, same-product
FKs, default reruns, deactivation, and legacy createOrder/read behavior. Existing
Playwright flows remain the customer/Admin compatibility check. No existing
migration is edited and no source database is reset or truncated.

Roll out as expand, report, backfill; stock/pricing switches and contract changes
belong to later PRs. Application rollback leaves the additive tables in place.
Do not remove applied migrations or use a database reset as a rollback strategy.
