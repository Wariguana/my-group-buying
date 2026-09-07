import { emitKeypressEvents } from "node:readline";

export class TerminalInputCancelledError extends Error {
  constructor() {
    super("Terminal input was cancelled.");
    this.name = "TerminalInputCancelledError";
  }
}

type HiddenInputStream = NodeJS.ReadStream & {
  isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
};

type HiddenOutputStream = Pick<NodeJS.WriteStream, "write"> & { isTTY?: boolean };

export async function readHiddenInput(
  prompt: string,
  input: HiddenInputStream = process.stdin,
  output: HiddenOutputStream = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive terminal input is required.");
  }

  const previousRawMode = input.isRaw ?? false;
  const wasPaused = input.isPaused();
  const characters: string[] = [];
  let rawModeChanged = false;

  output.write(prompt);
  emitKeypressEvents(input);

  return new Promise<string>((resolve, reject) => {
    const cleanup = () => {
      input.off("keypress", onKeypress);
      input.off("error", onError);
      if (rawModeChanged) input.setRawMode(previousRawMode);
      if (wasPaused) input.pause();
    };

    const finish = (result: { value: string } | { error: unknown }) => {
      try {
        cleanup();
      } catch {
        reject(new Error("Terminal state restoration failed."));
        return;
      }
      output.write("\n");
      if ("error" in result) reject(result.error);
      else resolve(result.value);
    };

    function onError() {
      finish({ error: new Error("Terminal input failed.") });
    }

    function onKeypress(value: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean }) {
      if (key.ctrl && key.name === "c") {
        finish({ error: new TerminalInputCancelledError() });
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish({ value: characters.join("") });
        return;
      }
      if (key.name === "backspace") {
        characters.pop();
        return;
      }
      if (value && !key.ctrl && !key.meta) characters.push(...Array.from(value));
    }

    input.on("keypress", onKeypress);
    input.once("error", onError);
    try {
      input.setRawMode(true);
      rawModeChanged = true;
      input.resume();
    } catch {
      finish({ error: new Error("Terminal input failed.") });
    }
  });
}
