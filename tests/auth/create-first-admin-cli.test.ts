// @vitest-environment node

import { randomBytes } from "node:crypto";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adminEmailSchema } from "@/lib/auth/validation";
import {
  readVisibleInput,
  requireLocalDevelopmentDatabaseUrl,
  runCreateFirstAdminCli,
} from "../../scripts/lib/create-first-admin-cli";
import { TerminalInputCancelledError } from "../../scripts/lib/hidden-input";

const safeDatabaseUrl = "postgresql://localhost:5433/my_group_buying_dev";

function createFakeVisibleReadline(
  question: (prompt: string, options: { signal: AbortSignal }) => Promise<string>,
) {
  const sigintListeners = new Set<() => void>();
  const readline = {
    once: vi.fn((_event: "SIGINT", listener: () => void) => {
      sigintListeners.add(listener);
      return readline;
    }),
    off: vi.fn((_event: "SIGINT", listener: () => void) => {
      sigintListeners.delete(listener);
      return readline;
    }),
    question: vi.fn(question),
    close: vi.fn(),
  };
  return {
    factory: vi.fn(() => readline),
    readline,
    emitSigint: () => {
      for (const listener of [...sigintListeners]) listener();
    },
    sigintListenerCount: () => sigintListeners.size,
  };
}

function setup(overrides: {
  args?: string[];
  inputIsTTY?: boolean;
  outputIsTTY?: boolean;
  databaseUrl?: string;
  existingUser?: { id: string } | null;
  visibleAnswers?: string[];
  hiddenAnswers?: string[];
  createError?: unknown;
  disconnectError?: unknown;
} = {}) {
  let outputText = "";
  const output = {
    isTTY: overrides.outputIsTTY ?? true,
    write: vi.fn((value: string | Uint8Array) => {
      outputText += value.toString();
      return true;
    }),
  };
  const input = { isTTY: overrides.inputIsTTY ?? true };
  const findFirst = vi.fn().mockResolvedValue(overrides.existingUser ?? null);
  const disconnect = overrides.disconnectError === undefined
    ? vi.fn().mockResolvedValue(undefined)
    : vi.fn().mockRejectedValue(overrides.disconnectError);
  const getDb = vi.fn(() => ({ user: { findFirst }, $disconnect: disconnect }));
  const createFirstAdmin = overrides.createError === undefined
    ? vi.fn().mockResolvedValue({ email: "admin@example.com" })
    : vi.fn().mockRejectedValue(overrides.createError);
  const visibleAnswers = [...(overrides.visibleAnswers ?? [])];
  const hiddenAnswers = [...(overrides.hiddenAnswers ?? [])];
  const readVisible = vi.fn(async () => visibleAnswers.shift() ?? "");
  const readHidden = vi.fn(async () => hiddenAnswers.shift() ?? "");
  const loadDependencies = vi.fn(async () => ({
    getDb,
    parseEmail: (email: string) => adminEmailSchema.safeParse(email),
    createFirstAdmin,
    getBootstrapErrorCode: (error: unknown) =>
      typeof error === "object" && error !== null && "authCode" in error
        ? error.authCode as "INVALID_INPUT" | "USER_EXISTS" | "CONFLICT" | "FAILED"
        : undefined,
  }));

  return {
    options: {
      args: overrides.args ?? [],
      databaseUrl: overrides.databaseUrl ?? safeDatabaseUrl,
      input: input as NodeJS.ReadStream,
      output: output as unknown as NodeJS.WriteStream,
      loadDependencies,
      readVisible,
      readHidden,
    },
    outputText: () => outputText,
    loadDependencies,
    getDb,
    findFirst,
    disconnect,
    createFirstAdmin,
    readVisible,
    readHidden,
  };
}

test.each([
  "postgresql://localhost:5433/my_group_buying_dev",
  "postgres://127.0.0.1:5433/my_group_buying_dev",
])("accepts safe local development URL %s", (url) => {
  expect(requireLocalDevelopmentDatabaseUrl(url).href).toBe(url);
});

test("accepts credentials without exposing them in the database target", async () => {
  const databaseUrl =
    "postgresql://dummy_user:dummy_password@localhost:5433/my_group_buying_dev";
  expect(requireLocalDevelopmentDatabaseUrl(databaseUrl).href).toBe(databaseUrl);

  const context = setup({
    databaseUrl,
    existingUser: { id: "existing-user" },
  });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);

  expect(context.outputText().split("\n")[0]).toBe(
    "Database target: localhost:5433/my_group_buying_dev",
  );
  expect(context.outputText()).not.toContain("dummy_user");
  expect(context.outputText()).not.toContain("dummy_password");
  expect(context.outputText()).not.toContain(databaseUrl);
});

