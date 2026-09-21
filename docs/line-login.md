# LINE Login and customer accounts

`CustomerAccount.lineUserId` stores the verified `sub` returned by LINE's ID-token verification endpoint. That `sub` is the only LINE identity key used by this application. Display name and picture URL are mutable profile metadata, not identity proof.

The existing `Customer` model remains a phone-based order-contact record. A phone number entered during ordering is not a verified phone number, and LINE Login does not prove ownership of that number. The application must not automatically connect a `CustomerAccount` to a `Customer`, use a phone number to claim an Order, or rewrite Order ownership.

Historical order claiming requires a separate, explicit security and product design. It is not part of this phase. This phase also does not include My Orders, LINE Messaging API, notifications, LIFF, payment, or logistics changes.

## Runtime configuration

The server requires `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, and `LINE_LOGIN_REDIRECT_URI`. Secrets remain server-only. The configured redirect URI must end at `/api/auth/line/callback` and exactly match the LINE Developers channel setting.

For a temporary development tunnel, `NEXT_DEV_ALLOWED_ORIGIN` may contain its hostname without a scheme, matching Next.js `allowedDevOrigins` format. This variable is development-only and is not required in production.
