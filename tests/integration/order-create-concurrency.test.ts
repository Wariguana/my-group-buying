// @vitest-environment node

import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { validateE2eTargetDatabaseUrl } from "../../scripts/lib/e2e-database";
import { formatTaipeiOrderDate, ORDER_NUMBER_PATTERN } from "@/lib/orders/order-number";

vi.mock("server-only", () => ({}));

const shouldRun = process.env.ORDER_INTEGRATION_TEST === "1";
const databaseUrl = process.env.DATABASE_URL;
if (shouldRun) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for order integration tests.");
  validateE2eTargetDatabaseUrl(databaseUrl);
}
const integrationSuite = shouldRun ? describe : describe.skip;

type TrackedRequest<T> = Readonly<{
  original: Promise<T>;
  settled: Promise<PromiseSettledResult<T>>;
}>;

class RequestDeadlineError extends Error {
  constructor(label: string) {
    super(`Timed out waiting for ${label}.`);
    this.name = "RequestDeadlineError";
  }
}

class RequestCleanupError extends AggregateError {
  constructor(
    label: string,
    errors: readonly unknown[],
    readonly requestsSettled: boolean,
  ) {
    super(errors, `Failed to safely finish ${label}.`);
    this.name = "RequestCleanupError";
  }
}

function trackRequest<T>(original: Promise<T>): TrackedRequest<T> {
  const settled: Promise<PromiseSettledResult<T>> = original.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
  return { original, settled };
}

async function withDeadline<T>(
  request: Promise<T>,
  label: string,
  milliseconds = 10_000,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new RequestDeadlineError(label)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function awaitTrackedRequests(
  requests: readonly Readonly<{ settled: Promise<PromiseSettledResult<unknown>> }>[],
  label: string,
  options: Readonly<{
    timeoutMilliseconds?: number;
    recoveryTimeoutMilliseconds?: number;
    recover: () => Promise<void>;
  }>,
): Promise<PromiseSettledResult<unknown>[]> {
  const allSettled = Promise.all(requests.map(({ settled }) => settled));
  try {
    return await withDeadline(
      allSettled,
      `${label} original requests to settle`,
      options.timeoutMilliseconds ?? 3_000,
    );
  } catch (initialError) {
    const errors: unknown[] = [initialError];
    try {
      await options.recover();
    } catch (recoveryError) {
      errors.push(recoveryError);
    }

    try {
      await withDeadline(
        allSettled,
        `${label} original requests after targeted recovery`,
        options.recoveryTimeoutMilliseconds ?? 2_000,
      );
      throw new RequestCleanupError(label, errors, true);
    } catch (finalError) {
      if (finalError instanceof RequestCleanupError) throw finalError;
      errors.push(finalError);
      throw new RequestCleanupError(label, errors, false);
    }
  }
}

const CONTROL_STATEMENT_TIMEOUT_MS = 3_000;
const CONTROL_LOCK_TIMEOUT_MS = 2_000;
const CONTROL_IDLE_TRANSACTION_TIMEOUT_MS = 15_000;
const CONTROL_CLOSE_TIMEOUT_MS = 1_000;

async function configureControlTimeouts(control: Pick<Client, "query">): Promise<void> {
  await control.query(`
    SET statement_timeout = '${CONTROL_STATEMENT_TIMEOUT_MS}ms';
    SET lock_timeout = '${CONTROL_LOCK_TIMEOUT_MS}ms';
    SET idle_in_transaction_session_timeout = '${CONTROL_IDLE_TRANSACTION_TIMEOUT_MS}ms';
  `);
}

async function closeControlConnection(
  control: Pick<Client, "connection" | "end">,
  label: string,
  milliseconds = CONTROL_CLOSE_TIMEOUT_MS,
): Promise<void> {
  let timedOut = false;
  const closeResult = control.end().then(
    () => ({ status: "closed" as const }),
    (error: unknown) => ({ status: "failed" as const, error }),
  );
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      closeResult,
      new Promise<
        { status: "timed-out" } | { status: "failed"; error: unknown }
      >((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          try {
            control.connection.stream.destroy();
            resolve({ status: "timed-out" });
          } catch (error) {
            resolve({ status: "failed", error });
          }
        }, milliseconds);
      }),
    ]);
    if (result.status === "failed") throw result.error;
    if (timedOut || result.status === "timed-out") {
      throw new RequestDeadlineError(`${label} control connection to close`);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function finishControlledRequests(options: Readonly<{
  label: string;
  primaryError: unknown;
  requests: readonly Readonly<{ settled: Promise<PromiseSettledResult<unknown>> }>[];
  releaseBarrier: () => Promise<void>;
  recoverRequests: () => Promise<void>;
  removeBarrier?: () => Promise<void>;
  closeControl: () => Promise<void>;
  markUnsafe: (error: unknown) => void;
  requestTimeoutMilliseconds?: number;
  recoveryTimeoutMilliseconds?: number;
}>): Promise<void> {
  const cleanupErrors: unknown[] = [];
  let requestsSettled = false;

  const cleanupStep = async (
    label: string,
    step: () => Promise<void>,
    blocksReset: boolean,
  ) => {
    try {
      await step();
    } catch (error) {
      const wrapped = new AggregateError([error], label);
      cleanupErrors.push(wrapped);
      if (blocksReset) options.markUnsafe(wrapped);
    }
  };

  try {
    await cleanupStep(`Failed to release ${options.label}.`, options.releaseBarrier, true);
  } finally {
    try {
      try {
        await awaitTrackedRequests(options.requests, options.label, {
          timeoutMilliseconds: options.requestTimeoutMilliseconds,
          recoveryTimeoutMilliseconds: options.recoveryTimeoutMilliseconds,
          recover: options.recoverRequests,
        });
        requestsSettled = true;
      } catch (error) {
        requestsSettled = error instanceof RequestCleanupError && error.requestsSettled;
        cleanupErrors.push(error);
        if (!requestsSettled) options.markUnsafe(error);
      }
    } finally {
      try {
        if (requestsSettled && options.removeBarrier) {
          await cleanupStep(`Failed to remove ${options.label}.`, options.removeBarrier, true);
        }
      } finally {
        await cleanupStep(
          `Failed to close ${options.label} control connection.`,
          options.closeControl,
          true,
        );
      }
    }
  }

  if (options.primaryError !== undefined && cleanupErrors.length) {
    throw new AggregateError(
      [options.primaryError, ...cleanupErrors],
      `${options.label} failed and cleanup also failed.`,
    );
  }
  if (options.primaryError !== undefined) throw options.primaryError;
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, `${options.label} cleanup failed.`);
}

function assertEnvironmentSafeForReset(unsafeEnvironmentErrors: readonly unknown[]): void {
  if (unsafeEnvironmentErrors.length) {
    throw new AggregateError(
      unsafeEnvironmentErrors,
      "Refusing to reset the database after an earlier concurrency test could not be safely cleaned up.",
    );
  }
}

test("request cleanup waits for the original request after its deadline wrapper rejects", async () => {
  let finishOriginal!: (value: string) => void;
  const original = new Promise<string>((resolve) => {
    finishOriginal = resolve;
  });
  const tracked = trackRequest(original);
  let originalSettled = false;
  void tracked.settled.then(() => {
    originalSettled = true;
  });

  await expect(withDeadline(tracked.original, "the short wrapper", 0))
    .rejects.toBeInstanceOf(RequestDeadlineError);
  expect(originalSettled).toBe(false);

  finishOriginal("finished after barrier release");
  await expect(awaitTrackedRequests([tracked], "the regression request", {
    timeoutMilliseconds: 100,
    recoveryTimeoutMilliseconds: 100,
    recover: async () => undefined,
  })).resolves.toEqual([{ status: "fulfilled", value: "finished after barrier release" }]);
  expect(originalSettled).toBe(true);
});

test("unsafe cleanup skips barrier removal and blocks the next database reset", async () => {
  let finishOriginal!: () => void;
  const tracked = trackRequest(new Promise<void>((resolve) => {
    finishOriginal = resolve;
  }));
  const events: string[] = [];
  const unsafeEnvironmentErrors: unknown[] = [];

  await expect(finishControlledRequests({
    label: "the unsettled request regression",
    primaryError: undefined,
    requests: [tracked],
    releaseBarrier: async () => {
      events.push("release");
    },
    recoverRequests: async () => {
      events.push("recover");
    },
    removeBarrier: async () => {
      events.push("remove");
    },
    closeControl: async () => {
      events.push("close");
    },
    markUnsafe: (error) => unsafeEnvironmentErrors.push(error),
    requestTimeoutMilliseconds: 0,
    recoveryTimeoutMilliseconds: 0,
  })).rejects.toBeInstanceOf(AggregateError);

  expect(events).toEqual(["release", "recover", "close"]);
  expect(unsafeEnvironmentErrors).toHaveLength(1);
  expect(() => assertEnvironmentSafeForReset(unsafeEnvironmentErrors)).toThrow(AggregateError);

  finishOriginal();
  await tracked.settled;
});

