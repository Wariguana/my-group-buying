# My Group Buying

Personal group-buying operations system built with Next.js, TypeScript, Tailwind CSS, Prisma, and PostgreSQL.

## Local development

Copy `.env.example` to `.env`, then start the local PostgreSQL 17 service. Compose exposes PostgreSQL only on loopback port `5433`.

```sh
docker compose up -d db
npx prisma migrate deploy
npm run dev
```

The development application is available at [http://localhost:3000](http://localhost:3000).

## Current QBUY flow

Catalogue SKU → cart → Checkout → bank reconciliation → QbOrder → cancellation/refund/delivery.
Admin operations use `/admin/qbuy` and `/admin/payments`; customer purchases use `/my/orders`.
The retired `/admin/orders` and `/orders/[publicCode]` routes return 404. Historical database rows and migrations remain intact.
See [the retirement notes](docs/legacy-order-retirement.md) for preserved dependencies and validation.

## Verification

Run the static and unit checks with:

```sh
npm run check
```

Run the current QBUY catalogue, checkout, QB order and mobile browser flows with:

```sh
npm run test:e2e
```

The E2E runner validates `DATABASE_URL`, connects only to an approved local or CI source database, creates a uniquely named sibling database, applies committed migrations, provisions one ephemeral Admin, builds and starts the application in production mode on port `3100`, and runs the Chromium scenario.

The runner refuses source URLs outside the approved loopback-only development and CI database names and ports. After success or a post-creation failure, it attempts to stop the production server and clean up only the disposable database created by that run. Database removal requires confirmed server exit; if exit cannot be confirmed, the runner intentionally leaves the uniquely named database in place. It never removes abandoned databases based only on the E2E name prefix.

Run the current database integration suite with `npm run test:integration:commerce`.

## Beta operations

Production environment, migration, initial Admin, backup/restore, start, smoke,
security, and incident procedures are in [docs/beta-launch.md](docs/beta-launch.md).
