export {};

try {
  const { runCreateFirstAdminCli } = await import(
    "./lib/create-first-admin-cli"
  );

  process.exitCode = await runCreateFirstAdminCli({ target: "production" });
} catch {
  process.stderr.write("Production Admin bootstrap failed.\n");
  process.exitCode = 1;
}
