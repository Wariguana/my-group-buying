// Test-process preload only. Never imported by application code.
import pg from "pg";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const isolated = url && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  && /^\/my_group_buying_e2e_[a-f0-9]{32}$/.test(url.pathname);

if (process.env.ADM_SHELL_FAULT_PROBE === "1" && process.env.QBUY_ENV === "test" && isolated) {
  const original = pg.Client.prototype.query;
  const flag = resolve(".temp/adm-preview/shell-read-fault");
  pg.Client.prototype.query = function (...args) {
    const sql = typeof args[0] === "string" ? args[0] : args[0]?.text;
    if (typeof sql === "string" && /^\s*SELECT\b/i.test(sql) && /"Checkout"/.test(sql) && existsSync(flag)) {
      const error = new Error("Synthetic ADM checkout read interruption");
      const callback = args.at(-1);
      if (typeof callback === "function") { queueMicrotask(() => callback(error)); return; }
      return Promise.reject(error);
    }
    return Reflect.apply(original, this, args);
  };
}
