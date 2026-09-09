// @vitest-environment node

import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  defaultE2eRunnerDependencies,
  generateE2eAdminCredentials,
  runE2eOrchestration,
  startSpawnedProcess,
  waitForServerExit,
  type ChildProcessRequest,
  type E2eControlConnection,
  type E2eRunnerDependencies,
  type LongLivedChildProcess,
} from "../scripts/lib/e2e-runner";

const sourceUrl = "postgresql://source-user:source-secret@localhost:5433/my_group_buying_dev";
const serverRequest: ChildProcessRequest = {
  executable: "node-test",
  args: ["C:\\resolved\\next\\dist\\bin\\next", "start"],
  env: { DATABASE_URL: "isolated-test-url", NODE_ENV: "test" },
};

class FakeChildProcess extends EventEmitter {
  kill = vi.fn(() => true);
}

function fakeSpawn(child: FakeChildProcess): typeof import("node:child_process").spawn {
  return vi.fn(() => child) as unknown as typeof import("node:child_process").spawn;
}

function setup(overrides: {
  failConnect?: boolean;
  failCreate?: boolean;
  failDrop?: boolean;
  failEnd?: boolean;
  failChildAt?: number;
  failServerStart?: boolean;
  serverEarlyExit?: boolean;
  readinessTimeout?: boolean;
  failServerStop?: boolean;
  failServerExit?: boolean;
} = {}) {
  const events: string[] = [];
  const requests: ChildProcessRequest[] = [];
  const serverRequests: ChildProcessRequest[] = [];
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
      events.push(["migrate", "provision", "build", "playwright"][childNumber - 1]!);
      if (overrides.failChildAt === childNumber) {
        throw new Error(`secret child failure ${sourceUrl}`);
      }
    }),
    startLongLivedProcess: vi.fn((request) => {
      events.push("server start");
      serverRequests.push(request);
      if (overrides.failServerStart) {
        throw new Error(`secret server start failure ${sourceUrl}`);
      }
      const server: LongLivedChildProcess = {
        stop: vi.fn(async () => {
          events.push("server stop");
          if (overrides.failServerStop) {
            throw new Error(`secret server stop failure ${sourceUrl}`);
          }
        }),
        waitForExit: vi.fn(async () => undefined),
      };
      return server;
    }),
    waitForServerReady: vi.fn(async (url) => {
      expect(url).toBe("http://localhost:3100");
      if (overrides.serverEarlyExit) {
        events.push("server early exit");
        throw new Error(`secret early exit ${sourceUrl}`);
      }
      if (overrides.readinessTimeout) {
        events.push("server readiness timeout");
        throw new Error(`secret readiness timeout ${sourceUrl}`);
      }
      events.push("server ready");
    }),
    waitForServerExit: vi.fn(async () => {
      if (overrides.failServerExit) {
        events.push("server exit unconfirmed");
        throw new Error(`secret server exit failure ${sourceUrl}`);
      }
      events.push("server exit");
    }),
    generateCredentials: () => ({
      email: "ephemeral@example.invalid",
      password: "one-run-password-value",
    }),
    nodeExecutable: "node-test",
    prismaCliPath: "C:\\resolved\\prisma\\build\\index.js",
    nextCliPath: "C:\\resolved\\next\\dist\\bin\\next",
    playwrightCliPath: "C:\\resolved\\playwright\\cli.js",
  };
  return { control, dependencies, events, query, requests, serverRequests };
}

beforeEach(() => vi.clearAllMocks());

test("long-lived process confirms exit only after close, not error", async () => {
  const child = new FakeChildProcess();
  const server = startSpawnedProcess(serverRequest, fakeSpawn(child));
  let exitConfirmed = false;
  void server.waitForExit().then(() => {
    exitConfirmed = true;
  });

  expect(() => child.emit("error", new Error("synthetic child error"))).not.toThrow();
  await Promise.resolve();
  expect(exitConfirmed).toBe(false);

  child.emit("close", 1, null);
  await expect(server.waitForExit()).resolves.toBeUndefined();
  expect(exitConfirmed).toBe(true);
});

