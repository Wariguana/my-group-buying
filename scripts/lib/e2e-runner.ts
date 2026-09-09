import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import {
  deriveE2eControlDatabaseUrl,
  E2eDatabaseLifecycle,
  type E2eDatabaseControl,
} from "./e2e-database";

const ADMIN_EMAIL_ENV = "E2E_ADMIN_EMAIL";
const ADMIN_PASSWORD_ENV = "E2E_ADMIN_PASSWORD";
const E2E_SERVER_URL = "http://localhost:3100";
const SERVER_READINESS_TIMEOUT_MS = 30_000;
const SERVER_READINESS_POLL_MS = 250;
const SERVER_REQUEST_TIMEOUT_MS = 1_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 30_000;

export type ChildProcessRequest = Readonly<{
  executable: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}>;

export type LongLivedChildProcess = Readonly<{
  stop(): Promise<void>;
  waitForExit(): Promise<void>;
}>;

export type E2eControlConnection = E2eDatabaseControl & {
  connect(): Promise<void>;
  end(): Promise<void>;
};

export type E2eRunnerDependencies = Readonly<{
  createControlConnection(connectionString: string): E2eControlConnection;
  runChildProcess(request: ChildProcessRequest): Promise<void>;
  startLongLivedProcess(request: ChildProcessRequest): LongLivedChildProcess;
  waitForServerReady(url: string, server: LongLivedChildProcess): Promise<void>;
  waitForServerExit(server: LongLivedChildProcess): Promise<void>;
  generateCredentials(): Readonly<{ email: string; password: string }>;
  nodeExecutable: string;
  prismaCliPath: string;
  nextCliPath: string;
  playwrightCliPath: string;
}>;

export class E2eRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "E2eRunnerError";
  }
}

export function generateE2eAdminCredentials(): Readonly<{
  email: string;
  password: string;
}> {
  return Object.freeze({
    email: `e2e-admin-${randomBytes(16).toString("hex")}@example.invalid`,
    password: randomBytes(48).toString("base64url"),
  });
}

export function runSpawnedProcess(request: ChildProcessRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    let spawnFailed = false;
    const child = spawn(request.executable, request.args, {
      env: request.env,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });

    child.once("error", () => {
      spawnFailed = true;
    });
    child.once("close", (exitCode) => {
      if (spawnFailed || exitCode !== 0) {
        reject(new Error("Child process failed."));
        return;
      }
      resolve();
    });
  });
}

export function startSpawnedProcess(
  request: ChildProcessRequest,
  spawnProcess: typeof spawn = spawn,
): LongLivedChildProcess {
  const child = spawnProcess(request.executable, request.args, {
    env: request.env,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  let closed = false;
  const exitPromise = new Promise<void>((resolve) => {
    child.once("close", () => {
      closed = true;
      resolve();
    });
  });
  // An error is handled to prevent an unhandled EventEmitter error, but only
  // close confirms that the OS process and all stdio streams have terminated.
  child.on("error", () => undefined);

  return {
    async stop() {
      if (closed) return;
      if (!child.kill("SIGTERM")) {
        throw new Error("Production server stop failed.");
      }
    },
    waitForExit: () => exitPromise,
  };
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Server readiness wait cancelled."));
    }, { once: true });
  });
}

async function pollServerUntilReady(url: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + SERVER_READINESS_TIMEOUT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(SERVER_REQUEST_TIMEOUT_MS)]),
      });
      await response.body?.cancel();
      return;
    } catch {
      if (signal.aborted) throw new Error("Server readiness wait cancelled.");
    }
    await abortableDelay(SERVER_READINESS_POLL_MS, signal);
  }
  throw new Error("Production server readiness timed out.");
}

export async function waitForHttpServerReady(
  url: string,
  server: LongLivedChildProcess,
): Promise<void> {
  const controller = new AbortController();
  try {
    await Promise.race([
      pollServerUntilReady(url, controller.signal),
      server.waitForExit().then(() => {
        throw new Error("Production server exited before readiness.");
      }),
    ]);
  } finally {
    controller.abort();
  }
}

export async function waitForServerExit(
  server: LongLivedChildProcess,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      server.waitForExit(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Production server shutdown timed out.")),
          SERVER_SHUTDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function resolvePackageCliPath(packageName: string, binaryName: string): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = require(packageJsonPath) as {
    bin?: string | Record<string, string>;
  };
  const cliRelativePath = typeof packageJson.bin === "string"
    ? packageJson.bin
    : packageJson.bin?.[binaryName];

  if (!cliRelativePath) {
    throw new Error(`Installed ${packageName} package does not declare a CLI entrypoint.`);
  }

  return resolve(dirname(packageJsonPath), cliRelativePath);
}

export function resolvePrismaCliPath(): string {
  return resolvePackageCliPath("prisma", "prisma");
}

export function resolveNextCliPath(): string {
  return resolvePackageCliPath("next", "next");
}

export function resolvePlaywrightCliPath(): string {
  return resolvePackageCliPath("@playwright/test", "playwright");
}

export const defaultE2eRunnerDependencies: E2eRunnerDependencies = {
  createControlConnection(connectionString) {
    const client = new Client({ connectionString });
    return {
      connect: async () => {
        await client.connect();
      },
      end: () => client.end(),
      query: async (sql, values) => {
        const result = await client.query(sql, values);
        return { rowCount: result.rowCount };
      },
    };
  },
  runChildProcess: runSpawnedProcess,
  startLongLivedProcess: startSpawnedProcess,
  waitForServerReady: waitForHttpServerReady,
  waitForServerExit,
  generateCredentials: generateE2eAdminCredentials,
  nodeExecutable: process.execPath,
  prismaCliPath: resolvePrismaCliPath(),
  nextCliPath: resolveNextCliPath(),
  playwrightCliPath: resolvePlaywrightCliPath(),
};

async function runStage(
  operation: () => Promise<void>,
  failureMessage: string,
): Promise<void> {
  try {
    await operation();
  } catch {
    throw new E2eRunnerError(failureMessage);
  }
}

function isolatedChildEnvironment(targetUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: targetUrl };
  delete env[ADMIN_EMAIL_ENV];
  delete env[ADMIN_PASSWORD_ENV];
  return env;
}