test("barrier removal failure still closes control and blocks the next database reset", async () => {
  const events: string[] = [];
  const unsafeEnvironmentErrors: unknown[] = [];
  const primaryError = new Error("injected primary failure");
  const removeError = new Error("injected barrier removal failure");

  await expect(finishControlledRequests({
    label: "the removal regression",
    primaryError,
    requests: [trackRequest(Promise.resolve())],
    releaseBarrier: async () => {
      events.push("release");
    },
    recoverRequests: async () => {
      events.push("recover");
    },
    removeBarrier: async () => {
      events.push("remove");
      throw removeError;
    },
    closeControl: async () => {
      events.push("close");
    },
    markUnsafe: (error) => unsafeEnvironmentErrors.push(error),
  })).rejects.toMatchObject({
    errors: [
      primaryError,
      expect.objectContaining({ errors: [removeError] }),
    ],
  });

  expect(events).toEqual(["release", "remove", "close"]);
  expect(unsafeEnvironmentErrors).toHaveLength(1);
  expect(() => assertEnvironmentSafeForReset(unsafeEnvironmentErrors)).toThrow(AggregateError);
});

test("successful controlled cleanup preserves release, settle, remove, close order", async () => {
  let finishOriginal!: () => void;
  const events: string[] = [];
  const tracked = trackRequest(new Promise<void>((resolve) => {
    finishOriginal = resolve;
  }));
  void tracked.settled.then(() => {
    events.push("requests settled");
  });
  const recoverRequests = vi.fn(async () => undefined);
  const unsafeEnvironmentErrors: unknown[] = [];

  await expect(finishControlledRequests({
    label: "the successful cleanup regression",
    primaryError: undefined,
    requests: [tracked],
    releaseBarrier: async () => {
      events.push("release");
      finishOriginal();
    },
    recoverRequests,
    removeBarrier: async () => {
      events.push("remove");
    },
    closeControl: async () => {
      events.push("close");
    },
    markUnsafe: (error) => unsafeEnvironmentErrors.push(error),
  })).resolves.toBeUndefined();

  expect(events).toEqual(["release", "requests settled", "remove", "close"]);
  expect(recoverRequests).not.toHaveBeenCalled();
  expect(unsafeEnvironmentErrors).toEqual([]);
  expect(() => assertEnvironmentSafeForReset(unsafeEnvironmentErrors)).not.toThrow();
});

