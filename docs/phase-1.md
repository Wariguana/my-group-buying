# Phase 1

Phase 1 includes:

1. Admin authentication and admin shell
2. Supplier management
3. Product management
4. PickupLocation management
5. GroupBuy draft
6. GroupBuyItem
7. GroupBuyPickup
8. Publish GroupBuy
9. Public GroupBuy list and detail display
10. Phase 1 E2E flow

Phase 1 does not include:

- Customer checkout
- Order and OrderItem
- Payment
- Pickup completion workflow
- LINE integration
- Coupons
- Membership
- Reports
- Inventory purchasing
- Supplier settlement

## Admin authentication v1

- `/admin/login` accepts normalized email (trim/lowercase) and an unchanged
  password of 1–128 Unicode code points. Extra input fields are rejected.
- Credential failures share the same result and UI message: `Email 或密碼錯誤`.
  Valid missing/inactive-user attempts execute one dummy Argon2 operation;
  active users execute one password verification. Internal failures return
  `登入失敗，請稍後再試。` without underlying error details.
- Auth/domain services are server-only and do not import Next.js. Cookie/request
  integration and Server Actions are separate from the login form/admin shell.
- Sessions use the existing opaque 256-bit token primitive. Only SHA-256
  `tokenHash` is persisted; the raw token goes only into the `admin_session`
  HttpOnly cookie. Expiry is fixed at seven days, with no sliding refresh.
- Cookie options: SameSite=Lax, Path=/, Secure in production, no Domain, and
  the exact DB session expiry. Lookup/revoke reject tokens unless they contain
  exactly 43 base64url characters, before hashing or accessing the database.
- Current-admin lookup selects only session expiry and public user fields,
  rechecking expiration and `isActive` without an auth-result cache. Expiration
  at or before now, inactivity, missing sessions and malformed tokens are
  unauthenticated. Expired rows are not deleted during reads.
- The `(protected)` route group guards `/admin` with `requireAdmin()`. Layouts
  may be reused during navigation: future sensitive reads and mutations must
  independently call `requireAdmin()`. The login page redirects a valid session
  to `/admin`. No middleware/proxy is used for authentication.
- Login and logout use Server Actions and Next.js 16's POST and Origin-vs-Host
  protections. There are no public JSON login/logout endpoints or custom CORS.
- Session creation failure sets no cookie. If cookie writing fails after
  creation, login returns a generic failure and attempts to revoke that new
  session. Cleanup failure is suppressed without logging secrets.
- Logout revokes only the current session and expires the same cookie name/path
  even if DB revocation fails. It is idempotent. If revocation fails, the DB row
  can remain valid until its fixed expiry; the browser cookie is still removed.
- TODO: durable rate limiting required before public exposure.

### Auth verification

`npm run test` covers validation, real Argon2 credential verification against a
mocked database, token persistence/lookup/revocation, cookies, request helpers
and Server Action failure boundaries. Real DB suites safely skip without
`TEST_DATABASE_URL`, without connecting to a database.

Run the new isolated suite with:

```sh
npx vitest run tests/integration/admin-login-session.test.ts
```

Set `TEST_DATABASE_URL` separately to an unused database name prefixed with
`my_group_buying_test_auth_` at PostgreSQL `localhost:5433` or `127.0.0.1:5433`,
without query or fragment. There is no fallback to `DATABASE_URL`. The suite
validates the URL, sets the production boundary's `DATABASE_URL` to that same
target, creates the fresh database, runs `migrate deploy`, tests generated admin
credentials/session persistence/inactivity/expiry/revocation, then disconnects,
drops its database, verifies removal and restores the original environment.
It refuses to reuse an existing database and only drops a database it created.
Use a fresh name for each run; the existing bootstrap suite uses its own prefix
and should be run separately when an explicit test URL is set.

`npm run test:e2e` runs the complete supported Phase 1 browser flow in Chromium.
The runner accepts only the approved loopback development database at port
`5433` or CI control database at port `5432`, creates a uniquely named sibling
database, deploys committed migrations, provisions ephemeral Admin credentials,
builds the application, and serves it with `next start` on port `3100`.
Playwright covers real login plus Supplier, Product, PickupLocation, Group Buy
draft/edit/publish, and public list/detail behavior. After success or a
post-creation failure, cleanup is attempted only for the disposable database
created by that run. The production server must be confirmed exited before the
database is dropped. If exit cannot be confirmed, the runner intentionally
leaves the uniquely named database in place rather than risk dropping one still
in use. Abandoned E2E databases are never removed based only on their prefix.
The source database is not used for application reads or writes during E2E.
