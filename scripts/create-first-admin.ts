import "dotenv/config";

try {
  const { runCreateFirstAdminCli } = await import(
    "./lib/create-first-admin-cli"
  );

  process.exitCode = await runCreateFirstAdminCli();
} catch {
  process.stderr.write("Admin bootstrap failed.\n");
  process.exitCode = 1;
}