export async function runE2eOrchestration(
  rawSourceUrl: string,
  dependencies: E2eRunnerDependencies = defaultE2eRunnerDependencies,
): Promise<void> {
  // Construction validates the source before any connection URL is derived.
  const lifecycle = new E2eDatabaseLifecycle(rawSourceUrl);
  const controlUrl = deriveE2eControlDatabaseUrl(rawSourceUrl);
  const targetUrl = lifecycle.targetDatabaseUrl;
  let control: E2eControlConnection;
  try {
    control = dependencies.createControlConnection(controlUrl);
  } catch {
    throw new E2eRunnerError("E2E control database client creation failed.");
  }
  let primaryError: E2eRunnerError | undefined;
  let cleanupFailed = false;
  let serverShutdownFailed = false;
  let serverExitConfirmed = false;
  let server: LongLivedChildProcess | undefined;

  try {
    await runStage(() => control.connect(), "E2E control database connection failed.");
    await runStage(
      () => lifecycle.createDatabase(control),
      "Disposable E2E database creation failed.",
    );

    const credentials = dependencies.generateCredentials();
    await runStage(
      () => dependencies.runChildProcess({
        executable: dependencies.nodeExecutable,
        args: [dependencies.prismaCliPath, "migrate", "deploy"],
        env: isolatedChildEnvironment(targetUrl),
      }),
      "E2E database migration failed.",
    );
    await runStage(
      () => dependencies.runChildProcess({
        executable: dependencies.nodeExecutable,
        args: [
          "--conditions=react-server",
          "--import",
          "tsx",
          "scripts/provision-e2e-admin.ts",
        ],
        env: {
          ...isolatedChildEnvironment(targetUrl),
          [ADMIN_EMAIL_ENV]: credentials.email,
          [ADMIN_PASSWORD_ENV]: credentials.password,
        },
      }),
      "E2E Admin provisioning failed.",
    );
    await runStage(
      () => dependencies.runChildProcess({
        executable: dependencies.nodeExecutable,
        args: [dependencies.nextCliPath, "build"],
        env: isolatedChildEnvironment(targetUrl),
      }),
      "E2E production build failed.",
    );
    await runStage(
      async () => {
        server = dependencies.startLongLivedProcess({
          executable: dependencies.nodeExecutable,
          args: [
            dependencies.nextCliPath,
            "start",
            "--hostname",
            "localhost",
            "--port",
            "3100",
          ],
          env: isolatedChildEnvironment(targetUrl),
        });
      },
      "E2E production server start failed.",
    );
    await runStage(
      () => dependencies.waitForServerReady(E2E_SERVER_URL, server!),
      "E2E production server readiness failed.",
    );
    await runStage(
      () => dependencies.runChildProcess({
        executable: dependencies.nodeExecutable,
        args: [dependencies.playwrightCliPath, "test"],
        env: {
          ...isolatedChildEnvironment(targetUrl),
          [ADMIN_EMAIL_ENV]: credentials.email,
          [ADMIN_PASSWORD_ENV]: credentials.password,
        },
      }),
      "E2E browser test failed.",
    );
  } catch (error) {
    primaryError = error instanceof E2eRunnerError
      ? error
      : new E2eRunnerError("E2E orchestration failed.");
  } finally {
    if (server) {
      try {
        await server.stop();
      } catch {
        serverShutdownFailed = true;
      }
      try {
        await dependencies.waitForServerExit(server);
        serverExitConfirmed = true;
      } catch {
        serverShutdownFailed = true;
      }
    }
    if (
      lifecycle.canDropDatabase(lifecycle.targetDatabaseName)
      && (!server || serverExitConfirmed)
    ) {
      try {
        await lifecycle.dropDatabase(control);
      } catch {
        cleanupFailed = true;
      }
    } else if (
      lifecycle.canDropDatabase(lifecycle.targetDatabaseName)
      && server
      && !serverExitConfirmed
    ) {
      cleanupFailed = true;
    }
    try {
      await control.end();
    } catch {
      cleanupFailed = true;
    }
  }

  if (serverShutdownFailed) {
    throw new E2eRunnerError(
      primaryError
        ? "E2E run failed, and production server shutdown also failed."
        : "E2E production server shutdown failed.",
    );
  }
  if (cleanupFailed) {
    throw new E2eRunnerError(
      primaryError
        ? "E2E run failed, and disposable database cleanup also failed."
        : "Disposable E2E database cleanup failed.",
    );
  }
  if (primaryError) throw primaryError;
}
