import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "pg";
import {
  deriveE2eControlDatabaseUrl,
  E2eDatabaseLifecycle,
  type E2eDatabaseControl,
} from "./e2e-database";

const ADMIN_EMAIL_ENV = "E2E_ADMIN_EMAIL";
const ADMIN_PASSWORD_ENV = "E2E_ADMIN_PASSWORD";

export type ChildProcessRequest = Readonly<{
  executable: string;
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}>;

export type E2eControlConnection = E2eDatabaseControl & {
  connect(): Promise<void>;
  end(): Promise<void>;
};

export type E2eRunnerDependencies = Readonly<{
  createControlConnection(connectionString: string): E2eControlConnection;
  runChildProcess(request: ChildProcessRequest): Promise<void>;
  generateCredentials(): Readonly<{ email: string; password: string }>;
  nodeExecutable: string;
  npxExecutable: string;
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
  generateCredentials: generateE2eAdminCredentials,
  nodeExecutable: process.execPath,
  npxExecutable: process.platform === "win32" ? "npx.cmd" : "npx",
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

  try {
    await runStage(() => control.connect(), "E2E control database connection failed.");
    await runStage(
      () => lifecycle.createDatabase(control),
      "Disposable E2E database creation failed.",
    );

    const credentials = dependencies.generateCredentials();
    await runStage(
      () => dependencies.runChildProcess({
        executable: dependencies.npxExecutable,
        args: ["prisma", "migrate", "deploy"],
        env: { ...process.env, DATABASE_URL: targetUrl },
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
          ...process.env,
          DATABASE_URL: targetUrl,
          [ADMIN_EMAIL_ENV]: credentials.email,
          [ADMIN_PASSWORD_ENV]: credentials.password,
        },
      }),
      "E2E Admin provisioning failed.",
    );
  } catch (error) {
    primaryError = error instanceof E2eRunnerError
      ? error
      : new E2eRunnerError("E2E orchestration failed.");
  } finally {
    if (lifecycle.canDropDatabase(lifecycle.targetDatabaseName)) {
      try {
        await lifecycle.dropDatabase(control);
      } catch {
        cleanupFailed = true;
      }
    }
    try {
      await control.end();
    } catch {
      cleanupFailed = true;
    }
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
