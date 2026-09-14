// @vitest-environment node

import { expect, test } from "vitest";
import {
  buildBackupFilename,
  parseBackupDestination,
  requirePostgresDatabaseUrl,
} from "../scripts/lib/postgres-tools";

test("builds a UTC timestamped custom-format backup filename", () => {
  expect(buildBackupFilename(new Date("2026-09-15T01:02:03.456Z")))
    .toBe("my-group-buying-20260915T010203-456Z.dump");
});

test("accepts only the documented backup destination option", () => {
  expect(parseBackupDestination([])).toBeUndefined();
  expect(parseBackupDestination(["--destination", "D:\\safe backups"])).toBe("D:\\safe backups");
  expect(() => parseBackupDestination(["--other", "value"])).toThrow("Usage:");
});

test.each([
  undefined,
  "",
  " mysql://localhost/data",
  "mysql://localhost/data",
  "postgresql://localhost",
  "postgresql://localhost/data#secret",
])("rejects an unsafe PostgreSQL URL without echoing it: %s", (value) => {
  expect(() => requirePostgresDatabaseUrl(value)).toThrow();
});
