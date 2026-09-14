import "server-only";

type ServerEnvironment = Readonly<{
  nodeEnv: "development" | "production" | "test";
  databaseUrl: string;
}>;

export function readServerEnvironment(
  environment: Record<string, string | undefined> = process.env,
): ServerEnvironment {
  const nodeEnv = environment.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "production" && nodeEnv !== "test") {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  if (databaseUrl.trim() !== databaseUrl) {
    throw new Error("DATABASE_URL must not contain surrounding whitespace.");
  }

  try {
    const parsed = new URL(databaseUrl);
    if (
      (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:")
      || !parsed.hostname
      || parsed.pathname === ""
      || parsed.pathname === "/"
      || parsed.hash !== ""
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  return Object.freeze({ nodeEnv, databaseUrl });
}
