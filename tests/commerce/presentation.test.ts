import { expect, test } from "vitest";
import { specificationLabel } from "@/lib/commerce/presentation";

test("customer presentation localizes a default SKU without changing its stored snapshot", () => {
  const snapshot = { specification: "DEFAULT-AACC81CB-17A0-4034-A346-98FFB01FDC7C" };
  expect(specificationLabel(snapshot.specification)).toBe("預設規格");
  expect(snapshot.specification).toBe("DEFAULT-AACC81CB-17A0-4034-A346-98FFB01FDC7C");
});
test.each(["顏色：黑／尺寸：S", "BLACK-S", "DEFAULT-SPECIAL"])("preserves an explicit specification %s", value => {
  expect(specificationLabel(value)).toBe(value);
});
