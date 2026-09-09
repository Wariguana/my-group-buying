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

## Verification

Run the static and unit checks with:

```sh
npm run check
```

Run the complete Phase 1 browser flow with:

```sh
npm run test:e2e
```

The E2E runner validates `DATABASE_URL`, connects only to an approved local or CI source database, creates a uniquely named sibling database, applies committed migrations, provisions one ephemeral Admin, builds and starts the application in production mode on port `3100`, and runs the Chromium scenario.

The runner refuses source URLs outside the approved loopback-only development and CI database names and ports. After success or a post-creation failure, it attempts to stop the production server and clean up only the disposable database created by that run. Database removal requires confirmed server exit; if exit cannot be confirmed, the runner intentionally leaves the uniquely named database in place. It never removes abandoned databases based only on the E2E name prefix.
