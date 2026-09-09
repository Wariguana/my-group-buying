import "dotenv/config";
import { runE2eOrchestration } from "./lib/e2e-runner";

try {
  if (process.argv.length !== 2 || !process.env.DATABASE_URL) {
    throw new Error();
  }
  await runE2eOrchestration(process.env.DATABASE_URL);
} catch (error) {
  const message = error instanceof Error ? error.message : "E2E runner failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
