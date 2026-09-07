// @vitest-environment node

import { randomBytes } from "node:crypto";
import { PassThrough } from "node:stream";
import { expect, test } from "vitest";
import { readHiddenInput, TerminalInputCancelledError } from "../../scripts/lib/hidden-input";

function createTerminal(initialRawMode = false) {
  const input = new PassThrough() as PassThrough & NodeJS.ReadStream;
  const output = new PassThrough() as PassThrough & NodeJS.WriteStream;
  const rawModes: boolean[] = [];
  let written = "";

  input.isTTY = true;
  input.isRaw = initialRawMode;
  input.setRawMode = (mode: boolean) => {
    rawModes.push(mode);
    input.isRaw = mode;
    return input;
  };
  output.isTTY = true;
  output.on("data", (chunk) => { written += chunk.toString(); });

  return { input, output, rawModes, written: () => written };
}

test("resolves on Enter without echoing characters or masking symbols", async () => {
  const terminal = createTerminal();
  const secret = randomBytes(18).toString("base64url");
  const result = readHiddenInput("Password: ", terminal.input, terminal.output);
  terminal.input.write(secret);
  terminal.input.write("\r");

  await expect(result).resolves.toBe(secret);
  expect(terminal.written()).toBe("Password: \n");
  expect(terminal.written()).not.toContain(secret);
  expect(terminal.written()).not.toContain("*");
  expect(terminal.rawModes).toEqual([true, false]);
  expect(terminal.input.listenerCount("keypress")).toBe(0);
  expect(terminal.input.listenerCount("error")).toBe(0);
});

test("Backspace removes the last Unicode code point", async () => {
  const terminal = createTerminal();
  const prefix = randomBytes(10).toString("hex");
  const result = readHiddenInput("Password: ", terminal.input, terminal.output);
  terminal.input.write(`${prefix}\u{1f642}`);
  terminal.input.write("\b");
  terminal.input.write("\r");

  await expect(result).resolves.toBe(prefix);
  expect(terminal.written()).not.toContain(prefix);
});

test("Ctrl+C cancels and restores the previous raw mode", async () => {
  const terminal = createTerminal(true);
  const result = readHiddenInput("Password: ", terminal.input, terminal.output);
  terminal.input.write("\u0003");

  await expect(result).rejects.toBeInstanceOf(TerminalInputCancelledError);
  expect(terminal.rawModes).toEqual([true, true]);
  expect(terminal.input.listenerCount("keypress")).toBe(0);
  expect(terminal.input.listenerCount("error")).toBe(0);
});

test("stream errors restore terminal state and remove listeners", async () => {
  const terminal = createTerminal();
  const result = readHiddenInput("Password: ", terminal.input, terminal.output);
  terminal.input.emit("error", new Error("generated test stream failure"));

  await expect(result).rejects.toThrow("Terminal input failed.");
  expect(terminal.rawModes).toEqual([true, false]);
  expect(terminal.input.listenerCount("keypress")).toBe(0);
  expect(terminal.input.listenerCount("error")).toBe(0);
});

test("rejects non-TTY streams before changing terminal state", async () => {
  const terminal = createTerminal();
  terminal.input.isTTY = false;

  await expect(readHiddenInput("Password: ", terminal.input, terminal.output))
    .rejects.toThrow("Interactive terminal input is required.");
  expect(terminal.rawModes).toEqual([]);
});
