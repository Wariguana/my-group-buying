import { validateE2eTargetDatabaseUrl } from "./lib/e2e-database";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

async function provision(): Promise<void> {
  if (!databaseUrl || !email || !password || process.argv.length !== 2) {
    throw new Error("Invalid E2E Admin provisioning environment.");
  }
  validateE2eTargetDatabaseUrl(databaseUrl);

  // Application database modules are loaded only after the child environment is
  // confirmed to contain an isolated target URL.
  const [{ createFirstAdmin }, { getDb }] = await Promise.all([
    import("@/lib/auth/bootstrap-admin"),
    import("@/lib/db"),
  ]);
  const database = getDb();
  try {
    await createFirstAdmin({ email, password });
  } finally {
    await database.$disconnect();
  }
}

try {
  await provision();
} catch {
  process.stderr.write("E2E Admin provisioning failed.\n");
  process.exitCode = 1;
}
