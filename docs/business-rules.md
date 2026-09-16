# Business Rules

- Product and GroupBuy are separate.
- A Product can be included in multiple GroupBuys.
- GroupBuyItem is the association entity between Product and GroupBuy.
- `Product.defaultPrice` is the default selling price.
- `Product.cost` is the current default cost.
- `GroupBuyItem.salePrice` is the actual selling price for that group buy.
- `GroupBuyItem.cost` is the cost snapshot for that group buy.
- Draft group buys must not appear on the public frontend.
- Publishing a group buy requires at least one product and at least one enabled fulfillment method.
- Fixed self-pickup requires at least one active GroupBuyPickup; customer-selected 7-ELEVEN pickup does not create PickupLocation rows.
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
- Published Group Buys remain Admin-editable. With no Orders they use the full aggregate editor. Once any Order exists, title, description, gallery images, ordering window, future sale prices and purchase limits, ordering, additions, and pickup windows may still change; existing Order and OrderItem snapshots are never rewritten.
- A Group Buy may have zero to eight gallery images. Gallery order is authoritative and contiguous; the first image is the cover. Gallery edits are presentation-only and never rewrite Order or OrderItem snapshots.
- Once any Order exists, stock on existing GroupBuyItems is intentionally locked. Submitted existing-item stock is non-authoritative and ignored, so stale or forged form values cannot race with atomic order allocation. Newly added items may define their initial remaining stock.
- A GroupBuyItem referenced by an OrderItem and a GroupBuyPickup referenced by an Order cannot be deleted. Unreferenced rows may be removed while the published aggregate retains at least one item and pickup.
- Published pickup-window edits apply only to future Orders. Existing Orders retain their pickup time, name, address, price, product, unit, and quantity snapshots.
- Moving a published ordering end earlier closes ordering at the new time (immediately if already past); moving it later reopens or extends ordering when the current time is within the resulting window. No Orders are cancelled and no stock is restored automatically. The window must keep `startAt < endAt`, and timed pickups cannot start before the new ordering end.

## Group Buy publishing

- Only a `DRAFT` Group Buy can be published. Publishing requires at least one item and at least one of `SELF_PICKUP` or `SEVEN_ELEVEN`.
- When `SELF_PICKUP` is enabled, publishing requires at least one active fixed pickup location. A 7-ELEVEN-only Group Buy may have no fixed pickup location.
- Every published `GroupBuyItem` and its referenced Product must be active. Every referenced PickupLocation must also be active.
- At publish time, `endAt` must still be in the future. When a pickup window is present, `pickupStartAt` cannot be earlier than the Group Buy's `endAt`.
- A successful publish changes the status to `PUBLISHED` and sets `publishedAt` to the same server-generated time used for publish validation.
- For presentation, a `PUBLISHED` Group Buy is derived as scheduled when `now < startAt`, active when `startAt <= now < endAt`, and ended when `now >= endAt`. These lifecycle values are not stored. `CANCELLED` remains `CANCELLED` regardless of dates.
- Draft writes conditionally require the row to remain `DRAFT` before child synchronization. Publish requires both `DRAFT` and the `updatedAt` version observed during publish validation, so a concurrent committed draft edit invalidates the publish transition and requires revalidation.

## Public Group Buy display

- Only `PUBLISHED` Group Buys are public. `DRAFT` and `CANCELLED` Group Buys behave as not found on public detail routes.
- Scheduled, active, and ended are presentation states derived from the current time; they are never persisted. A published Group Buy is scheduled when `now < startAt`, active when `startAt <= now < endAt`, and ended when `now >= endAt`.
- The public projection hides inactive GroupBuyItems and items whose referenced Product is inactive. It also hides pickups whose referenced PickupLocation is inactive.
- Hiding inactive master-data references is a projection rule only. Historical GroupBuyItem and GroupBuyPickup rows remain intact, and the Group Buy status is not changed automatically.
- Public pages never expose Product or GroupBuyItem cost, supplier data, or other admin-only fields.

## Customer Order Cancellation

- Customer cancellation requires exact order-management authorization using the Order's public reference plus its independent management token. A phone number, a public code, or their combination is not authentication.
- Only a `PLACED` Order can transition to `CANCELLED`; cancellation is irreversible and cannot reopen an Order.
- The customer self-cancellation cutoff is `GroupBuy.endAt`. A new cancellation is allowed only when the server-generated `now < endAt`; exact equality is closed.
- `cancelledAt` is the same server-generated time used for cutoff validation. An already-cancelled request preserves and returns its stored timestamp.
- A successful cancellation atomically claims the status transition and restores each finite-stock allocation from historical OrderItem quantities. Unlimited (`null`) stock remains `null`.
- `CANCELLED` Orders no longer count toward purchase limits because purchase-limit consumption includes only `PLACED` Orders.
- Repeated and concurrent cancellation requests are idempotent. The conditional claim succeeds once, so stock is restored exactly once.

## Admin Order Cancellation

