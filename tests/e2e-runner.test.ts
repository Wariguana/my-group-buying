// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  generateE2eAdminCredentials,
  runE2eOrchestration,
  type ChildProcessRequest,
  type E2eControlConnection,
  type E2eRunnerDependencies,
} from "../scripts/lib/e2e-runner";

const sourceUrl = "postgresql://source-user:source-secret@localhost:5433/my_group_buying_dev";

function setup(overrides: {
  failConnect?: boolean;
  failCreate?: boolean;
  failDrop?: boolean;
  failEnd?: boolean;
  failChildAt?: number;
} = {}) {
  const events: string[] = [];
  const requests: ChildProcessRequest[] = [];
  let childNumber = 0;
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT")) return { rowCount: 0 };
    if (sql.startsWith("CREATE")) {
      events.push("create");
      if (overrides.failCreate) throw new Error(`secret create failure ${sourceUrl}`);
    }
    if (sql.startsWith("DROP")) {
      events.push("drop");
      if (overrides.failDrop) throw new Error(`secret drop failure ${sourceUrl}`);
    }
    return { rowCount: 0 };
  });
  const control: E2eControlConnection = {
    query,
    connect: vi.fn(async () => {
      events.push("connect");
      if (overrides.failConnect) throw new Error(`secret connect failure ${sourceUrl}`);
    }),
    end: vi.fn(async () => {
      events.push("end");
      if (overrides.failEnd) throw new Error(`secret end failure ${sourceUrl}`);
    }),
  };
  const dependencies: E2eRunnerDependencies = {
    createControlConnection: vi.fn(() => control),
    runChildProcess: vi.fn(async (request) => {
      childNumber += 1;
      requests.push(request);
      events.push(childNumber === 1 ? "migrate" : "provision");
      if (overrides.failChildAt === childNumber) {
        throw new Error(`secret child failure ${sourceUrl}`);
      }
    }),
    generateCredentials: () => ({
      email: "ephemeral@example.invalid",
      password: "one-run-password-value",
    }),
    nodeExecutable: "node-test",
    npxExecutable: "npx-test",
  };
  return { control, dependencies, events, query, requests };
}

beforeEach(() => vi.clearAllMocks());

test("uses the validated control database and runs isolated children before cleanup", async () => {
  const context = setup();
  await runE2eOrchestration(sourceUrl, context.dependencies);

  expect(context.events).toEqual(["connect", "create", "migrate", "provision", "drop", "end"]);
  const createControl = context.dependencies.createControlConnection as ReturnType<typeof vi.fn>;
  const controlUrl = new URL(createControl.mock.calls[0][0]);
  expect(controlUrl.pathname).toBe("/postgres");
  expect(controlUrl.username === "source-user").toBe(true);
  expect(controlUrl.password === "source-secret").toBe(true);

  expect(context.requests).toHaveLength(2);
  const [migration, provisioning] = context.requests;
  expect(migration.executable).toBe("npx-test");
  expect(migration.args).toEqual(["prisma", "migrate", "deploy"]);
  expect(provisioning.executable).toBe("node-test");
  expect(provisioning.args).toEqual([
    "--conditions=react-server", "--import", "tsx", "scripts/provision-e2e-admin.ts",
  ]);

  const targetUrl = migration.env.DATABASE_URL!;
  expect(targetUrl).toBe(provisioning.env.DATABASE_URL);
  expect(targetUrl).not.toBe(sourceUrl);
  expect(new URL(targetUrl).pathname).toMatch(/^\/my_group_buying_e2e_[a-f0-9]{32}$/);
  expect(provisioning.env.E2E_ADMIN_EMAIL).toBe("ephemeral@example.invalid");
  expect(provisioning.env.E2E_ADMIN_PASSWORD).toBe("one-run-password-value");
  for (const request of context.requests) {
    expect(request.args.join(" ")).not.toContain(sourceUrl);
    expect(request.args.join(" ")).not.toContain(targetUrl);
    expect(request.args.join(" ")).not.toContain("one-run-password-value");
  }
});

describe.each([
  ["migration", 1, "E2E database migration failed."],
  ["provisioning", 2, "E2E Admin provisioning failed."],
] as const)("%s failure", (_stage, failChildAt, expectedMessage) => {
  test("propagates a sanitized error and cleans up the owned target", async () => {
    const context = setup({ failChildAt });
    const outcome = await runE2eOrchestration(sourceUrl, context.dependencies)
      .catch((error: unknown) => error);

    expect(outcome).toMatchObject({ message: expectedMessage });
    expect(JSON.stringify(outcome)).not.toContain("source-secret");
    expect(context.events.at(-2)).toBe("drop");
    expect(context.events.at(-1)).toBe("end");
  });
});

test("does not drop when CREATE fails before ownership is acquired", async () => {
  const context = setup({ failCreate: true });
  await expect(runE2eOrchestration(sourceUrl, context.dependencies)).rejects.toThrow(
    "Disposable E2E database creation failed.",
  );
  expect(context.events).toEqual(["connect", "create", "end"]);
});

test("closes a constructed control client when connect fails", async () => {
  const context = setup({ failConnect: true });
  await expect(runE2eOrchestration(sourceUrl, context.dependencies)).rejects.toThrow(
    "E2E control database connection failed.",
  );
  expect(context.events).toEqual(["connect", "end"]);
});

test.each([
  ["drop", { failDrop: true }],
  ["control close", { failEnd: true }],
] as const)("reports sanitized %s cleanup failure", async (_label, overrides) => {
  const context = setup(overrides);
  const outcome = await runE2eOrchestration(sourceUrl, context.dependencies)
    .catch((error: unknown) => error);
  expect(outcome).toMatchObject({ message: "Disposable E2E database cleanup failed." });
  expect(JSON.stringify(outcome)).not.toContain("source-secret");
});

test("preserves cleanup failure when a child also fails", async () => {
  const context = setup({ failChildAt: 1, failDrop: true });
  await expect(runE2eOrchestration(sourceUrl, context.dependencies)).rejects.toThrow(
    "E2E run failed, and disposable database cleanup also failed.",
  );
  expect(context.events.at(-1)).toBe("end");
});

test("rejects an unsafe source before creating a control client", async () => {
  const context = setup();
  await expect(runE2eOrchestration(
    "postgresql://source-user:source-secret@example.com:5433/my_group_buying_dev",
    context.dependencies,
  )).rejects.toThrow("DATABASE_URL must target the approved");
  expect(context.dependencies.createControlConnection).not.toHaveBeenCalled();
});

test("sanitizes control client construction failures", async () => {
  const context = setup();
  const createControlConnection = vi.fn(() => {
    throw new Error(`driver rejected ${sourceUrl}`);
  });
  await expect(runE2eOrchestration(sourceUrl, {
    ...context.dependencies,
    createControlConnection,
  })).rejects.toThrow("E2E control database client creation failed.");
});

test("generates unique credentials that satisfy the existing length policy", () => {
  const first = generateE2eAdminCredentials();
  const second = generateE2eAdminCredentials();
  expect(first.email).not.toBe(second.email);
  expect(first.password).not.toBe(second.password);
  expect(first.email).toMatch(/^e2e-admin-[a-f0-9]{32}@example\.invalid$/);
  expect(first.password.length).toBeGreaterThanOrEqual(12);
  expect(first.password.length).toBeLessThanOrEqual(128);
  expect(first.password).toMatch(/^[A-Za-z0-9_-]+$/);
});
