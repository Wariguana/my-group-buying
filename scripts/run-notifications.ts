import "dotenv/config";
import { runNotifications } from "../src/lib/qbuy/notifications";
import { getDb } from "../src/lib/db";
try { console.log(`Processed ${await runNotifications()} notification events.`); } finally { await getDb().$disconnect(); }
