import "dotenv/config";
import { expireCheckouts } from "../src/lib/checkout/service";
import { validateE2eSourceDatabaseUrl, validateE2eTargetDatabaseUrl } from "./lib/e2e-database";
import { assertDeployment } from "../src/lib/operations/config";
import { workerTick } from "../src/lib/operations/worker";
import { getDb } from "../src/lib/db";
if (["production", "staging"].includes(process.env.QBUY_ENV ?? "")) assertDeployment();
else { try { validateE2eSourceDatabaseUrl(process.env.DATABASE_URL ?? ""); } catch { validateE2eTargetDatabaseUrl(process.env.DATABASE_URL ?? ""); } }
try { console.log(await workerTick("checkouts", () => expireCheckouts())); }
catch { console.error("CHECKOUT_WORKER_FAILED"); process.exitCode = 1; }
finally { await getDb().$disconnect(); }
