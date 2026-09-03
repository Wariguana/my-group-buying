<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules

## Project

This is a personal group-buying operations system.

- Current stack: Next.js App Router, TypeScript strict, Tailwind CSS, npm.
- Planned stack: Prisma, PostgreSQL, Zod, Vitest, Playwright.

## Scope Control

- Make the smallest change required for the task.
- Do not refactor unrelated code.
- Do not rename or move unrelated files.
- Do not install, remove, or upgrade dependencies unless explicitly requested.
- Do not redesign architecture unless explicitly requested.
- Reuse existing patterns and components before creating new abstractions.
- If requirements conflict with existing project rules, stop and report the conflict instead of guessing.

## Database Safety

- Never access or modify a production database.
- Never run destructive database commands against production.
- Never run `prisma migrate reset` or `prisma db push` against production.
- Do not modify the Prisma schema unless the task explicitly allows schema changes.
- Never modify an already-applied migration.
- When schema changes are introduced, preserve existing data whenever possible.

## Server and Security

- Treat all client input as untrusted.
- Authentication and authorization must be enforced server-side; UI visibility is not authorization.
- Prices, costs, totals, roles, ownership, payment status, and business status must never be trusted directly from the client.
- Validate external input using the project's validation layer.
- Never expose secrets or server-only environment variables to client code.
- Only intentionally public browser variables may use `NEXT_PUBLIC_`.

## Business Data

- Historical transaction data must remain historically correct.
- Mutable current Product values must not silently alter historical order values.
- Financial calculations must use authoritative server-side data.

## UI

- Reuse the existing design system and patterns.
- Do not redesign unrelated screens.
- Maintain responsive behavior.
- Forms must have appropriate loading, error, and disabled states.
- Destructive operations require confirmation.

## Verification

Before reporting a coding task as complete, run the checks relevant to that task. Once available, expected checks include `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`. If Prisma changes, run `npx prisma validate`; if an affected E2E flow exists, run `npm run test:e2e`. Never claim a command passed unless it was actually executed.

## Final Report

For implementation tasks, report what changed, files changed, database or schema changes, tests changed or added, commands actually executed and their results, and remaining risks or manual checks.
