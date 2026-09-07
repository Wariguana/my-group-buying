import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { readHiddenInput, TerminalInputCancelledError } from "./hidden-input";

const DEVELOPMENT_DATABASE = "my_group_buying_dev";

type CliInput = NodeJS.ReadStream & { isTTY?: boolean };
type CliOutput = Pick<NodeJS.WriteStream, "write"> & { isTTY?: boolean };
type BootstrapCode = "INVALID_INPUT" | "USER_EXISTS" | "CONFLICT" | "FAILED";
type VisibleReadline = {
  once(event: "SIGINT", listener: () => void): VisibleReadline;
  off(event: "SIGINT", listener: () => void): VisibleReadline;
  question(prompt: string, options: { signal: AbortSignal }): Promise<string>;
  close(): void;
};
type CreateVisibleReadline = (options: {
  input: Readable;
  output: Writable;
  terminal: true;
}) => VisibleReadline;

type ProductionDependencies = {
  getDb(): {
    user: { findFirst(args: { select: { id: true } }): Promise<{ id: string } | null> };
    $disconnect(): Promise<void>;
  };
  parseEmail(email: string): { success: true; data: string } | { success: false };
  createFirstAdmin(input: { email: string; password: string }): Promise<{ email: string }>;
  getBootstrapErrorCode(error: unknown): BootstrapCode | undefined;
};

type CliOptions = {
  args?: string[];
  databaseUrl?: string;
  input?: CliInput;
  output?: CliOutput;
  loadDependencies?: () => Promise<ProductionDependencies>;
  readVisible?: (prompt: string) => Promise<string>;
  readHidden?: (prompt: string) => Promise<string>;
};

export function requireLocalDevelopmentDatabaseUrl(rawUrl: string | undefined): URL {
  if (!rawUrl) throw new Error("Unsafe database target.");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Unsafe database target.");
  }

  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !["postgresql:", "postgres:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "5433" ||
    database !== DEVELOPMENT_DATABASE ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("Unsafe database target.");
  }
  return url;
}

async function loadProductionDependencies(): Promise<ProductionDependencies> {
  const [{ getDb }, { createFirstAdmin, AdminBootstrapError }, { adminEmailSchema }] =
    await Promise.all([
      import("@/lib/db"),
      import("@/lib/auth/bootstrap-admin"),
      import("@/lib/auth/validation"),
    ]);

  return {
    getDb,
    parseEmail: (email) => adminEmailSchema.safeParse(email),
    createFirstAdmin,
    getBootstrapErrorCode: (error) =>
      error instanceof AdminBootstrapError ? error.code : undefined,
  };
}

export async function readVisibleInput(
  prompt: string,
  input: CliInput,
  output: CliOutput,
  createReadline: CreateVisibleReadline = createInterface,
): Promise<string> {
  const readline = createReadline({
    input: input as Readable,
    output: output as Writable,
    terminal: true,
  });
  const questionController = new AbortController();

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const settle = (
      callback: () => void,
      abortQuestion = false,
    ) => {
      if (settled) return;
      settled = true;
      readline.off("SIGINT", onSigint);
      if (abortQuestion) questionController.abort();
      readline.close();
      callback();
    };
    const onSigint = () => {
      settle(() => reject(new TerminalInputCancelledError()), true);
    };

    readline.once("SIGINT", onSigint);
    try {
      void readline
        .question(prompt, { signal: questionController.signal })
        .then(
          (answer) => settle(() => resolve(answer)),
          (error: unknown) => settle(() => reject(error)),
        );
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

const errorMessages: Record<BootstrapCode, string> = {
  INVALID_INPUT: "Invalid first admin input.",
  USER_EXISTS: "Admin bootstrap is unavailable because a user already exists.",
  CONFLICT: "Admin bootstrap conflicted with another operation. Try again.",
  FAILED: "Admin bootstrap failed.",
};

export async function runCreateFirstAdminCli(options: CliOptions = {}): Promise<number> {
  const args = options.args ?? process.argv.slice(2);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  if (args.length > 0) {
    output.write("This command does not accept CLI arguments.\n");
    return 1;
  }
  if (!input.isTTY || !output.isTTY) {
    output.write("This command requires an interactive terminal.\n");
    return 1;
  }

  let databaseUrl: URL;
  try {
    databaseUrl = requireLocalDevelopmentDatabaseUrl(options.databaseUrl ?? process.env.DATABASE_URL);
  } catch {
    output.write("Admin bootstrap requires the local development database.\n");
    return 1;
  }

  output.write(`Database target: ${databaseUrl.hostname}:${databaseUrl.port}/${DEVELOPMENT_DATABASE}\n`);

  let dependencies: ProductionDependencies | undefined;
  let database: ReturnType<ProductionDependencies["getDb"]> | undefined;
  let outcome: { exitCode: number; message: string } | undefined;
  let operationError: unknown;

  try {
    dependencies = await (options.loadDependencies ?? loadProductionDependencies)();
    database = dependencies.getDb();

    if (await database.user.findFirst({ select: { id: true } })) {
      outcome = { exitCode: 1, message: errorMessages.USER_EXISTS };
    } else {
      const visible = options.readVisible ?? ((prompt) => readVisibleInput(prompt, input, output));
      const hidden = options.readHidden ?? ((prompt) => readHiddenInput(prompt, input, output));
      const emailResult = dependencies.parseEmail(await visible("Email: "));

      if (!emailResult.success) {
        outcome = { exitCode: 1, message: "Invalid admin email." };
      } else {
        const email = emailResult.data;
        output.write(`Admin email: ${email}\n`);
        if (await visible("Type CREATE to continue: ") !== "CREATE") {
          outcome = { exitCode: 1, message: "Admin creation cancelled." };
        } else {
          const password = await hidden("Password: ");
          const confirmation = await hidden("Confirm password: ");
          if (password !== confirmation) {
            outcome = { exitCode: 1, message: "Password confirmation does not match." };
          } else {
            await dependencies.createFirstAdmin({ email, password });
            outcome = { exitCode: 0, message: `First admin created: ${email}` };
          }
        }
      }
    }
  } catch (error) {
    operationError = error;
  } finally {
    if (database) {
      try {
        await database.$disconnect();
      } catch {
        operationError ??= new Error("Database disconnect failed.");
      }
    }
  }

  if (operationError !== undefined) {
    if (operationError instanceof TerminalInputCancelledError) {
      output.write("Admin creation cancelled.\n");
    } else {
      const code = dependencies?.getBootstrapErrorCode(operationError);
      output.write(`${code ? errorMessages[code] : "Admin bootstrap failed."}\n`);
    }
    return 1;
  }

  output.write(`${outcome?.message ?? "Admin bootstrap failed."}\n`);
  return outcome?.exitCode ?? 1;
}