- Each Admin cancellation Server Action independently requires an active authenticated Admin before parsing input or calling the mutation service. The sole business input is the exact Order public code; customer management credentials and policy flags are not accepted.
- Admin may cancel a `PLACED` Order before, at, or after `GroupBuy.endAt`. The cutoff remains a customer-only self-service rule.
- Admin and customer cancellation share one serializable transaction primitive: a conditional `PLACED` claim, server-generated `cancelledAt`, and canonical-order finite-stock restoration from historical OrderItem quantities. Unlimited stock stays null; snapshots are never rewritten.
- Cancellation is irreversible. Already-cancelled requests return the stored timestamp without additional stock restoration. Concurrent Admin/Admin and Customer/Admin requests restore stock exactly once.
- No reason, actor attribution, payment/refund behavior, partial cancellation, or reopening is included.

## Order pickup completion

- Active authenticated Admins may mark a `PLACED` Order picked up only while `pickedUpAt` is null. Each pickup Server Action independently calls `requireAdmin()` before parsing the sole business input, the exact `publicCode`.
- `pickedUpAt` is a server-generated timestamp, stored once. Pickup is irreversible; duplicate requests return the stored timestamp without another write. No Group Buy cutoff, pickup-window, or current master-data activity restriction applies.
- Pickup keeps status `PLACED`, does not change stock, and continues consuming purchase limits. All Order and OrderItem snapshots remain unchanged.
- Both customer and Admin cancellation reject picked-up Orders. Their conditional claims require `status = PLACED` and `pickedUpAt = null`; the customer claim also retains token authorization. Customer authorization precedes state disclosure, and pickup rejection precedes the existing customer cutoff check.
- Pickup and cancellation use serializable transactions with bounded whole-attempt retries. Only one competing terminal mutation can commit; cancellation alone restores finite stock, atomically and exactly once.
- `CANCELLED` with a non-null `pickedUpAt` is invalid. Mutation services and read models fail closed on this combination. No database CHECK constraint is included in this phase.
- Authorized customer detail and Admin detail show the stored pickup time in Asia/Taipei and remove cancellation controls after pickup. The Admin list derives pending, picked-up, or cancelled display without additional persisted state.
- Existing Orders receive null pickup timestamps without backfill. No actor attribution, undo, partial fulfillment, or refunds are included. Payment is defined separately below.

## Manual payment collection

- An active authenticated Admin may manually confirm that the full historical Order total has been received. Each payment Server Action calls `requireAdmin()` before parsing the sole business input, the exact `publicCode`. Extra or duplicate business fields are rejected.
- `paidAt` is a server-generated confirmation timestamp, stored once. It is not a backdated receipt time. Duplicate requests return the stored timestamp without another write or changing `updatedAt`. There is no reversal, timestamp editing, or mark-unpaid operation.
- Payment and pickup are independent. Both unpaid pickup and payment after pickup are allowed; payment leaves `pickedUpAt` unchanged and pickup leaves `paidAt` unchanged.
- Both customer and Admin cancellation reject paid Orders. After authorization and valid already-cancelled idempotency, pickup rejection takes precedence, then payment rejection, then the customer-only cutoff. Cancellation claims require `status = PLACED`, `pickedUpAt = null`, and `paidAt = null`, retaining customer token scope.
- Payment claims require `status = PLACED` and `paidAt = null`, without a pickup predicate. Serializable transactions retry complete attempts with fresh reads and server time. Payment/cancellation permit one winner; payment/pickup may both commit with both timestamps preserved.
- A cancelled Order is valid only with a cancellation timestamp and null pickup/payment timestamps. Services and read projections fail closed on invalid cancelled states. No database CHECK constraint is added.
- Payment never changes stock, purchase-limit consumption, Order/OrderItem snapshots, or `totalAmount`. The historical Order total remains authoritative. Paid and picked-up Orders still count toward purchase limits.
- Authorized customer detail and Admin list/detail show payment separately from fulfillment. Null means “尚未確認收款”; payment confirmation time is displayed in Asia/Taipei. Cancelled Orders are not presented as active unpaid Orders. Customers have no payment action.
- Existing Orders receive null without backfill. No payment method, received amount, notes, reference, actor, partial payment, payment history, refunds, provider, checkout, invoice, receipt, or accounting is included.

## Order fulfillment selection

- Existing Group Buys and Orders remain `SELF_PICKUP` through migration defaults; no historical snapshot is rewritten.
- A `SELF_PICKUP` Order has a GroupBuyPickup reference plus immutable pickup name, address, and optional time snapshots, and has no 7-ELEVEN store snapshots.
- A `SEVEN_ELEVEN` Order has no GroupBuyPickup reference or fixed-pickup snapshot. It has immutable store ID, name, and address snapshots resolved from a short-lived server-side selection.
- Before redirecting to ECPay, the server binds each pending selection to a stable, high-entropy HttpOnly browser secret and its Group Buy. ECPay map callback fields are not authoritative browser input: the server requires the unguessable, expiring state, validates the documented merchant/trade/subtype contract, preserves the original browser binding, resolves the store through the checksum-authenticated ECPay store-list API, and consumes the selection once in the Order transaction.
- Store selection does not create a logistics order and does not mean the Order has been physically picked up. Payment, pickup completion, cancellation, stock, and purchase-limit rules remain independent of the fulfillment method.
