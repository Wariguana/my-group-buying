# LINE Login and customer accounts

`CustomerAccount.lineUserId` stores the verified `sub` returned by LINE's ID-token verification endpoint. That `sub` is the only LINE identity key used by this application. Display name and picture URL are mutable profile metadata, not identity proof.

The existing `Customer` model remains a phone-based order-contact record. A phone number entered during ordering is not a verified phone number, and LINE Login does not prove ownership of that number. The application must not automatically connect a `CustomerAccount` to a `Customer`, use a phone number to claim an Order, or rewrite Order ownership.

`Order.customerAccountId` records authenticated ownership only when a new Order is created while a verified `CustomerSession` is active. Guest Orders keep a null owner, and existing Orders are not backfilled or automatically claimed after LINE Login—even when their contact phone matches. `Customer` therefore remains the independent phone-based contact and purchase-limit identity, while `CustomerAccount` is the verified LINE identity.

`/my/orders` queries only the signed-in account's exact `customerAccountId`, newest first. It never falls back to phone, customer name, display name, or unowned guest Orders. Historical order claiming would require proof from the existing Order credential or a separately designed verification flow.

The legacy `publicCode` plus Order management-token flow remains supported. An authenticated owner may also view and cancel their own eligible Order without the legacy token; these are independent authorization paths, and merely being logged in does not authorize another account's Order.

This phase does not include LINE Messaging API, notifications, LIFF, payment integration, points, or logistics expansion.

## Runtime configuration

The server requires `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, and `LINE_LOGIN_REDIRECT_URI`. Secrets remain server-only. The configured redirect URI must end at `/api/auth/line/callback` and exactly match the LINE Developers channel setting.

For a temporary development tunnel, `NEXT_DEV_ALLOWED_ORIGIN` may contain its hostname without a scheme, matching Next.js `allowedDevOrigins` format. This variable is development-only and is not required in production.
