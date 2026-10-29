import { describe, expect, test } from "vitest";
import { auditUiSource } from "../../scripts/lib/ui-consistency";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function fixture(source: string) {
  const root = mkdtempSync(path.join(tmpdir(), "qbuy-ui-guard-"));
  try {
    mkdirSync(path.join(root, "src/app"), { recursive: true });
    mkdirSync(path.join(root, "src/components"), { recursive: true });
    writeFileSync(path.join(root, "src/app/page.tsx"), source);
    return auditUiSource(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

describe("site-wide interaction consistency", () => {
  test("every route and conditional control uses the shared design contract", () => {
    const audit = auditUiSource();
    expect(audit.routes.length).toBeGreaterThanOrEqual(29);
    expect(audit.controls.length).toBeGreaterThanOrEqual(239);
    expect(audit.handlerControls).toHaveLength(2);
    expect(audit.violations).toEqual([]);
  });

  test("unclassified controls and misleading local aliases fail the gate", () => {
    const result = fixture('const fieldStyles = "custom-field"; export default () => <><button>Send</button><input className={fieldStyles}/><summary>Details</summary></>');
    expect(result.violations).toHaveLength(3);
  });

  test("real shared imports, import aliases and local aliases remain valid", () => {
    const result = fixture('import {buttonStyles as buttons, fieldStyles as field, disclosureStyles} from "@/components/ui/primitives"; const inputClassName = field; export default () => <><button className={buttons.primary}>Send</button><input className={inputClassName}/><summary className={disclosureStyles}>Details</summary></>');
    expect(result.controls).toHaveLength(3);
    expect(result.violations).toEqual([]);
  });

  test("page-specific color and sizing overrides cannot bypass a shared button", () => {
    const result = fixture('import {buttonStyles} from "@/components/ui/primitives"; export default () => <button className={`${buttonStyles.primary} bg-red-700 rounded-full min-h-8`}>Send</button>');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain("shared button visual overrides");
  });

  test("URL actions cannot regress to underlined or borderless labels", () => {
    const result = fixture('import {buttonStyles, linkStyles} from "@/components/ui/primitives"; export default () => <><a href="/orders" className={linkStyles.inline}>Orders</a><a href="/cart" className={buttonStyles.textAction}>Cart</a></>');
    expect(result.violations).toHaveLength(2);
    expect(result.violations.every(issue => issue.includes("visible button surface"))).toBe(true);
  });
});
