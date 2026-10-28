import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { QbuyForm } from "@/components/qbuy/form";
import { OperationForm } from "@/app/admin/(protected)/payments/form";
import { refundStatusLabel, checkoutNextStep } from "@/lib/checkout/presentation";

const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); router.refresh.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const props = { operation: "event", base: { shipmentId: "shipment" }, label: "記錄物流", fields: [{ name: "status", label: "新狀態", options: ["SHIPPED", "DELIVERED"] }] };
const payload = (index: number) => JSON.parse(fetchMock.mock.calls[index][1].body).data;

test("consecutive acknowledged shipment events use different keys without reloading the page", async () => {
  fetchMock.mockImplementation(() => Promise.resolve(new Response('{"ok":true}')));
  render(<QbuyForm {...props}/>);
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("操作已完成。");
  fireEvent.change(screen.getByLabelText("新狀態"), { target: { value: "DELIVERED" } });
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2));
  expect(payload(0).status).toBe("SHIPPED"); expect(payload(1).status).toBe("DELIVERED");
  expect(payload(0).requestId).not.toBe(payload(1).requestId);
});

test("an ambiguous response keeps the request key and exposes a readable alert for retry", async () => {
  fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 })).mockResolvedValueOnce(new Response('{"ok":true}'));
  render(<QbuyForm {...props}/>);
  fireEvent.submit(screen.getByRole("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("請重新整理確認目前狀態後再重試");
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("操作已完成。");
  expect(payload(0).requestId).toBe(payload(1).requestId);
});

test("a second submit during an in-flight command cannot send another mutation", async () => {
  let finish!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
  render(<QbuyForm {...props}/>);
  const form = screen.getByRole("form"); fireEvent.submit(form); fireEvent.submit(form);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button")).toBeDisabled();
  finish(new Response('{"ok":true}'));
  await screen.findByText("操作已完成。");
});

test("bank receipt date/time is interpreted as Taipei wall time independent of browser timezone", async () => {
  fetchMock.mockResolvedValue(new Response('{"ok":true}'));
  render(<OperationForm operation="receipt" label="核實入帳" fields={[{ name: "bankReceivedAt", label: "銀行入帳時間", type: "datetime-local" }]}/>);
  fireEvent.change(screen.getByLabelText("銀行入帳時間", { exact: true }), { target: { value: "2026-10-28T10:30" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("已儲存。");
  expect(payload(0).bankReceivedAt).toBe("2026-10-28T02:30:00.000Z");
});

test("invalid bank time is reported without a request or unhandled event rejection", async () => {
  render(<OperationForm operation="receipt" label="核實入帳" fields={[{ name: "bankReceivedAt", label: "銀行入帳時間", type: "datetime-local" }]}/>);
  fireEvent.submit(screen.getByRole("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("請輸入臺灣時間");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("refund and receipt messages distinguish evidence, completion and liability", () => {
  expect(refundStatusLabel("REFUNDED")).toBe("已退款");
  expect(refundStatusLabel("PROCESSING")).toContain("尚未確認完成");
  expect(refundStatusLabel("PENDING")).toContain("尚未執行退款");
  expect(checkoutNextStep("REPORTED")).toContain("請勿重複付款");
  expect(checkoutNextStep("RECEIVED")).toContain("正式訂單尚在處理");
});
