import "dotenv/config";
import { runNotifications } from "../src/lib/qbuy/notifications";
import { workerTick } from "../src/lib/operations/worker";
import { assertDeployment, featureEnabled } from "../src/lib/operations/config";
import { getDb } from "../src/lib/db";
assertDeployment();
try { console.log(await workerTick("notifications", () => featureEnabled("LINE_PUSH") ? runNotifications() : Promise.resolve(0))); }
catch { console.error("NOTIFICATION_WORKER_FAILED"); process.exitCode = 1; }
finally { await getDb().$disconnect(); }