test.each([
  ["HTTP", "http://localhost:5433/my_group_buying_dev"],
  ["remote host", "postgresql://database.example.com:5433/my_group_buying_dev"],
  ["wrong port", "postgresql://localhost:5432/my_group_buying_dev"],
  ["other database", "postgresql://localhost:5433/my_group_buying_other"],
  ["disposable database", "postgresql://localhost:5433/my_group_buying_test_bootstrap_safe"],
  ["empty URL", ""],
  ["malformed URL", "not-a-url"],
] as const)("rejects %s without loading database code", async (_label, databaseUrl) => {
  expect(() => requireLocalDevelopmentDatabaseUrl(databaseUrl)).toThrow();
  const context = setup({ databaseUrl });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.loadDependencies).not.toHaveBeenCalled();
  expect(context.getDb).not.toHaveBeenCalled();
});

test("visible prompt success returns the answer and closes readline once", async () => {
  const fake = createFakeVisibleReadline(async () => "admin@example.com");

  await expect(readVisibleInput(
    "Email: ",
    { isTTY: true } as NodeJS.ReadStream,
    { isTTY: true, write: vi.fn() } as unknown as NodeJS.WriteStream,
    fake.factory,
  )).resolves.toBe("admin@example.com");

  expect(fake.readline.close).toHaveBeenCalledOnce();
  expect(fake.sigintListenerCount()).toBe(0);
});

test("visible prompt rejection closes readline and removes its SIGINT listener", async () => {
  const promptError = new Error("generated prompt failure");
  const fake = createFakeVisibleReadline(async () => { throw promptError; });

  await expect(readVisibleInput(
    "Email: ",
    { isTTY: true } as NodeJS.ReadStream,
    { isTTY: true, write: vi.fn() } as unknown as NodeJS.WriteStream,
    fake.factory,
  )).rejects.toBe(promptError);

  expect(fake.readline.close).toHaveBeenCalledOnce();
  expect(fake.sigintListenerCount()).toBe(0);
});

test("visible prompt SIGINT aborts the pending question and cleans up exactly once", async () => {
  let questionSignal: AbortSignal | undefined;
  const fake = createFakeVisibleReadline((_prompt, { signal }) => {
    questionSignal = signal;
    return new Promise<string>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  });

  const result = readVisibleInput(
    "Email: ",
    { isTTY: true } as NodeJS.ReadStream,
    { isTTY: true, write: vi.fn() } as unknown as NodeJS.WriteStream,
    fake.factory,
  );
  fake.emitSigint();

  await expect(result).rejects.toBeInstanceOf(TerminalInputCancelledError);
  expect(questionSignal?.aborted).toBe(true);
  expect(fake.readline.close).toHaveBeenCalledOnce();
  expect(fake.readline.off).toHaveBeenCalledOnce();
  expect(fake.sigintListenerCount()).toBe(0);
});

test.each([
  ["host override", "postgresql://localhost:5433/my_group_buying_dev?host=remote.example.com"],
  ["port override", "postgresql://localhost:5433/my_group_buying_dev?port=5432"],
  ["SSL option", "postgresql://localhost:5433/my_group_buying_dev?sslmode=require"],
  ["fragment", "postgresql://localhost:5433/my_group_buying_dev#anything"],
] as const)("rejects URL %s before loading dependencies or initializing DB", async (_label, databaseUrl) => {
  expect(() => requireLocalDevelopmentDatabaseUrl(databaseUrl)).toThrow();

  const context = setup({ databaseUrl });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.loadDependencies).not.toHaveBeenCalled();
  expect(context.getDb).not.toHaveBeenCalled();
});

test("rejects every CLI argument before DB initialization without echoing it", async () => {
  const context = setup({ args: ["--unexpected"] });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.outputText()).toBe("This command does not accept CLI arguments.\n");
  expect(context.outputText()).not.toContain("--unexpected");
  expect(context.loadDependencies).not.toHaveBeenCalled();
});

test.each([
  [false, true],
  [true, false],
])("rejects non-TTY input/output before DB initialization", async (inputIsTTY, outputIsTTY) => {
  const context = setup({ inputIsTTY, outputIsTTY });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.loadDependencies).not.toHaveBeenCalled();
});

test("existing User stops before email or password prompts", async () => {
  const context = setup({ existingUser: { id: "existing-user" } });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.findFirst).toHaveBeenCalledWith({ select: { id: true } });
  expect(context.readVisible).not.toHaveBeenCalled();
  expect(context.readHidden).not.toHaveBeenCalled();
  expect(context.createFirstAdmin).not.toHaveBeenCalled();
  expect(context.disconnect).toHaveBeenCalledOnce();
});

