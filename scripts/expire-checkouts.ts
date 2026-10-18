import "dotenv/config";
import { expireCheckouts } from "../src/lib/checkout/service";
import { validateE2eSourceDatabaseUrl, validateE2eTargetDatabaseUrl } from "./lib/e2e-database";
import { getDb } from "../src/lib/db";
const url = process.env.DATABASE_URL ?? "";
try {
    validateE2eSourceDatabaseUrl(url);
}
catch {
    validateE2eTargetDatabaseUrl(url);
}
try {
    console.log({ expired: await expireCheckouts() });
}
finally {
    await getDb().$disconnect();
}
