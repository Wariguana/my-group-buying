# Beta launch operations

This is a provider-neutral runbook for one production Next.js instance and one
PostgreSQL database. Run commands from the repository root. Never point local
smoke, E2E, or restore-drill commands at production.

## 1. Prerequisites

- Node.js 24 and npm (the versions used by CI).
- PostgreSQL 17 or a compatible managed PostgreSQL service.
- PostgreSQL client tools (`pg_dump` and `pg_restore`) compatible with the
  server. On Windows the scripts search `C:\Program Files\PostgreSQL\*\bin`;
  otherwise put the tools on `PATH`. `POSTGRES_BIN` may point to a specific bin
  directory.
- TLS at the public edge. For self-hosting, put a reverse proxy in front of
  `next start`; enforce request-size/time limits and rate-limit `/admin/login`
  and Server Action POST traffic there.
- A private, access-controlled backup destination outside the Git checkout.

Before each release, verify the checkout and review the migration files:

```powershell
git status --short
git rev-parse HEAD
Get-ChildItem prisma/migrations
```

## 2. Environment variables

Set production values in the hosting platform's secret/environment store, not
in Git and not in a committed `.env` file.

| Name | Requirement |
| --- | --- |
| `NODE_ENV` | Must be `production`. `next build` and `next start` set this automatically; the production Admin bootstrap requires it explicitly. |
| `DATABASE_URL` | Required PostgreSQL URL for the intended production database. Use a least-privilege application role and the service's required TLS parameters. |
| `POSTGRES_BIN` | Optional operator-script setting when PostgreSQL tools are not on `PATH` or in the standard Windows install directory. |

There is no application session secret or bootstrap password environment
variable. Admin session and customer order tokens are random per session/order,
and only their hashes are stored. The initial Admin password is entered in a
hidden interactive prompt.

Confirm the database target without printing its credentials:

```powershell
$target = [Uri]$env:DATABASE_URL
"Database target: $($target.Host):$($target.Port)$($target.AbsolutePath)"
```

If this is not the intended production database, stop.

## 3. PostgreSQL preparation

Create the production database and application role using the provider's
administrative channel. Do not use the development Compose password. Grant the
application role the rights needed to connect, run the six committed migrations,
and read/write application tables. Restrict network access to the application
and operator hosts. Test connectivity with:

```powershell
npx prisma migrate status
```

An empty database may report all committed migrations as pending; an existing
database must not report drift, failed migrations, or unknown migrations.

## 4. Backup

Back up before every migration. The script uses `pg_dump --format=custom`, fails
on command errors, verifies the dump catalog with `pg_restore --list`, and prints
the absolute output path. It never prints the database URL.

```powershell
npm run db:backup -- --destination D:\secure-backups\my-group-buying
```

The default destination is the ignored `backups/` directory, but production
backups should be copied to encrypted storage with access control and retention.
Record the printed filename and verify it is non-empty. A dump can contain all
business and personal data from the database; handle it as a production secret.

## 5. Check migration status

With the production `DATABASE_URL` injected:

```powershell
npx prisma migrate status
```

Stop on a failed migration, drift, an unexpected target, or migrations not
present in the reviewed release.

## 6. Deploy migrations

Use only the production deployment command:

```powershell
npx prisma migrate deploy
npx prisma migrate status
```

Never run `prisma migrate dev`, `prisma db push`, or `prisma migrate reset`
against production. Do not edit or delete an applied migration.

## 7. Bootstrap the initial Admin

Install dependencies and generate the client first if the release host has not
already done so:

```powershell
npm ci
npx prisma generate
```

Only when the production database has no `User` row, run this in an interactive
terminal with production `DATABASE_URL` injected:

```powershell
$env:NODE_ENV = "production"
npm run admin:create:production
```

The command displays only host, port, database name, and normalized Admin email.
It requires typing `CREATE <database-name>`, reads the password twice without
echoing it, and refuses development, CI, maintenance, and test database names.
The database transaction creates at most one initial User; if any User already
exists, it stops and never changes a password. Store the password in an approved
password manager and clear the shell-scoped `DATABASE_URL` after the operation.

## 8. Install, generate, build, and start

Build the exact reviewed revision:

```powershell
npm ci
npx prisma generate
npm run build
npm run start
```

`npm run start` is the supported production command (`next start`). The platform
may set `PORT` and `HOSTNAME` as required by its runtime. Do not introduce a
process manager solely for this beta packet. Use graceful `SIGTERM`/`SIGINT`
shutdown and allow in-flight requests to drain.