test("invalid email stops before confirmation and password", async () => {
  const context = setup({ visibleAnswers: ["invalid"] });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.readVisible).toHaveBeenCalledOnce();
  expect(context.readHidden).not.toHaveBeenCalled();
  expect(context.createFirstAdmin).not.toHaveBeenCalled();
});

test("Ctrl+C during the email prompt cancels safely and disconnects", async () => {
  const context = setup();
  context.options.readVisible = vi.fn().mockRejectedValue(new TerminalInputCancelledError());

  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.outputText()).toBe(
    "Database target: localhost:5433/my_group_buying_dev\nAdmin creation cancelled.\n",
  );
  expect(context.createFirstAdmin).not.toHaveBeenCalled();
  expect(context.disconnect).toHaveBeenCalledOnce();
});

test("confirmation other than exact CREATE cancels before password", async () => {
  const context = setup({ visibleAnswers: [" ADMIN@Example.COM ", "create"] });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.readHidden).not.toHaveBeenCalled();
  expect(context.createFirstAdmin).not.toHaveBeenCalled();
});

test("Ctrl+C during CREATE confirmation cancels safely before hidden input", async () => {
  const context = setup();
  context.options.readVisible = vi.fn()
    .mockResolvedValueOnce("admin@example.com")
    .mockRejectedValueOnce(new TerminalInputCancelledError());

  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.outputText()).toBe(
    "Database target: localhost:5433/my_group_buying_dev\n" +
    "Admin email: admin@example.com\n" +
    "Admin creation cancelled.\n",
  );
  expect(context.readHidden).not.toHaveBeenCalled();
  expect(context.createFirstAdmin).not.toHaveBeenCalled();
  expect(context.disconnect).toHaveBeenCalledOnce();
});

test("password mismatch stops without exposing either value", async () => {
  const first = randomBytes(18).toString("base64url");
  const second = randomBytes(18).toString("base64url");
  const context = setup({
    visibleAnswers: ["admin@example.com", "CREATE"],
    hiddenAnswers: [first, second],
  });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.createFirstAdmin).not.toHaveBeenCalled();
  expect(context.outputText()).toContain("Password confirmation does not match.");
  expect(context.outputText()).not.toContain(first);
  expect(context.outputText()).not.toContain(second);
});

test("normalizes email and passes the password unchanged to the existing service", async () => {
  const password = ` ${randomBytes(12).toString("hex")}Aa\u0301 `;
  const context = setup({
    visibleAnswers: [" ADMIN@Example.COM ", "CREATE"],
    hiddenAnswers: [password, password],
  });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(0);
  expect(context.createFirstAdmin).toHaveBeenCalledExactlyOnceWith({
    email: "admin@example.com",
    password,
  });
  expect(context.outputText()).toContain("Admin email: admin@example.com");
  expect(context.outputText()).toContain("First admin created: admin@example.com");
  expect(context.outputText()).not.toContain(password);
  expect(context.outputText()).not.toContain("passwordHash");
  expect(context.disconnect).toHaveBeenCalledOnce();
});

test.each([
  ["INVALID_INPUT", "Invalid first admin input."],
  ["USER_EXISTS", "Admin bootstrap is unavailable because a user already exists."],
  ["CONFLICT", "Admin bootstrap conflicted with another operation. Try again."],
  ["FAILED", "Admin bootstrap failed."],
] as const)("maps %s to a fixed safe message", async (authCode, message) => {
  const password = randomBytes(18).toString("base64url");
  const context = setup({
    visibleAnswers: ["admin@example.com", "CREATE"],
    hiddenAnswers: [password, password],
    createError: { authCode, sensitive: randomBytes(12).toString("hex") },
  });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.outputText()).toContain(message);
  expect(context.outputText()).not.toContain(password);
  expect(context.outputText()).not.toContain("sensitive");
  expect(context.disconnect).toHaveBeenCalledOnce();
});

test("maps unexpected failures to a generic message and still disconnects", async () => {
  const password = randomBytes(18).toString("base64url");
  const context = setup({
    visibleAnswers: ["admin@example.com", "CREATE"],
    hiddenAnswers: [password, password],
    createError: new Error(randomBytes(12).toString("hex")),
  });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.outputText()).toMatch(/Admin bootstrap failed\.\n$/);
  expect(context.outputText()).not.toContain(password);
  expect(context.disconnect).toHaveBeenCalledOnce();
});

test("sanitizes disconnect failures", async () => {
  const password = randomBytes(18).toString("base64url");
  const context = setup({
    visibleAnswers: ["admin@example.com", "CREATE"],
    hiddenAnswers: [password, password],
    disconnectError: new Error(randomBytes(12).toString("hex")),
  });
  await expect(runCreateFirstAdminCli(context.options)).resolves.toBe(1);
  expect(context.outputText()).toMatch(/Admin bootstrap failed\.\n$/);
  expect(context.outputText()).not.toContain(password);
});
