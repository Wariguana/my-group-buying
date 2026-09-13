import "dotenv/config";

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import {
  deriveE2eControlDatabaseUrl,
  E2eDatabaseLifecycle,
} from "./lib/e2e-database";

function resolvePackageCliPath(packageName: string, binaryName: string): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = require(packageJsonPath) as {
    bin?: string | Record<string, string>;
  };
  const cliRelativePath = typeof packageJson.bin === "string"
    ? packageJson.bin
    : packageJson.bin?.[binaryName];
  if (!cliRelativePath) throw new Error(`Installed ${packageName} package has no ${binaryName} CLI entrypoint.`);
  return resolve(dirname(packageJsonPath), cliRelativePath);
}

function runChild(executable: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(executable, args, {
      env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", rejectChild);
    child.once("close", (code) => {
      if (code === 0) resolveChild();
      else rejectChild(new Error("Order integration child process failed."));
    });
  });
}

async function main(): Promise<void> {
  const sourceUrl = process.env.DATABASE_URL;
  if (process.argv.length !== 2 || !sourceUrl) {
    throw new Error("DATABASE_URL is required and runner arguments are not accepted.");
  }

  const lifecycle = new E2eDatabaseLifecycle(sourceUrl);
  const control = new Client({ connectionString: deriveE2eControlDatabaseUrl(sourceUrl) });
  let connected = false;
  let primaryError: unknown;

  try {
    await control.connect();
    connected = true;
    await lifecycle.createDatabase(control);
    const targetEnvironment = { ...process.env, DATABASE_URL: lifecycle.targetDatabaseUrl };
    await runChild(
      process.execPath,
      [resolvePackageCliPath("prisma", "prisma"), "migrate", "deploy"],
      targetEnvironment,
    );
    await runChild(
      process.execPath,
      [resolvePackageCliPath("vitest", "vitest"), "run", "tests/integration/order-create-concurrency.test.ts"],
      { ...targetEnvironment, ORDER_INTEGRATION_TEST: "1" },
    );
  } catch (error) {
    primaryError = error;
  } finally {
    let cleanupError: unknown;
    if (connected && lifecycle.canDropDatabase(lifecycle.targetDatabaseName)) {
      try {
        await lifecycle.dropDatabase(control);
      } catch (error) {
        cleanupError = error;
      }
    }
    if (connected) {
      try {
        await control.end();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (cleanupError) {
      throw new Error(
        primaryError
          ? "Order integration failed and disposable database cleanup failed."
          : "Disposable order integration database cleanup failed.",
      );
    }
  }

  if (primaryError) throw primaryError;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Order integration failed."}\n`);
  process.exitCode = 1;
}