## 9. Non-destructive smoke test

From outside the deployment network boundary, without creating or mutating an
order:

1. Load `/`; expect HTTP success, visible page styling, and no “無法載入團購”
   message. This route performs the deployment's database-backed read.
2. Load `/admin/login`; confirm the form and static CSS/assets load over HTTPS.
3. Sign in with the bootstrap Admin and confirm the `admin_session` cookie is
   `HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to `/`.
4. Load `/admin` and `/admin/orders`; an empty order list is valid, while the
   generic load-error message or a server error is not.
5. Inspect browser/server output for missing assets or obvious 5xx errors. Do
   not include credentials, cookies, tokens, or raw database errors in a ticket.
6. Log out and confirm `/admin` redirects to `/admin/login`.

No dedicated health endpoint is needed: `/` is public, non-mutating, and already
verifies the application plus a safe database read.

## 10. Pre-exposure security checklist

- HTTPS is mandatory and HTTP redirects to HTTPS.
- The reverse proxy/load balancer applies login and POST rate limits. The app
  intentionally has no distributed rate-limit store, so this edge control is a
  launch requirement.
- Only the intended origin/host reaches the app; if a proxy changes Server
  Action origins, configure a narrow `serverActions.allowedOrigins` value after
  testing rather than disabling origin checks.
- Database and backup access are restricted and credentials are rotated from
  development/E2E values.
- Admin and order cookies show the expected `HttpOnly`, production `Secure`, and
  intentional `SameSite=Lax` attributes.
- E2E credentials are ephemeral and never reused for production.
- Production browser source maps remain disabled (the Next.js default in the
  current `next.config.ts`). No debug/test Route Handlers exist.
- Run the complete launch gates listed in this document on the release revision.

## 11. Rollback and incident response

Prisma does not provide an automatic down-migration workflow. On an incident:

1. Stop or restrict traffic if continued writes could cause harm.
2. Preserve the database and logs; take another backup if doing so is safe.
3. Roll the application back to a previously verified Git revision when its
   code remains compatible with the deployed schema.
4. Repair database changes with a reviewed forward migration, or restore a
   verified backup only after a deliberate recovery decision and an accepted
   data-loss window.
5. Never casually edit, delete, or mark an applied migration as resolved.

Do not restore over production as an experiment.

## 12. Backup restore drill

Run the provided verification only against the approved loopback development
PostgreSQL source (`my_group_buying_dev` on port 5433) or the CI source. Set
`DATABASE_URL` to that local source—not production—then provide a dump copied to
the local machine:

```powershell
npm run db:backup:verify -- D:\secure-backups\my-group-buying\my-group-buying-<timestamp>.dump
```

The script creates a uniquely named disposable sibling database, restores with
`pg_restore --exit-on-error --no-owner --no-privileges`, runs `prisma migrate
status`, counts successful migrations, Orders, and Users, then force-removes only
the database created by that invocation. It refuses production/non-loopback
source URLs through the same guard used by the E2E runner.

For an actual recovery, first restore to an isolated database, compare expected
record counts and representative orders, and obtain explicit approval for any
production cutover. A successful `pg_dump` alone is not proof of recoverability.

## 13. Never commit

- `.env`, `.env.local`, `.env.production`, or any other real environment file.
- Real `DATABASE_URL` values, passwords, production credentials, session/order
  tokens, password hashes, token hashes, or hashes derived from real credentials.
- PostgreSQL dumps (`backups/`, `*.dump`, `*.backup`) or restore work files.
- Playwright reports/test results, generated Prisma client output, `.next`, logs,
  or other generated runtime artifacts.

`.env.example` is intentionally tracked and contains development-only examples.

## Exact beta launch sequence

1. Inject production `DATABASE_URL`; confirm the sanitized target.
2. Check out the reviewed revision and ensure `git status --short` is empty.
3. Run `npm ci` and `npx prisma generate`.
4. Run the backup command and preserve its printed path.
5. Run `npx prisma migrate status`; stop on unexpected state.
6. Run `npx prisma migrate deploy`, then `npx prisma migrate status` again.
7. If and only if there is no User, run the production Admin bootstrap.
8. Run `npm run build`, then start with `npm run start`.
9. Complete the non-destructive smoke and security checklists before opening
   traffic.
10. Schedule backups and a recurring disposable restore drill appropriate to
    the beta's acceptable data-loss window.
