import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { assertDeployment, featureEnabled } from "../src/lib/operations/config";
import { workerTick } from "../src/lib/operations/worker";
import { expireCheckouts } from "../src/lib/checkout/service";
import { runNotifications } from "../src/lib/qbuy/notifications";
import { getDb } from "../src/lib/db";
assertDeployment();
const name = process.argv[2];
if (name !== "checkouts" && name !== "notifications") throw new Error("WORKER_NAME_REQUIRED");
let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });
try {
  do {
    try {
      const result = await workerTick(name, () => name === "checkouts" ? expireCheckouts(100) : featureEnabled("LINE_PUSH") ? runNotifications() : Promise.resolve(0));
      console.log(JSON.stringify({ worker: name, at: new Date().toISOString(), ...result }));
    } catch { console.error(JSON.stringify({ worker: name, error: "WORKER_FAILED" })); if (process.argv.includes("--once")) process.exitCode = 1; }
    if (!stopped && !process.argv.includes("--once")) await setTimeout(30000);
  } while (!stopped && !process.argv.includes("--once"));
} finally { await getDb().$disconnect(); }