test("error followed by close delays DROP until actual close", async () => {
  const context = setup();
  const child = new FakeChildProcess();
  let stopRequested: (() => void) | undefined;
  const stopping = new Promise<void>((resolveStopping) => {
    stopRequested = resolveStopping;
  });
  child.kill = vi.fn(() => {
    context.events.push("actual server stop");
    stopRequested?.();
    return true;
  });
  const server = startSpawnedProcess(serverRequest, fakeSpawn(child));
  const run = runE2eOrchestration(sourceUrl, {
    ...context.dependencies,
    startLongLivedProcess: vi.fn(() => {
      context.events.push("actual server start");
      return server;
    }),
    waitForServerExit: vi.fn(async (runningServer) => {
      context.events.push("actual server exit wait");
      await runningServer.waitForExit();
      context.events.push("actual server close");
    }),
  });

  await stopping;
  child.emit("error", new Error("synthetic child error"));
  await Promise.resolve();
  expect(context.events).not.toContain("drop");
  expect(context.events).not.toContain("actual server close");

  child.emit("close", 1, null);
  await expect(run).resolves.toBeUndefined();
  expect(context.events.indexOf("actual server close")).toBeLessThan(
    context.events.indexOf("drop"),
  );
});

test("error without close times out and never confirms exit", async () => {
  vi.useFakeTimers();
  try {
    const child = new FakeChildProcess();
    const server = startSpawnedProcess(serverRequest, fakeSpawn(child));
    child.emit("error", new Error("synthetic child error"));

    const waiting = expect(waitForServerExit(server)).rejects.toThrow(
      "Production server shutdown timed out.",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await waiting;
  } finally {
    vi.useRealTimers();
  }
});

test("synchronous spawn failure is reported by the server-start boundary", () => {
  const throwingSpawn = vi.fn(() => {
    throw new Error("synthetic synchronous spawn failure");
  }) as unknown as typeof import("node:child_process").spawn;

  expect(() => startSpawnedProcess(serverRequest, throwingSpawn)).toThrow(
    "synthetic synchronous spawn failure",
  );
});

test("uses the validated control database and runs isolated children before cleanup", async () => {
  const context = setup();
  const parentDatabaseUrl = process.env.DATABASE_URL;
  await runE2eOrchestration(sourceUrl, context.dependencies);

  expect(context.events).toEqual([
    "connect", "create", "migrate", "provision", "build", "server start",
    "server ready", "playwright", "server stop", "server exit", "drop", "end",
  ]);
  const createControl = context.dependencies.createControlConnection as ReturnType<typeof vi.fn>;
  const controlUrl = new URL(createControl.mock.calls[0][0]);
  expect(controlUrl.pathname).toBe("/postgres");
  expect(controlUrl.username === "source-user").toBe(true);
  expect(controlUrl.password === "source-secret").toBe(true);

  expect(context.requests).toHaveLength(4);
  const [migration, provisioning, build, playwright] = context.requests;
  expect(migration.executable).toBe("node-test");
  expect(migration.args).toEqual([
    "C:\\resolved\\prisma\\build\\index.js", "migrate", "deploy",
  ]);
  expect(migration.executable).not.toMatch(/(?:npx|npm|cmd|powershell)(?:\.exe|\.cmd)?$/i);
  expect(migration.executable).not.toMatch(/\.cmd$/i);
  expect(provisioning.executable).toBe("node-test");
  expect(provisioning.args).toEqual([
    "--conditions=react-server", "--import", "tsx", "scripts/provision-e2e-admin.ts",
  ]);
  expect(build).toMatchObject({
    executable: "node-test",
    args: ["C:\\resolved\\next\\dist\\bin\\next", "build"],
  });
  expect(playwright).toMatchObject({
    executable: "node-test",
    args: ["C:\\resolved\\playwright\\cli.js", "test"],
  });
  expect(context.serverRequests).toHaveLength(1);
  const [serverRequest] = context.serverRequests;
  expect(serverRequest).toMatchObject({
    executable: "node-test",
    args: [
      "C:\\resolved\\next\\dist\\bin\\next",
      "start",
      "--hostname",
      "localhost",
      "--port",
      "3100",
    ],
  });
  expect(serverRequest.executable).not.toMatch(
    /(?:npx|npm|cmd|powershell)(?:\.exe|\.cmd)?$/i,
  );
  expect(serverRequest.args).not.toContain(".cmd");

  const targetUrl = migration.env.DATABASE_URL!;
  expect(process.env.DATABASE_URL).toBe(parentDatabaseUrl);
  expect(targetUrl).toBe(provisioning.env.DATABASE_URL);
  expect(targetUrl).toBe(build.env.DATABASE_URL);
  expect(targetUrl).toBe(playwright.env.DATABASE_URL);
  expect(targetUrl).toBe(serverRequest.env.DATABASE_URL);
  expect(targetUrl).not.toBe(sourceUrl);
  expect(new URL(targetUrl).pathname).toMatch(/^\/my_group_buying_e2e_[a-f0-9]{32}$/);
  expect(provisioning.env.E2E_ADMIN_EMAIL).toBe("ephemeral@example.invalid");
  expect(provisioning.env.E2E_ADMIN_PASSWORD).toBe("one-run-password-value");
  expect(migration.env.E2E_ADMIN_EMAIL).toBeUndefined();
  expect(migration.env.E2E_ADMIN_PASSWORD).toBeUndefined();
  expect(build.env.E2E_ADMIN_EMAIL).toBeUndefined();
  expect(build.env.E2E_ADMIN_PASSWORD).toBeUndefined();
  expect(serverRequest.env.E2E_ADMIN_EMAIL).toBeUndefined();
  expect(serverRequest.env.E2E_ADMIN_PASSWORD).toBeUndefined();
  expect(playwright.env.E2E_ADMIN_EMAIL).toBe("ephemeral@example.invalid");
  expect(playwright.env.E2E_ADMIN_PASSWORD).toBe("one-run-password-value");
  for (const request of [...context.requests, ...context.serverRequests]) {
    expect(request.args.join(" ")).not.toContain(sourceUrl);
    expect(request.args.join(" ")).not.toContain(targetUrl);
    expect(request.args.join(" ")).not.toContain("ephemeral@example.invalid");
    expect(request.args.join(" ")).not.toContain("one-run-password-value");
  }
});

test("resolves the default Prisma CLI from the installed package bin", () => {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("prisma/package.json");
  const packageJson = require(packageJsonPath) as {
    bin: { prisma: string };
  };

  expect(defaultE2eRunnerDependencies.prismaCliPath).toBe(
    resolve(dirname(packageJsonPath), packageJson.bin.prisma),
  );
  expect(defaultE2eRunnerDependencies.prismaCliPath).toMatch(/[\\/]build[\\/]index\.js$/);
  expect(defaultE2eRunnerDependencies.nextCliPath).toMatch(/[\\/]next[\\/]dist[\\/]bin[\\/]next$/);
  expect(defaultE2eRunnerDependencies.playwrightCliPath).toMatch(
    /[\\/]@playwright[\\/]test[\\/]cli\.js$/,
  );
});

describe.each([
  ["migration", 1, "E2E database migration failed."],
  ["provisioning", 2, "E2E Admin provisioning failed."],
  ["production build", 3, "E2E production build failed."],
  ["browser test", 4, "E2E browser test failed."],
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

test("does not start the production server when the build fails", async () => {
  const context = setup({ failChildAt: 3 });
  await expect(runE2eOrchestration(sourceUrl, context.dependencies)).rejects.toThrow(
    "E2E production build failed.",
  );
  expect(context.dependencies.startLongLivedProcess).not.toHaveBeenCalled();
  expect(context.events).toEqual([
    "connect", "create", "migrate", "provision", "build", "drop", "end",
  ]);
});

test.each([
  ["early exit", { serverEarlyExit: true }],
  ["readiness timeout", { readinessTimeout: true }],
] as const)("cleans up after server %s", async (_label, overrides) => {
  const context = setup(overrides);
  const outcome = await runE2eOrchestration(sourceUrl, context.dependencies)
    .catch((error: unknown) => error);

  expect(outcome).toMatchObject({ message: "E2E production server readiness failed." });
  expect(JSON.stringify(outcome)).not.toContain("source-secret");
  expect(context.events).not.toContain("playwright");
  expect(context.events.slice(-4)).toEqual(["server stop", "server exit", "drop", "end"]);
});

test("stops the server and confirms exit before DROP when Playwright fails", async () => {
  const context = setup({ failChildAt: 4 });
  await expect(runE2eOrchestration(sourceUrl, context.dependencies)).rejects.toThrow(
    "E2E browser test failed.",
  );
  expect(context.events.slice(-5)).toEqual([
    "playwright", "server stop", "server exit", "drop", "end",
  ]);
});

test("surfaces a sanitized server-stop failure after confirming exit and cleanup", async () => {
  const context = setup({ failServerStop: true });
  const outcome = await runE2eOrchestration(sourceUrl, context.dependencies)
    .catch((error: unknown) => error);

  expect(outcome).toMatchObject({ message: "E2E production server shutdown failed." });
  expect(JSON.stringify(outcome)).not.toContain("source-secret");
  expect(context.events.slice(-4)).toEqual(["server stop", "server exit", "drop", "end"]);
});

test("never starts DROP when production server exit cannot be confirmed", async () => {
  const context = setup({ failServerExit: true });
  const outcome = await runE2eOrchestration(sourceUrl, context.dependencies)
    .catch((error: unknown) => error);

  expect(outcome).toMatchObject({ message: "E2E production server shutdown failed." });
  expect(context.events).toContain("server exit unconfirmed");
  expect(context.events).not.toContain("drop");
  expect(context.events.at(-1)).toBe("end");
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