test("control cleanup uses session deadlines and forcibly closes only its own timed-out socket", async () => {
  const query = vi.fn(async (_sql: string) => undefined);
  await configureControlTimeouts({ query } as unknown as Pick<Client, "query">);
  expect(query).toHaveBeenCalledOnce();
  expect(query.mock.calls[0]?.[0]).toContain(`statement_timeout = '${CONTROL_STATEMENT_TIMEOUT_MS}ms'`);
  expect(query.mock.calls[0]?.[0]).toContain(`lock_timeout = '${CONTROL_LOCK_TIMEOUT_MS}ms'`);
  expect(query.mock.calls[0]?.[0]).toContain(
    `idle_in_transaction_session_timeout = '${CONTROL_IDLE_TRANSACTION_TIMEOUT_MS}ms'`,
  );

  let finishClose!: () => void;
  const end = vi.fn(() => new Promise<void>((resolve) => {
    finishClose = resolve;
  }));
  const destroy = vi.fn(() => finishClose());
  const control = {
    end,
    connection: { stream: { destroy } },
  } as unknown as Pick<Client, "connection" | "end">;

  await expect(closeControlConnection(control, "the bounded close regression", 0))
    .rejects.toBeInstanceOf(RequestDeadlineError);
  expect(end).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

const groupBuyId = "10000000-0000-4000-8000-000000000001";
const pickupLocationId = "20000000-0000-4000-8000-000000000001";
const groupBuyPickupId = "30000000-0000-4000-8000-000000000001";
const productAId = "40000000-0000-4000-8000-000000000001";
const productBId = "40000000-0000-4000-8000-000000000002";
const itemAId = "50000000-0000-4000-8000-00000000000a";
const itemBId = "50000000-0000-4000-8000-00000000000b";
const adminId = "60000000-0000-4000-8000-000000000001";
const otherAdminId = "60000000-0000-4000-8000-000000000002";
const pendingImageAId = "70000000-0000-4000-8000-000000000001";
const pendingImageBId = "70000000-0000-4000-8000-000000000002";

integrationSuite("createOrder PostgreSQL transaction and concurrency", () => {
  type Db = ReturnType<typeof import("@/lib/db")["getDb"]>;
  type CreateOrder = typeof import("@/lib/orders/service")["createOrder"];
  type CancelOrder = typeof import("@/lib/orders/cancel-service")["cancelOrder"];
  type CancelOrderAsAdmin = typeof import("@/lib/orders/cancel-service")["cancelOrderAsAdmin"];
  type UpdateGroupBuy = typeof import("@/lib/group-buys/service")["updateGroupBuyDraft"];
  let db: Db;
  let createOrder: CreateOrder;
  let cancelOrder: CancelOrder;
  let cancelOrderAsAdmin: CancelOrderAsAdmin;
  let updateGroupBuy: UpdateGroupBuy;
  let payment: typeof import("@/lib/orders/payment-service")["markOrderPaidAsAdmin"];
  let pickup: typeof import("@/lib/orders/pickup-service")["markOrderPickedUpAsAdmin"];
  const unsafeEnvironmentErrors: unknown[] = [];

  async function resetDatabase() {
    await db.orderItem.deleteMany();
    await db.order.deleteMany();
    await db.orderNumberSequence.deleteMany();
    await db.customer.deleteMany();
    await db.pendingGroupBuyImageUpload.deleteMany();
    await db.groupBuyImage.deleteMany();
    await db.groupBuyItem.deleteMany();
    await db.groupBuyPickup.deleteMany();
    await db.groupBuy.deleteMany();
    await db.product.deleteMany();
    await db.pickupLocation.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany();
  }

  async function seedOrderableGroupBuy(options: {
    slug: string;
    stockA: number | null;
    purchaseLimitA: number | null;
    includeB?: boolean;
    stockB?: number | null;
    purchaseLimitB?: number | null;
  }) {
    const referenceNow = new Date();
    await db.pickupLocation.create({
      data: {
        id: pickupLocationId,
        name: "中正取貨點",
        address: "台北市中正區測試路 1 號",
        isActive: true,
      },
    });
    await db.groupBuy.create({
      data: {
        id: groupBuyId,
        slug: options.slug,
        title: "整合測試團購",
        status: "PUBLISHED",
        startAt: new Date(referenceNow.getTime() - 60_000),
        endAt: new Date(referenceNow.getTime() + 60_000),
        publishedAt: referenceNow,
      },
    });
    await db.groupBuyPickup.create({
      data: {
        id: groupBuyPickupId,
        groupBuyId,
        pickupLocationId,
        pickupStartAt: new Date(referenceNow.getTime() + 86_400_000),
        pickupEndAt: new Date(referenceNow.getTime() + 90_000_000),
      },
    });
    await db.product.createMany({ data: [
      {
        id: productAId,
        name: "權威蘋果",
        defaultPrice: 999,
        cost: 51,
        unit: "箱",
        isActive: true,
      },
      ...(options.includeB ? [{
        id: productBId,
        name: "權威橘子",
        defaultPrice: 888,
        cost: 61,
        unit: "袋",
        isActive: true,
      }] : []),
    ] });
    await db.groupBuyItem.createMany({ data: [
      {
        id: itemAId,
        groupBuyId,
        productId: productAId,
        salePrice: 120,
        cost: 70,
        stock: options.stockA,
        purchaseLimit: options.purchaseLimitA,
        isActive: true,
      },
      ...(options.includeB ? [{
        id: itemBId,
        groupBuyId,
        productId: productBId,
        salePrice: 80,
        cost: 60,
        stock: options.stockB ?? null,
        purchaseLimit: options.purchaseLimitB ?? null,
        isActive: true,
      }] : []),
    ] });
  }

  function orderInput(
    phone: string,
    items: { groupBuyItemId: string; expectedUnitPrice?: number; quantity: number }[],
  ) {
    return {
      customerName: `訂購人 ${phone}`,
      customerPhone: phone,
      groupBuyPickupId,
      items: items.map((item) => ({
        ...item,
        expectedUnitPrice: item.expectedUnitPrice
          ?? (item.groupBuyItemId.toLowerCase() === itemAId ? 120 : 80),
      })),
    };
  }

  function groupBuyEditInput(overrides: Record<string, unknown> = {}) {
    const referenceNow = new Date();
    return {
      title: "整合測試團購（已編輯）",
      description: "只影響後續訂單",
      gallery: [],
      startAt: new Date(referenceNow.getTime() - 60_000),
      endAt: new Date(referenceNow.getTime() + 300_000),
      items: [{ productId: productAId, salePrice: 150, stock: 10, purchaseLimit: null }],
      pickups: [{
        pickupLocationId,
        pickupStartAt: new Date(referenceNow.getTime() + 86_400_000),
        pickupEndAt: new Date(referenceNow.getTime() + 90_000_000),
      }],
      ...overrides,
    };
  }

  async function waitForBlockedQuery(
    control: Client,
    queryPattern: string,
    label: string,
  ): Promise<number> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await control.query("SELECT pg_stat_clear_snapshot()");
      const result = await control.query<{ pid: number }>(`SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND query LIKE $1`, [queryPattern]);
      if (result.rows.length === 1) return result.rows[0].pid;
      if (result.rows.length > 1) {
        throw new Error(`Found multiple database sessions while waiting for ${label}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${label}.`);
  }

  async function waitForBlockedOrderTableWriter(control: Client): Promise<number> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = await control.query<{ pid: number }>(`
        SELECT pid
        FROM pg_locks
        WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND relation = '"Order"'::regclass
          AND mode = 'RowExclusiveLock'
          AND granted = false
      `);
      if (result.rows.length === 1) return result.rows[0].pid;
      if (result.rows.length > 1) {
        throw new Error("Found multiple blocked Order table writers; refusing ambiguous cleanup ownership.");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Timed out waiting for the stale Order attempt to reach its table write.");
  }

  async function terminateOwnedBackends(
    control: Client,
    backendPids: ReadonlySet<number>,
    label: string,
  ): Promise<void> {
    if (!databaseUrl) throw new Error("Cannot verify the disposable database before targeted recovery.");
    validateE2eTargetDatabaseUrl(databaseUrl);
    if (backendPids.size === 0) {
      throw new Error(`No owned database backend was observed for ${label}; refusing broad termination.`);
    }

    for (const pid of backendPids) {
      const result = await control.query<{ terminated: boolean }>(`
        SELECT pg_terminate_backend(pid) AS terminated
        FROM pg_stat_activity
        WHERE pid = $1
          AND pid <> pg_backend_pid()
          AND datname = current_database()
          AND backend_type = 'client backend'
      `, [pid]);
      if (result.rows.length === 1 && result.rows[0].terminated !== true) {
        throw new Error(`PostgreSQL refused to terminate owned backend ${pid} for ${label}.`);
      }
    }
  }

  beforeAll(async () => {
    const modules = await Promise.all([
      import("@/lib/db"),
      import("@/lib/orders/service"),
      import("@/lib/orders/cancel-service"),
      import("@/lib/group-buys/service"),
    ]);
    db = modules[0].getDb();
    createOrder = modules[1].createOrder;
    cancelOrder = modules[2].cancelOrder;
    cancelOrderAsAdmin = modules[2].cancelOrderAsAdmin;
    updateGroupBuy = modules[3].updateGroupBuyDraft;
    payment = (await import("@/lib/orders/payment-service")).markOrderPaidAsAdmin;
    pickup = (await import("@/lib/orders/pickup-service")).markOrderPickedUpAsAdmin;
  });

  beforeEach(async () => {
    assertEnvironmentSafeForReset(unsafeEnvironmentErrors);
    await resetDatabase();
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  test("migration deterministically backfills legacy Orders and seeds Taipei daily maxima", async () => {
    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    const schema = "order_number_migration_test";
    try {
      await control.query(`CREATE SCHEMA "${schema}"`);
      await control.query(`SET search_path TO "${schema}"`);
      await control.query(`CREATE TABLE "Order" (
        "id" uuid PRIMARY KEY,
        "createdAt" timestamptz(3) NOT NULL
      )`);
      await control.query(`INSERT INTO "Order" ("id", "createdAt") VALUES
        ('00000000-0000-4000-8000-000000000004', '2026-09-16T16:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000001', '2026-09-16T15:59:59.999Z'),
        ('00000000-0000-4000-8000-000000000003', '2026-09-16T16:00:00.000Z'),
        ('00000000-0000-4000-8000-000000000002', '2026-09-16T16:00:00.000Z')`);
      const migrationSql = await readFile(
        new URL("../../prisma/migrations/20260918090000_add_order_number/migration.sql", import.meta.url),
        "utf8",
      );
      await control.query(migrationSql);

      expect((await control.query(`SELECT "id", "orderNumber" FROM "Order" ORDER BY "id"`)).rows).toEqual([
        { id: "00000000-0000-4000-8000-000000000001", orderNumber: "202609160001" },
        { id: "00000000-0000-4000-8000-000000000002", orderNumber: "202609170001" },
        { id: "00000000-0000-4000-8000-000000000003", orderNumber: "202609170002" },
        { id: "00000000-0000-4000-8000-000000000004", orderNumber: "202609170003" },
      ]);
      expect((await control.query(`SELECT * FROM "OrderNumberSequence" ORDER BY "dateKey"`)).rows).toEqual([
        { dateKey: "20260916", lastValue: 1 },
        { dateKey: "20260917", lastValue: 3 },
      ]);
      await expect(control.query(`UPDATE "Order" SET "orderNumber" = 'bad' WHERE "id" = '00000000-0000-4000-8000-000000000001'`)).rejects.toMatchObject({ code: "23514" });
      await expect(control.query(`UPDATE "Order" SET "orderNumber" = '202609170001' WHERE "id" = '00000000-0000-4000-8000-000000000001'`)).rejects.toMatchObject({ code: "23505" });
      await expect(control.query(`INSERT INTO "Order" ("id", "createdAt") VALUES ('00000000-0000-4000-8000-000000000005', now())`)).rejects.toMatchObject({ code: "23502" });
    } finally {
      await control.query("RESET search_path");
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await control.end();
    }
  });

  test("published edits preserve historical snapshots and affect future Orders", async () => {
    const slug = "gb-0000000000000040";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    await db.groupBuyImage.create({ data: { groupBuyId, imageUrl: "https://legacy.example/cover.jpg", storageKey: null, sortOrder: 0 } });
    const first = await createOrder(slug, orderInput("0912-440-001", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    const historical = await db.order.findUniqueOrThrow({ where: { publicCode: first.publicCode }, include: { items: true } });
    const nextPickupStart = new Date(Date.now() + 172_800_000);
    const nextPickupEnd = new Date(nextPickupStart.getTime() + 3_600_000);

    await expect(updateGroupBuy(groupBuyId, groupBuyEditInput({
      items: [{ productId: productAId, salePrice: 175, stock: 9, purchaseLimit: 4 }],
      pickups: [{ pickupLocationId, pickupStartAt: nextPickupStart, pickupEndAt: nextPickupEnd }],
    }))).resolves.toEqual({ ok: true, value: { id: groupBuyId } });

    expect(await db.order.findUniqueOrThrow({ where: { publicCode: first.publicCode }, include: { items: true } })).toEqual(historical);
    expect(await db.groupBuyImage.count({ where: { groupBuyId } })).toBe(0);
    await expect(createOrder(slug, orderInput("0912-440-002", [{ groupBuyItemId: itemAId, quantity: 2 }])))
      .rejects.toMatchObject({ code: "PRICE_CHANGED" });
    expect(await db.order.count()).toBe(1);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(9);
    const second = await createOrder(slug, orderInput("0912-440-002", [{ groupBuyItemId: itemAId, expectedUnitPrice: 175, quantity: 2 }]));
    const future = await db.order.findUniqueOrThrow({ where: { publicCode: second.publicCode }, include: { items: true } });
    expect(future).toMatchObject({ pickupStartAt: nextPickupStart, pickupEndAt: nextPickupEnd, totalAmount: 350 });
    expect(future.items).toEqual([expect.objectContaining({ unitPrice: 175, quantity: 2 })]);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(7);
  });

  test("pending gallery uploads attach in order, consume atomically, and cannot cross Admins or be reused", async () => {
    const { createGroupBuyDraft } = await import("@/lib/group-buys/service");
    await db.user.createMany({ data: [
      { id: adminId, email: "gallery-admin@example.invalid", passwordHash: "test" },
      { id: otherAdminId, email: "gallery-other@example.invalid", passwordHash: "test" },
    ] });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.pendingGroupBuyImageUpload.createMany({ data: [
      { id: pendingImageAId, adminUserId: adminId, storageKey: "group-buys/a.webp", imageUrl: "https://images.example/a.webp", byteSize: 10, mimeType: "image/webp", expiresAt },
      { id: pendingImageBId, adminUserId: adminId, storageKey: "group-buys/b.webp", imageUrl: "https://images.example/b.webp", byteSize: 11, mimeType: "image/webp", expiresAt },
    ] });
    const base = {
      title: "圖片整合測試",
      description: null,
      startAt: new Date(Date.now() - 60_000),
      endAt: new Date(Date.now() + 60_000),
      items: [],
      pickups: [],
    };
    const created = await createGroupBuyDraft({ ...base, gallery: [
      { kind: "pending", uploadId: pendingImageBId },
      { kind: "pending", uploadId: pendingImageAId },
    ] }, adminId);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await db.groupBuyImage.findMany({ where: { groupBuyId: created.value.id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { imageUrl: true, sortOrder: true } })).toEqual([
      { imageUrl: "https://images.example/b.webp", sortOrder: 0 },
      { imageUrl: "https://images.example/a.webp", sortOrder: 1 },
    ]);
    expect(await db.pendingGroupBuyImageUpload.count({ where: { id: { in: [pendingImageAId, pendingImageBId] }, consumedAt: { not: null } } })).toBe(2);
    expect(await createGroupBuyDraft({ ...base, title: "不可重用", gallery: [{ kind: "pending", uploadId: pendingImageAId }] }, adminId)).toEqual({ ok: false, error: "IMAGE_UPLOAD_UNAVAILABLE" });

    const otherPendingId = "70000000-0000-4000-8000-000000000003";
    await db.pendingGroupBuyImageUpload.create({ data: { id: otherPendingId, adminUserId: otherAdminId, storageKey: "group-buys/other.webp", imageUrl: "https://images.example/other.webp", byteSize: 12, mimeType: "image/webp", expiresAt } });
    expect(await createGroupBuyDraft({ ...base, title: "不可跨管理員", gallery: [{ kind: "pending", uploadId: otherPendingId }] }, adminId)).toEqual({ ok: false, error: "IMAGE_UPLOAD_UNAVAILABLE" });
    expect((await db.pendingGroupBuyImageUpload.findUniqueOrThrow({ where: { id: otherPendingId } })).consumedAt).toBeNull();
  });

  test("a stale submitted stock value survives a real overlapping allocation without overwriting stock", async () => {
    const slug = "gb-0000000000000041";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    const first = await createOrder(slug, orderInput("0912-441-000", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    const historical = await db.order.findUniqueOrThrow({
      where: { publicCode: first.publicCode },
      include: { items: true },
    });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(9);

    const control = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: CONTROL_STATEMENT_TIMEOUT_MS,
    });
    await control.connect();
    await configureControlTimeouts(control);
    let lockOpen = false;
    let editRequest: TrackedRequest<Awaited<ReturnType<UpdateGroupBuy>>> | undefined;
    let orderRequest: TrackedRequest<Awaited<ReturnType<CreateOrder>>> | undefined;
    let secondOrder: Awaited<ReturnType<CreateOrder>> | undefined;
    const trackedRequests: Readonly<{ settled: Promise<PromiseSettledResult<unknown>> }>[] = [];
    const ownedBackendPids = new Set<number>();
    let primaryError: unknown;
    try {
      await control.query(`
        CREATE FUNCTION block_group_buy_edit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock(441); RETURN NEW; END $$;
        CREATE TRIGGER group_buy_edit_barrier
          BEFORE UPDATE ON "GroupBuy"
          FOR EACH ROW EXECUTE FUNCTION block_group_buy_edit();
      `);
      await control.query("BEGIN");
      lockOpen = true;
      await control.query("SELECT pg_advisory_xact_lock(441)");

      editRequest = trackRequest(updateGroupBuy(groupBuyId, groupBuyEditInput({
        title: "並行編輯已保存",
        description: "庫存表單值過期但文字編輯保留",
        items: [{ productId: productAId, salePrice: 120, stock: 9, purchaseLimit: 4 }],
      })));
      trackedRequests.push(editRequest);
      ownedBackendPids.add(
        await waitForBlockedQuery(control, "%UPDATE%GroupBuy%", "the Admin GroupBuy update lock"),
      );

      orderRequest = trackRequest(
        createOrder(slug, orderInput("0912-441-001", [{ groupBuyItemId: itemAId, quantity: 1 }])),
      );
      trackedRequests.push(orderRequest);
      secondOrder = await withDeadline(orderRequest.original, "the overlapping Order to commit");
      expect(secondOrder).toMatchObject({ status: "PLACED", totalAmount: 120 });

      await control.query("COMMIT");
      lockOpen = false;
      await expect(withDeadline(editRequest.original, "the retried Admin edit"))
        .resolves.toEqual({ ok: true, value: { id: groupBuyId } });
    } catch (error) {
      primaryError = error;
    } finally {
      await finishControlledRequests({
        label: "the stock-test barrier",
        primaryError,
        requests: trackedRequests,
        releaseBarrier: async () => {
          if (!lockOpen) return;
          await control.query("ROLLBACK");
          lockOpen = false;
        },
        recoverRequests: () => terminateOwnedBackends(
          control,
          ownedBackendPids,
          "the stock-test barrier",
        ),
        removeBarrier: async () => {
          await control.query(`
            DROP TRIGGER IF EXISTS group_buy_edit_barrier ON "GroupBuy";
            DROP FUNCTION IF EXISTS block_group_buy_edit();
          `);
        },
        closeControl: () => closeControlConnection(control, "the stock-test barrier"),
        markUnsafe: (error) => unsafeEnvironmentErrors.push(error),
      });
    }
    if (!secondOrder) throw new Error("The overlapping Order did not return a result.");

    expect(await db.order.count()).toBe(2);
    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: first.publicCode },
      include: { items: true },
    })).toEqual(historical);
    const orders = await db.order.findMany({
      where: { publicCode: { in: [first.publicCode, secondOrder.publicCode] } },
      include: { items: true },
    });
    const ordersByPublicCode = new Map(orders.map((order) => [order.publicCode, order]));
    const persistedFirst = ordersByPublicCode.get(first.publicCode);
    const persistedSecond = ordersByPublicCode.get(secondOrder.publicCode);
    expect(persistedFirst).toBeDefined();
    expect(persistedSecond).toBeDefined();
    if (!persistedFirst || !persistedSecond) throw new Error("Expected both committed Orders.");
    const firstDateKey = formatTaipeiOrderDate(persistedFirst.createdAt);
    const secondDateKey = formatTaipeiOrderDate(persistedSecond.createdAt);
    expect(persistedFirst.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(persistedSecond.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(new Set([persistedFirst.orderNumber, persistedSecond.orderNumber])).toHaveLength(2);
    expect(persistedFirst.orderNumber).toBe(`${firstDateKey}0001`);
    expect(persistedSecond.orderNumber).toBe(
      `${secondDateKey}${firstDateKey === secondDateKey ? "0002" : "0001"}`,
    );
    expect([persistedFirst, persistedSecond].map(({ totalAmount, items }) => ({ totalAmount, unitPrice: items[0]?.unitPrice })))
      .toEqual([
        { totalAmount: 120, unitPrice: 120 },
        { totalAmount: 120, unitPrice: 120 },
      ]);
    expect(await db.groupBuy.findUniqueOrThrow({
      where: { id: groupBuyId },
      select: { title: true, description: true },
    })).toEqual({
      title: "並行編輯已保存",
      description: "庫存表單值過期但文字編輯保留",
    });
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId }, select: { stock: true, salePrice: true, purchaseLimit: true } }))
      .toEqual({ stock: 8, salePrice: 120, purchaseLimit: 4 });
  }, 30_000);

  test("an Order committed at 120 keeps its snapshot when the Admin changes the future price to 175", async () => {
    const slug = "gb-0000000000000042";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });

    const created = await createOrder(slug, orderInput("0912-442-001", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    const committedBeforeEdit = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      include: { items: true },
    });
    expect(committedBeforeEdit).toMatchObject({
      orderNumber: expect.stringMatching(/^\d{8}0001$/),
      totalAmount: 120,
      items: [expect.objectContaining({ unitPrice: 120, quantity: 1 })],
    });

    await expect(updateGroupBuy(groupBuyId, groupBuyEditInput({
      title: "訂單先提交，後續價格已更新",
      items: [{ productId: productAId, salePrice: 175, stock: 9, purchaseLimit: null }],
    }))).resolves.toEqual({ ok: true, value: { id: groupBuyId } });

    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      include: { items: true },
    })).toEqual(committedBeforeEdit);
    expect(await db.order.count()).toBe(1);
    expect(await db.groupBuyItem.findUniqueOrThrow({
      where: { id: itemAId },
      select: { stock: true, salePrice: true },
    })).toEqual({ stock: 9, salePrice: 175 });
  });

  test("a retried stale Order rereads the committed price and rejects without side effects", async () => {
    const slug = "gb-0000000000000043";
    const stalePhone = "0912-443-001";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    const before = {
      orders: await db.order.count(),
      orderItems: await db.orderItem.count(),
      customers: await db.customer.count(),
      sequences: await db.orderNumberSequence.count(),
    };

    const control = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: CONTROL_STATEMENT_TIMEOUT_MS,
    });
    await control.connect();
    await configureControlTimeouts(control);
    let lockOpen = false;
    let staleRequest: TrackedRequest<Awaited<ReturnType<CreateOrder>>> | undefined;
    let adminRequest: TrackedRequest<Awaited<ReturnType<UpdateGroupBuy>>> | undefined;
    let staleOutcome: PromiseSettledResult<Awaited<ReturnType<CreateOrder>>> | undefined;
    const trackedRequests: Readonly<{ settled: Promise<PromiseSettledResult<unknown>> }>[] = [];
    const ownedBackendPids = new Set<number>();
    let primaryError: unknown;
    try {
      await control.query("BEGIN");
      lockOpen = true;
      await control.query('LOCK TABLE "Order" IN SHARE MODE');

      staleRequest = trackRequest(
        createOrder(slug, orderInput(stalePhone, [{ groupBuyItemId: itemAId, quantity: 1 }])),
      );
      trackedRequests.push(staleRequest);
      ownedBackendPids.add(await waitForBlockedOrderTableWriter(control));

      adminRequest = trackRequest(updateGroupBuy(groupBuyId, groupBuyEditInput({
        title: "價格已先提交",
        items: [{ productId: productAId, salePrice: 175, stock: 10, purchaseLimit: null }],
      })));
      trackedRequests.push(adminRequest);
      await expect(withDeadline(adminRequest.original, "the Admin price edit to commit"))
        .resolves.toEqual({ ok: true, value: { id: groupBuyId } });

      await control.query("COMMIT");
      lockOpen = false;
      staleOutcome = await withDeadline(staleRequest.settled, "the stale Order retry to finish");
    } catch (error) {
      primaryError = error;
    } finally {
      await finishControlledRequests({
        label: "the price-test Order table lock",
        primaryError,
        requests: trackedRequests,
        releaseBarrier: async () => {
          if (!lockOpen) return;
          await control.query("ROLLBACK");
          lockOpen = false;
        },
        recoverRequests: () => terminateOwnedBackends(
          control,
          ownedBackendPids,
          "the price-test Order table lock",
        ),
        closeControl: () => closeControlConnection(control, "the price-test Order table lock"),
        markUnsafe: (error) => unsafeEnvironmentErrors.push(error),
      });
    }

    expect(staleOutcome).toMatchObject({ status: "rejected", reason: { code: "PRICE_CHANGED" } });
    expect({
      orders: await db.order.count(),
      orderItems: await db.orderItem.count(),
      customers: await db.customer.count(),
      sequences: await db.orderNumberSequence.count(),
    }).toEqual(before);
    expect(await db.customer.count({ where: { phone: "+886912443001" } })).toBe(0);
    expect(await db.groupBuyItem.findUniqueOrThrow({
      where: { id: itemAId },
      select: { stock: true, salePrice: true },
    })).toEqual({ stock: 10, salePrice: 175 });

    const confirmed = await createOrder(slug, orderInput(stalePhone, [{
      groupBuyItemId: itemAId,
      expectedUnitPrice: 175,
      quantity: 2,
    }]));
    expect(confirmed).toMatchObject({
      orderNumber: expect.stringMatching(/^\d{8}0001$/),
      totalAmount: 350,
    });
    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: confirmed.publicCode },
      include: { items: true },
    })).toMatchObject({
      totalAmount: 350,
      items: [expect.objectContaining({ unitPrice: 175, quantity: 2 })],
    });
    expect(await db.orderNumberSequence.findFirstOrThrow()).toMatchObject({ lastValue: 1 });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(8);
  }, 30_000);

  test.each([
    ["pickup", "pickup"],
    ["admin", "pickup"], ["pickup", "admin"],
    ["customer", "pickup"], ["pickup", "customer"],
  ] as const)("real row-lock race: %s wins ahead of %s", async (first, second) => {
    const slug = "gb-0000000000000020";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput("0912-222-333", [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    // Keep the customer policy open even on slower CI hosts.
    await db.groupBuy.update({ where: { id: groupBuyId }, data: { endAt: new Date(Date.now() + 300_000) } });
    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let locked = false;
    const requests: Promise<unknown>[] = [];
    let results: PromiseSettledResult<unknown>[] = [];
    const run = (actor: string) => actor === "pickup" ? pickup(created.publicCode)
      : actor === "admin" ? cancelOrderAsAdmin(created.publicCode)
      : cancelOrder(created.publicCode, created.accessToken);
    async function waitFor(event: string) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await control.query("SELECT pg_stat_clear_snapshot()");
        const result = await control.query(`SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND wait_event = $1 AND query LIKE '%UPDATE%Order%'`, [event]);
        if (result.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Expected real PostgreSQL ${event} waiter`);
    }
    try {
      // Test-only audit counts committed Order writes, including accidental duplicate writes.
      await control.query(`CREATE TABLE pickup_write_count (n int);
        CREATE FUNCTION count_pickup_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO pickup_write_count VALUES (1); RETURN NEW; END $$;
        CREATE TRIGGER pickup_write_counter AFTER UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION count_pickup_write();`);
      await control.query("BEGIN");
      locked = true;
      await control.query('SELECT id FROM "Order" WHERE "publicCode" = $1 FOR UPDATE', [created.publicCode]);
      requests.push(run(first));
      // First updater owns the tuple lock while waiting on our transaction.
      await waitFor("transactionid");
      requests.push(run(second));
      // Second updater queues behind that tuple lock, after its authoritative read.
      await waitFor("tuple");
      await control.query("COMMIT");
      locked = false;
      results = await Promise.allSettled(requests);
      expect(results[0].status).toBe("fulfilled");
      if (first === second) {
        expect(results[1]).toEqual(results[0]);
      } else {
        expect(results[1]).toMatchObject({ status: "rejected", reason: { code: first === "pickup" ? "ALREADY_PICKED_UP" : "CANCELLED" } });
      }
      expect((await control.query("SELECT count(*)::int AS count FROM pickup_write_count")).rows[0].count).toBe(1);
      const order = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } });
      expect(order.status).toBe(first === "pickup" ? "PLACED" : "CANCELLED");
      if (first === "pickup") {
        expect(order.pickedUpAt).not.toBeNull();
        expect(order.cancelledAt).toBeNull();
        await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
        expect((results[0] as PromiseFulfilledResult<{ pickedUpAt: Date }>).value.pickedUpAt).toEqual(order.pickedUpAt);
      } else {
        expect(order.pickedUpAt).toBeNull();
        expect(order.cancelledAt).not.toBeNull();
      }
      expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } }))
        .toEqual([{ stock: first === "pickup" ? 7 : 10 }, { stock: null }]);
    } finally {
      if (locked) await control.query("ROLLBACK");
      await Promise.allSettled(requests);
      await control.query('DROP TRIGGER IF EXISTS pickup_write_counter ON "Order"; DROP FUNCTION IF EXISTS count_pickup_write(); DROP TABLE IF EXISTS pickup_write_count;');
      await control.end();
    }
  }, 20_000);

  test("pickup preserves allocation, legacy access and all snapshots after master data changes", async () => {
    const slug = "gb-0000000000000021";
    const phone = "0912-222-334";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    await db.order.update({ where: { publicCode: created.publicCode }, data: { accessTokenHash: null } });
    const before = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    await db.product.update({ where: { id: productAId }, data: { name: "edited", unit: "edited", defaultPrice: 1, isActive: false } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { name: "edited", address: "edited", isActive: false } });
    await db.groupBuyPickup.update({ where: { id: groupBuyPickupId }, data: { pickupStartAt: null, pickupEndAt: null } });
    const result = await pickup(created.publicCode);
    const after = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    expect(after).toEqual({ ...before, pickedUpAt: result.pickedUpAt, updatedAt: after.updatedAt });
    await expect(pickup(created.publicCode)).resolves.toEqual(result);
    expect((await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } })).updatedAt).toEqual(after.updatedAt);
    const access = await import("@/lib/orders/admin-service");
    const detail = await access.getAdminOrderByPublicCode(created.publicCode);
    expect(detail).toMatchObject({ ok: true, value: { pickupName: before.pickupName, pickupAddress: before.pickupAddress, pickedUpAt: result.pickedUpAt, items: expect.arrayContaining([expect.objectContaining({ productName: "權威蘋果" }), expect.objectContaining({ productName: "權威橘子" })]) } });
    await db.product.update({ where: { id: productAId }, data: { isActive: true } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { isActive: true } });
    await expect(createOrder(slug, orderInput(phone, [{ groupBuyItemId: itemAId, quantity: 1 }])))
      .rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } })).toEqual([{ stock: 7 }, { stock: null }]);
  });

  test("persists authoritative snapshots and allocates finite stock on the happy path", async () => {
    const slug = "gb-0000000000000001";
    await seedOrderableGroupBuy({
      slug,
      stockA: 5,
      purchaseLimitA: 4,
      includeB: true,
      stockB: null,
      purchaseLimitB: null,
    });

    expect(itemAId.toUpperCase()).not.toBe(itemAId);
    const result = await createOrder(slug, orderInput("0912-345-678", [
      { groupBuyItemId: itemBId.toUpperCase(), quantity: 2 },
      { groupBuyItemId: itemAId.toUpperCase(), quantity: 1 },
    ]));
    const customer = await db.customer.findUniqueOrThrow({ where: { phone: "+886912345678" } });
    const order = await db.order.findUniqueOrThrow({
      where: { publicCode: result.publicCode },
      include: { items: { orderBy: { groupBuyItemId: "asc" } } },
    });
    const stocks = await db.groupBuyItem.findMany({
      where: { id: { in: [itemAId, itemBId] } },
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    });

    expect(await db.customer.count({ where: { phone: "+886912345678" } })).toBe(1);
    expect(order).toMatchObject({
      orderNumber: expect.stringMatching(/^\d{12}$/),
      status: "PLACED",
      groupBuyId,
      groupBuyPickupId,
      customerId: customer.id,
      customerName: "訂購人 0912-345-678",
      customerPhone: "+886912345678",
      pickupName: "中正取貨點",
      pickupAddress: "台北市中正區測試路 1 號",
      totalAmount: 280,
    });
    expect(order.accessTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.accessToken).not.toBe(order.accessTokenHash);
    expect(order.accessTokenHash).toBe(
      createHash("sha256").update(result.accessToken, "utf8").digest("hex"),
    );
    expect(order.items).toEqual([
      expect.objectContaining({
        groupBuyItemId: itemAId,
        productName: "權威蘋果",
        unit: "箱",
        unitPrice: 120,
        quantity: 1,
      }),
      expect.objectContaining({
        groupBuyItemId: itemBId,
        productName: "權威橘子",
        unit: "袋",
        unitPrice: 80,
        quantity: 2,
      }),
    ]);
    expect(order.items.every((line) => !("cost" in line))).toBe(true);
    expect(stocks).toEqual([{ id: itemAId, stock: 4 }, { id: itemBId, stock: null }]);
    expect(result).toEqual({
      publicCode: order.publicCode,
      orderNumber: order.orderNumber,
      status: "PLACED",
      totalAmount: 280,
      accessToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(Object.keys(result).sort()).toEqual(["accessToken", "orderNumber", "publicCode", "status", "totalAmount"]);
  });

  test("allocates distinct increasing human order numbers for concurrent Orders", async () => {
    const slug = "gb-0000000000000060";
    await seedOrderableGroupBuy({ slug, stockA: null, purchaseLimitA: null });

    const results = await Promise.all([
      createOrder(slug, orderInput("0912-600-001", [{ groupBuyItemId: itemAId, quantity: 1 }])),
      createOrder(slug, orderInput("0912-600-002", [{ groupBuyItemId: itemAId, quantity: 1 }])),
    ]);
    const numbers = results.map(({ orderNumber }) => orderNumber).sort();
    expect(numbers[0]).toMatch(/^\d{8}0001$/);
    expect(numbers[1]).toBe(`${numbers[0].slice(0, 8)}0002`);
    expect(new Set(numbers)).toHaveLength(2);
    expect(await db.order.count({ where: { orderNumber: { in: numbers } } })).toBe(2);
  });

  test("a rolled-back Order creation also rolls back its sequence allocation", async () => {
    const slug = "gb-0000000000000061";
    await seedOrderableGroupBuy({ slug, stockA: 0, purchaseLimitA: null });
    await expect(createOrder(slug, orderInput("0912-610-001", [{ groupBuyItemId: itemAId, quantity: 1 }])))
      .rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await db.orderNumberSequence.count()).toBe(0);

    await db.groupBuyItem.update({ where: { id: itemAId }, data: { stock: 1 } });
    const created = await createOrder(slug, orderInput("0912-610-002", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    expect(created.orderNumber).toMatch(/^\d{8}0001$/);
    expect(await db.orderNumberSequence.findFirstOrThrow()).toMatchObject({ lastValue: 1 });
  });

  test("fails closed at the 9999 daily capacity without producing overflow", async () => {
    const slug = "gb-0000000000000062";
    await seedOrderableGroupBuy({ slug, stockA: null, purchaseLimitA: null });
    const first = await createOrder(slug, orderInput("0912-620-001", [{ groupBuyItemId: itemAId, quantity: 1 }]));
    const dateKey = first.orderNumber.slice(0, 8);
    await db.orderNumberSequence.update({ where: { dateKey }, data: { lastValue: 9999 } });

    await expect(createOrder(slug, orderInput("0912-620-002", [{ groupBuyItemId: itemAId, quantity: 1 }])))
      .rejects.toMatchObject({ code: "FAILED" });
    expect(await db.order.count()).toBe(1);
    expect(await db.orderNumberSequence.findUniqueOrThrow({ where: { dateKey } })).toMatchObject({ lastValue: 9999 });
  });

  test("rolls back an earlier item decrement, Order, OrderItems, and new Customer when a later item is out of stock", async () => {
    const slug = "gb-0000000000000002";
    await seedOrderableGroupBuy({
      slug,
      stockA: 1,
      purchaseLimitA: null,
      includeB: true,
      stockB: 0,
      purchaseLimitB: null,
    });
    const phone = "0922-222-222";

    await expect(createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemBId, quantity: 1 },
      { groupBuyItemId: itemAId, quantity: 1 },
    ]))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await db.order.count()).toBe(0);
    expect(await db.orderItem.count()).toBe(0);
    expect(await db.customer.count({ where: { phone: "+886922222222" } })).toBe(0);
    expect(await db.groupBuyItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    })).toEqual([{ id: itemAId, stock: 1 }, { id: itemBId, stock: 0 }]);
  });

  test("allows exactly one of two Customers to buy the final finite-stock item", async () => {
    const slug = "gb-0000000000000003";
    await seedOrderableGroupBuy({ slug, stockA: 1, purchaseLimitA: null });
    const results = await Promise.allSettled([
      createOrder(slug, orderInput("0933-333-331", [{ groupBuyItemId: itemAId, quantity: 1 }])),
      createOrder(slug, orderInput("0933-333-332", [{ groupBuyItemId: itemAId, quantity: 1 }])),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter(({ status }) => status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(0);
    expect(await db.order.count({ where: { groupBuyId, status: "PLACED" } })).toBe(1);
  });

  test("retries a deterministic purchaseLimit phantom race and caps PLACED consumption", async () => {
    const slug = "gb-0000000000000004";
    await seedOrderableGroupBuy({ slug, stockA: null, purchaseLimitA: 5 });
    const customer = await db.customer.create({ data: { phone: "+886944444444" } });
    const existingOrder = await db.order.create({ data: {
      publicCode: `ord-${randomBytes(12).toString("base64url")}`,
      orderNumber: "200001010001",
      groupBuyId,
      customerId: customer.id,
      groupBuyPickupId,
      status: "PLACED",
      customerName: "既有訂購人",
      customerPhone: customer.phone,
      pickupName: "中正取貨點",
      pickupAddress: "台北市中正區測試路 1 號",
      totalAmount: 360,
    } });
    await db.orderItem.create({ data: {
      orderId: existingOrder.id,
      groupBuyItemId: itemAId,
      productName: "權威蘋果",
      unit: "箱",
      unitPrice: 120,
      quantity: 3,
    } });

    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let lockOpen = false;
    let calls: PromiseSettledResult<Awaited<ReturnType<CreateOrder>>>[] | undefined;
    let requests: ReturnType<CreateOrder>[] = [];
    try {
      await control.query("BEGIN");
      lockOpen = true;
      await control.query('LOCK TABLE "Order" IN SHARE MODE');
      requests = [
        createOrder(slug, orderInput("0944-444-444", [{ groupBuyItemId: itemAId, quantity: 2 }])),
        createOrder(slug, orderInput("0944-444-444", [{ groupBuyItemId: itemAId, quantity: 2 }])),
      ];

      const deadline = Date.now() + 10_000;
      let waiterCount = 0;
      while (Date.now() < deadline) {
        const result = await control.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count
          FROM pg_locks
          WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND relation = '"Order"'::regclass
            AND mode = 'RowExclusiveLock'
            AND granted = false
        `);
        waiterCount = result.rows[0]?.count ?? 0;
        // The first request reaches the Order insert while the second safely
        // queues on the same-day sequence row inside its transaction.
        if (waiterCount === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiterCount).toBe(1);
      await control.query("COMMIT");
      lockOpen = false;
      calls = await Promise.allSettled(requests);
    } finally {
      if (lockOpen) await control.query("ROLLBACK");
      calls ??= await Promise.allSettled(requests);
      await control.end();
    }

    expect(calls.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = calls.filter(({ status }) => status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    const consumed = await db.orderItem.aggregate({
      where: {
        groupBuyItemId: itemAId,
        order: { customerId: customer.id, groupBuyId, status: "PLACED" },
      },
      _sum: { quantity: true },
    });
    expect(consumed._sum.quantity).toBe(5);
  }, 20_000);

  test.each(["Customer", "Admin"])("%s cancels atomically, restores finite stock, preserves unlimited stock and snapshots", async (actor) => {
    const slug = "gb-0000000000000005";
    await seedOrderableGroupBuy({
      slug,
      stockA: 5,
      purchaseLimitA: 4,
      includeB: true,
      stockB: null,
      purchaseLimitB: null,
    });
    const created = await createOrder(slug, orderInput("0955-555-555", [
      { groupBuyItemId: itemAId, quantity: 2 },
      { groupBuyItemId: itemBId, quantity: 3 },
    ]));
    const before = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      include: { items: { orderBy: { groupBuyItemId: "asc" } } },
    });
    expect(await db.groupBuyItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    })).toEqual([{ id: itemAId, stock: 3 }, { id: itemBId, stock: null }]);

    // Master-data edits must not replace the order's historical values.
    await db.product.update({ where: { id: productAId }, data: { name: "新商品名稱", unit: "個", defaultPrice: 1, isActive: false } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { name: "新取貨點", address: "新地址", isActive: false } });
    const cancelled = actor === "Admin"
      ? await cancelOrderAsAdmin(created.publicCode)
      : await cancelOrder(created.publicCode, created.accessToken);
    const after = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      include: { items: { orderBy: { groupBuyItemId: "asc" } } },
    });

    expect(cancelled).toEqual({
      publicCode: created.publicCode,
      status: "CANCELLED",
      cancelledAt: after.cancelledAt,
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelledAt).not.toBeNull();
    expect(await db.groupBuyItem.findMany({
      orderBy: { id: "asc" },
      select: { id: true, stock: true },
    })).toEqual([{ id: itemAId, stock: 5 }, { id: itemBId, stock: null }]);
    expect({
      customerName: after.customerName,
      customerPhone: after.customerPhone,
      pickupName: after.pickupName,
      pickupAddress: after.pickupAddress,
      pickupStartAt: after.pickupStartAt,
      pickupEndAt: after.pickupEndAt,
      totalAmount: after.totalAmount,
      items: after.items,
    }).toEqual({
      customerName: before.customerName,
      customerPhone: before.customerPhone,
      pickupName: before.pickupName,
      pickupAddress: before.pickupAddress,
      pickupStartAt: before.pickupStartAt,
      pickupEndAt: before.pickupEndAt,
      totalAmount: before.totalAmount,
      items: before.items,
    });
  });

  test.each(["Customer", "Admin"])("%s cancellation releases purchaseLimit for a subsequent createOrder", async (actor) => {
    const slug = "gb-0000000000000006";
    await seedOrderableGroupBuy({ slug, stockA: null, purchaseLimitA: 2 });
    const phone = "0966-666-666";
    const first = await createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 2 },
    ]));
    await expect(createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 1 },
    ]))).rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });

    if (actor === "Admin") await cancelOrderAsAdmin(first.publicCode);
    else await cancelOrder(first.publicCode, first.accessToken);

    await expect(createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 2 },
    ]))).resolves.toMatchObject({ status: "PLACED" });
    expect(await db.order.count({ where: { status: "CANCELLED" } })).toBe(1);
    expect(await db.order.count({ where: { status: "PLACED" } })).toBe(1);
  });

  test("wrong token cannot mutate Order or restore stock", async () => {
    const slug = "gb-0000000000000007";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0977-777-777", [
      { groupBuyItemId: itemAId, quantity: 2 },
    ]));

    await expect(cancelOrder(created.publicCode, "B".repeat(43)))
      .rejects.toMatchObject({ code: "ACCESS_DENIED" });

    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode },
      select: { status: true, cancelledAt: true },
    })).toEqual({ status: "PLACED", cancelledAt: null });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(3);
  });

  test.each(["Customer", "Admin"])("%s sequential duplicate cancellation preserves timestamp and restores stock once", async (actor) => {
    const slug = "gb-0000000000000008";
    await seedOrderableGroupBuy({ slug, stockA: 8, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0988-888-888", [
      { groupBuyItemId: itemAId, quantity: 3 },
    ]));

    const cancel = () => actor === "Admin"
      ? cancelOrderAsAdmin(created.publicCode)
      : cancelOrder(created.publicCode, created.accessToken);
    const first = await cancel();
    const stockAfterFirst = (await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock;
    const second = await cancel();

    expect(second).toEqual(first);
    expect(stockAfterFirst).toBe(8);
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(8);
    expect((await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } })).cancelledAt)
      .toEqual(first.cancelledAt);
  });

  test.each(["Customer/Customer", "Admin/Admin", "Customer/Admin"])("concurrent %s cancellation restores finite stock exactly once", async (actors) => {
    const slug = "gb-0000000000000009";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0999-999-999", [
      { groupBuyItemId: itemAId, quantity: 3 },
    ]));
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(7);

    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let lockOpen = false;
    let calls: PromiseSettledResult<Awaited<ReturnType<CancelOrder>>>[] | undefined;
    let requests: ReturnType<CancelOrder>[] = [];
    try {
      await control.query("BEGIN");
      lockOpen = true;
      await control.query('LOCK TABLE "Order" IN SHARE MODE');
      requests = [
        actors === "Admin/Admin" ? cancelOrderAsAdmin(created.publicCode) : cancelOrder(created.publicCode, created.accessToken),
        actors === "Customer/Customer" ? cancelOrder(created.publicCode, created.accessToken) : cancelOrderAsAdmin(created.publicCode),
      ];

      const deadline = Date.now() + 10_000;
      let waiterCount = 0;
      while (Date.now() < deadline) {
        const result = await control.query<{ count: number }>(`
          SELECT COUNT(*)::int AS count
          FROM pg_locks
          WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
            AND relation = '"Order"'::regclass
            AND mode = 'RowExclusiveLock'
            AND granted = false
        `);
        waiterCount = result.rows[0]?.count ?? 0;
        if (waiterCount === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiterCount).toBe(2);
      await control.query("COMMIT");
      lockOpen = false;
      calls = await Promise.allSettled(requests);
    } finally {
      if (lockOpen) await control.query("ROLLBACK");
      calls ??= await Promise.allSettled(requests);
      await control.end();
    }

    expect(calls).toHaveLength(2);
    expect(calls.every(({ status }) => status === "fulfilled")).toBe(true);
    const results = calls as PromiseFulfilledResult<Awaited<ReturnType<CancelOrder>>>[];
    expect(results[0].value.status).toBe("CANCELLED");
    expect(results[1].value).toEqual(results[0].value);
    const order = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } });
    expect(order.status).toBe("CANCELLED");
    expect(order.cancelledAt).not.toBeNull();
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(10);
  }, 20_000);

  test("after cutoff customer is closed, Admin succeeds, and wrong token cannot use cancelled idempotency", async () => {
    const slug = "gb-0000000000000010";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0911-222-333", [{ groupBuyItemId: itemAId, quantity: 2 }]));
    await db.groupBuy.update({ where: { id: groupBuyId }, data: { endAt: new Date(Date.now() - 1_000) } });
    await expect(cancelOrder(created.publicCode, created.accessToken)).rejects.toMatchObject({ code: "CANCELLATION_CLOSED" });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(3);
    const result = await cancelOrderAsAdmin(created.publicCode);
    expect(result.status).toBe("CANCELLED");
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(5);
    await expect(cancelOrder(created.publicCode, created.accessToken)).resolves.toEqual(result);
    await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  test("Admin can cancel a legacy null-token order", async () => {
    const slug = "gb-0000000000000011";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null });
    const created = await createOrder(slug, orderInput("0911-222-334", [{ groupBuyItemId: itemAId, quantity: 2 }]));
    await db.order.update({ where: { publicCode: created.publicCode }, data: { accessTokenHash: null } });
    await expect(cancelOrderAsAdmin(created.publicCode)).resolves.toMatchObject({ status: "CANCELLED" });
    expect((await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId } })).stock).toBe(5);
  });

  test("Admin restoration failure rolls back the claim and earlier item restoration", async () => {
    const slug = "gb-0000000000000012";
    await seedOrderableGroupBuy({ slug, stockA: 5, purchaseLimitA: null, includeB: true, stockB: 5 });
    const created = await createOrder(slug, orderInput("0911-222-335", [
      { groupBuyItemId: itemAId, quantity: 2 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    // Force a genuine PostgreSQL restoration failure on the second canonical
    // item, only in this disposable DB: incrementing int4 max must overflow.
    await db.groupBuyItem.update({ where: { id: itemBId }, data: { stock: 2_147_483_647 } });
    await expect(cancelOrderAsAdmin(created.publicCode)).rejects.toMatchObject({ code: "FAILED" });
    expect(await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode }, select: { status: true, cancelledAt: true },
    })).toEqual({ status: "PLACED", cancelledAt: null });
    expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { id: true, stock: true } }))
      .toEqual([{ id: itemAId, stock: 3 }, { id: itemBId, stock: 2_147_483_647 }]);
  });

  test.each([
    ["payment", "payment"],
    ["customer", "payment"], ["payment", "customer"],
    ["admin", "payment"], ["payment", "admin"],
    ["pickup", "payment"], ["payment", "pickup"],
  ] as const)("real payment row-lock race: %s commits before %s", async (first, second) => {
    const slug = "gb-0000000000000030";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput("0912-333-444", [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    await db.groupBuy.update({ where: { id: groupBuyId }, data: { endAt: new Date(Date.now() + 300_000) } });
    const before = await db.order.findUniqueOrThrow({
      where: { publicCode: created.publicCode }, include: { items: { orderBy: { id: "asc" } } },
    });
    const control = new Client({ connectionString: databaseUrl });
    await control.connect();
    let locked = false;
    const requests: Promise<unknown>[] = [];
    const run = (actor: string) => actor === "payment" ? payment(created.publicCode)
      : actor === "pickup" ? pickup(created.publicCode)
      : actor === "admin" ? cancelOrderAsAdmin(created.publicCode)
      : cancelOrder(created.publicCode, created.accessToken);
    async function waitFor(event: string) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        await control.query("SELECT pg_stat_clear_snapshot()");
        const result = await control.query(`SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND wait_event = $1 AND query LIKE '%UPDATE%Order%'`, [event]);
        if (result.rowCount) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Expected real PostgreSQL ${event} waiter`);
    }
    try {
      await control.query(`CREATE TABLE payment_write_count (paid boolean);
        CREATE FUNCTION count_payment_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO payment_write_count VALUES (OLD."paidAt" IS DISTINCT FROM NEW."paidAt"); RETURN NEW; END $$;
        CREATE TRIGGER payment_write_counter AFTER UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION count_payment_write();`);
      await control.query("BEGIN");
      locked = true;
      await control.query('SELECT id FROM "Order" WHERE "publicCode" = $1 FOR UPDATE', [created.publicCode]);
      requests.push(run(first));
      await waitFor("transactionid");
      requests.push(run(second));
      await waitFor("tuple");
      await control.query("COMMIT");
      locked = false;
      const results = await Promise.allSettled(requests);
      const independent = first === "pickup" || second === "pickup";
      const cancelled = first === "admin" || first === "customer";
      expect(results[0].status).toBe("fulfilled");
      if (independent) {
        expect(results[1].status).toBe("fulfilled");
      } else if (first === second) {
        expect(results[1]).toEqual(results[0]);
      } else {
        expect(results[1]).toMatchObject({
          status: "rejected", reason: { code: cancelled ? "CANCELLED" : "ALREADY_PAID" },
        });
      }
      const order = await db.order.findUniqueOrThrow({
        where: { publicCode: created.publicCode }, include: { items: { orderBy: { id: "asc" } } },
      });
      expect(order.status).toBe(cancelled ? "CANCELLED" : "PLACED");
      if (cancelled) {
        expect(order.cancelledAt).not.toBeNull();
        expect(order.paidAt).toBeNull();
        expect(order.pickedUpAt).toBeNull();
      } else {
        expect(order.cancelledAt).toBeNull();
        expect(order.paidAt).not.toBeNull();
        if (independent) expect(order.pickedUpAt).not.toBeNull();
        else expect(order.pickedUpAt).toBeNull();
        const paymentIndex = first === "payment" ? 0 : 1;
        expect((results[paymentIndex] as PromiseFulfilledResult<{ paidAt: Date }>).value.paidAt).toEqual(order.paidAt);
        if (independent) {
          const pickupIndex = first === "pickup" ? 0 : 1;
          expect((results[pickupIndex] as PromiseFulfilledResult<{ pickedUpAt: Date }>).value.pickedUpAt).toEqual(order.pickedUpAt);
        }
      }
      expect(order).toEqual({
        ...before, status: order.status, paidAt: order.paidAt,
        pickedUpAt: order.pickedUpAt, cancelledAt: order.cancelledAt, updatedAt: order.updatedAt,
      });
      const counts = (await control.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE paid)::int AS paid FROM payment_write_count")).rows[0];
      expect(counts).toEqual({ total: independent ? 2 : 1, paid: cancelled ? 0 : 1 });
      expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } }))
        .toEqual([{ stock: cancelled ? 10 : 7 }, { stock: null }]);
      expect(await db.order.count({ where: { status: "CANCELLED", paidAt: { not: null } } })).toBe(0);
      if (!cancelled) {
        await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      }
    } finally {
      if (locked) await control.query("ROLLBACK");
      await Promise.allSettled(requests);
      await control.query('DROP TRIGGER IF EXISTS payment_write_counter ON "Order"; DROP FUNCTION IF EXISTS count_payment_write(); DROP TABLE IF EXISTS payment_write_count;');
      await control.end();
    }
  }, 20_000);

  test.each([false, true])("payment preserves snapshots, allocation and purchaseLimit; legacy=%s", async (legacy) => {
    const slug = "gb-0000000000000031";
    const phone = "0912-333-445";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: 3, includeB: true, stockB: null });
    const created = await createOrder(slug, orderInput(phone, [
      { groupBuyItemId: itemAId, quantity: 3 }, { groupBuyItemId: itemBId, quantity: 1 },
    ]));
    if (legacy) await db.order.update({ where: { publicCode: created.publicCode }, data: { accessTokenHash: null } });
    const before = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    await db.product.update({ where: { id: productAId }, data: { name: "edited", unit: "edited", defaultPrice: 1, isActive: false } });
    await db.groupBuyItem.update({ where: { id: itemAId }, data: { salePrice: 1 } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { name: "edited", address: "edited", isActive: false } });
    await db.groupBuyPickup.update({ where: { id: groupBuyPickupId }, data: { pickupStartAt: null, pickupEndAt: null } });
    const result = await payment(created.publicCode);
    const after = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } });
    expect(after).toEqual({ ...before, paidAt: result.paidAt, updatedAt: after.updatedAt });
    await expect(payment(created.publicCode)).resolves.toEqual(result);
    expect(await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode }, include: { items: true } })).toEqual(after);
    const admin = await import("@/lib/orders/admin-service");
    const customer = await import("@/lib/orders/access-service");
    expect(await admin.getAdminOrderByPublicCode(created.publicCode)).toMatchObject({ ok: true, value: { paidAt: result.paidAt, totalAmount: before.totalAmount } });
    expect(await admin.listAdminOrders()).toMatchObject({ ok: true, value: [{ paidAt: result.paidAt }] });
    if (!legacy) {
      expect(await customer.getOrderForAccess(created.publicCode, created.accessToken)).toMatchObject({ ok: true, value: { paidAt: result.paidAt, totalAmount: before.totalAmount, canCancel: false } });
      await expect(cancelOrder(created.publicCode, created.accessToken)).rejects.toMatchObject({ code: "ALREADY_PAID" });
    }
    await expect(cancelOrderAsAdmin(created.publicCode)).rejects.toMatchObject({ code: "ALREADY_PAID" });
    await expect(cancelOrder(created.publicCode, "B".repeat(43))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await db.product.update({ where: { id: productAId }, data: { isActive: true } });
    await db.pickupLocation.update({ where: { id: pickupLocationId }, data: { isActive: true } });
    await expect(createOrder(slug, orderInput(phone, [{ groupBuyItemId: itemAId, expectedUnitPrice: 1, quantity: 1 }])))
      .rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    await pickup(created.publicCode);
    await expect(payment(created.publicCode)).resolves.toEqual(result);
    await expect(createOrder(slug, orderInput(phone, [{ groupBuyItemId: itemAId, expectedUnitPrice: 1, quantity: 1 }])))
      .rejects.toMatchObject({ code: "PURCHASE_LIMIT_EXCEEDED" });
    expect(await db.groupBuyItem.findMany({ orderBy: { id: "asc" }, select: { stock: true } })).toEqual([{ stock: 7 }, { stock: null }]);
  });

  test("7-ELEVEN selection is authoritative, consumed atomically, snapshot-safe, and cancellation restores stock once", async () => {
    const slug = "gb-0000000000000050";
    await seedOrderableGroupBuy({ slug, stockA: 10, purchaseLimitA: null });
    await db.groupBuy.update({
      where: { id: groupBuyId },
      data: { allowsSelfPickup: false, allowsSevenEleven: true },
    });
    const selectionService = await import("@/lib/logistics/store-selection");
    const browserABinding = "A".repeat(43);
    const browserBBinding = "B".repeat(43);
    const started = await selectionService.beginSevenElevenStoreSelection(slug, browserABinding);
    const pending = await selectionService.getPendingSevenElevenMapRequest(started.state);
    const concurrentStarted = await selectionService.beginSevenElevenStoreSelection(slug, browserABinding);
    const concurrentPending = await selectionService.getPendingSevenElevenMapRequest(concurrentStarted.state);
    expect(pending).not.toBeNull();
    expect(concurrentPending).not.toBeNull();
    const expectedBindingHash = createHash("sha256").update(browserABinding).digest("base64url");
    expect(await db.sevenElevenStoreSelection.findMany({
      where: { merchantTradeNo: { in: [pending!.merchantTradeNo, concurrentPending!.merchantTradeNo] } },
      orderBy: { merchantTradeNo: "asc" },
      select: { browserBindingHash: true, selectionTokenHash: true },
    })).toEqual([
      { browserBindingHash: expectedBindingHash, selectionTokenHash: null },
      { browserBindingHash: expectedBindingHash, selectionTokenHash: null },
    ]);
    const concurrentCompleted = await selectionService.completeSevenElevenStoreSelection({
      MerchantID: "2000933",
      MerchantTradeNo: concurrentPending!.merchantTradeNo,
      LogisticsSubType: "UNIMARTC2C",
      CVSStoreID: "654321",
      CVSStoreName: "另一偽造門市",
      CVSAddress: "另一偽造地址",
      ExtraData: concurrentStarted.state,
    }, {
      merchantId: "2000933",
      resolveStore: async () => ({ id: "654321", name: "另一權威門市", address: "臺北市權威路 2 號" }),
    });
    expect(concurrentCompleted).not.toBeNull();
    const completed = await selectionService.completeSevenElevenStoreSelection({
      MerchantID: "2000933",
      MerchantTradeNo: pending!.merchantTradeNo,
      LogisticsSubType: "UNIMARTC2C",
      CVSStoreID: "123456",
      CVSStoreName: "瀏覽器偽造",
      CVSAddress: "瀏覽器偽造地址",
      ExtraData: started.state,
    }, {
      merchantId: "2000933",
      resolveStore: async () => ({ id: "123456", name: "權威門市", address: "臺北市權威路 1 號" }),
    });
    expect(completed).not.toBeNull();
    expect(await db.sevenElevenStoreSelection.findUniqueOrThrow({
      where: { merchantTradeNo: pending!.merchantTradeNo },
      select: { browserBindingHash: true },
    })).toEqual({ browserBindingHash: expectedBindingHash });

    await expect(createOrder(slug, {
      customerName: "其他瀏覽器",
      customerPhone: "0944-345-678",
      fulfillmentMethod: "SEVEN_ELEVEN",
      storeSelectionToken: completed!.selectionToken,
      items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 120, quantity: 1 }],
    }, { storeSelectionBinding: browserBBinding })).rejects.toMatchObject({ code: "STORE_SELECTION_INVALID" });

    const created = await createOrder(slug, {
      customerName: "超商取貨顧客",
      customerPhone: "0955-345-678",
      fulfillmentMethod: "SEVEN_ELEVEN",
      storeSelectionToken: completed!.selectionToken,
      items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 120, quantity: 2 }],
    }, { storeSelectionBinding: browserABinding });
    const order = await db.order.findUniqueOrThrow({ where: { publicCode: created.publicCode } });
    expect(order).toMatchObject({
      fulfillmentMethod: "SEVEN_ELEVEN",
      groupBuyPickupId: null,
      pickupName: null,
      sevenElevenStoreId: "123456",
      sevenElevenStoreName: "權威門市",
      sevenElevenStoreAddress: "臺北市權威路 1 號",
    });
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId }, select: { stock: true } })).toEqual({ stock: 8 });
    await expect(createOrder(slug, {
      customerName: "重用選擇",
      customerPhone: "0966-345-678",
      fulfillmentMethod: "SEVEN_ELEVEN",
      storeSelectionToken: completed!.selectionToken,
      items: [{ groupBuyItemId: itemAId, expectedUnitPrice: 120, quantity: 1 }],
    }, { storeSelectionBinding: browserABinding })).rejects.toMatchObject({ code: "STORE_SELECTION_INVALID" });

    await db.sevenElevenStoreSelection.deleteMany({ where: { orderId: order.id } });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      sevenElevenStoreId: "123456",
      sevenElevenStoreName: "權威門市",
      sevenElevenStoreAddress: "臺北市權威路 1 號",
    });
    const firstCancellation = await cancelOrderAsAdmin(created.publicCode);
    await expect(cancelOrderAsAdmin(created.publicCode)).resolves.toEqual(firstCancellation);
    expect(await db.groupBuyItem.findUniqueOrThrow({ where: { id: itemAId }, select: { stock: true } })).toEqual({ stock: 10 });
  });

});
