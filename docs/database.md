# Database Plan

Phase 1 is planned to use these models only: `User`, `Supplier`, `Product`, `GroupBuy`, `GroupBuyItem`, `PickupLocation`, and `GroupBuyPickup`.

## Relationships

- `Supplier` → `Product`
- `Product` → `GroupBuyItem`
- `GroupBuy` → `GroupBuyItem`
- `GroupBuy` → `GroupBuyPickup`
- `PickupLocation` → `GroupBuyPickup`

`Product` stores product master data and default price/cost. `GroupBuyItem` stores group-buy-level values such as `salePrice`, `cost`, `stock`, and `purchaseLimit`; it must not rely only on mutable Product values.

`PickupLocation` is reusable. `GroupBuyPickup` links a `GroupBuy` and `PickupLocation`, and may later own `pickupStartAt` and `pickupEndAt`.

This document does not define a Prisma schema.
