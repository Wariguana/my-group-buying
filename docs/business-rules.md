# Business Rules

- Product and GroupBuy are separate.
- A Product can be included in multiple GroupBuys.
- GroupBuyItem is the association entity between Product and GroupBuy.
- `Product.defaultPrice` is the default selling price.
- `Product.cost` is the current default cost.
- `GroupBuyItem.salePrice` is the actual selling price for that group buy.
- `GroupBuyItem.cost` is the cost snapshot for that group buy.
- Draft group buys must not appear on the public frontend.
- Publishing a group buy requires at least one product and one pickup location.
- The server must validate group-buy publishing.
- Clients may not decide authoritative prices or business status.
- Future GroupBuy flows must not newly assign inactive PickupLocations.
- Existing GroupBuyPickup references remain intact when a PickupLocation is deactivated.

## Group Buy draft management

- A draft may be saved with zero items and zero pickup locations. The minimum-one-item and minimum-one-pickup publish requirements are enforced only by the future publish stage.
- Newly assigned Products and PickupLocations must currently be active. Existing references may remain when their Product or PickupLocation is later deactivated.
- `GroupBuyItem.cost` is captured from the Product when an item is newly added and is not refreshed during ordinary draft edits. Draft `salePrice` remains editable.
- A null `stock` or `purchaseLimit` means unlimited; zero is a real zero value.
- Admin draft date/time input and display use `Asia/Taipei`. A draft `startAt` must be earlier than `endAt`; past draft windows are allowed.
- Pickup start/end times must either both be null or both be present. When present, the start must be earlier than the end.
- Saving a draft aggregate is atomic across `GroupBuy`, `GroupBuyItem`, and `GroupBuyPickup` changes.

## Group Buy publishing

- Only a `DRAFT` Group Buy can be published. Publishing requires at least one item and at least one pickup location.
- Every published `GroupBuyItem` and its referenced Product must be active. Every referenced PickupLocation must also be active.
- At publish time, `endAt` must still be in the future. When a pickup window is present, `pickupStartAt` cannot be earlier than the Group Buy's `endAt`.
- A successful publish changes the status to `PUBLISHED` and sets `publishedAt` to the same server-generated time used for publish validation.
- For presentation, a `PUBLISHED` Group Buy is derived as scheduled when `now < startAt`, active when `startAt <= now < endAt`, and ended when `now >= endAt`. These lifecycle values are not stored. `CANCELLED` remains `CANCELLED` regardless of dates.
- Draft writes conditionally require the row to remain `DRAFT` before child synchronization. Publish requires both `DRAFT` and the `updatedAt` version observed during publish validation, so a concurrent committed draft edit invalidates the publish transition and requires revalidation.
