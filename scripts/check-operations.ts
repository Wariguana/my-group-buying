import "dotenv/config";
import { operationalHealth } from "../src/lib/operations/health";
import { getDb } from "../src/lib/db";
try { const h = await operationalHealth(); console.log(JSON.stringify(h)); if (!h.healthy || Object.values(h.queues).some(n => n > 0)) process.exitCode = 1; }
catch { console.error("OPERATIONS_CHECK_FAILED"); process.exitCode = 1; }
finally { await getDb().$disconnect(); }
