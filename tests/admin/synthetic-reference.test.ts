// @vitest-environment node
import { expect, test, vi } from "vitest";
vi.mock("node:crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-123456789012" }));
import { syntheticBankReference } from "../../e2e/lib/reference";
import { refundInput } from "@/lib/qbuy/domain";
test("even an all-numeric UUID cannot make the synthetic bank reference look like a full account", () => {
  const input = { requestId: "00000000-0000-4000-8000-123456789012", refundId: "00000000-0000-4000-8000-123456789012", status: "PROCESSING", amount: 100, evidence: "隔離測試銀行查核", confirmed: true, secondConfirmation: false };
  expect(refundInput.safeParse({ ...input, bankReference: input.requestId }).success).toBe(false);
  expect(refundInput.safeParse({ ...input, bankReference: syntheticBankReference() }).success).toBe(true);
  expect(syntheticBankReference()).not.toMatch(/\d{10,}/);
});
