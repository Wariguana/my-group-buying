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
