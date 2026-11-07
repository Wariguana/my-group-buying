import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { OperationForm } from "@/app/admin/(protected)/payments/form";

const fetchMock = vi.fn();
const fields = [
  { name: "bankName", label: "銀行名稱", value: "測試銀行" },
  { name: "bankCode", label: "銀行代碼", value: "004" },
  { name: "bankAccount", label: "收款帳號", value: "001234567890" },
  { name: "accountName", label: "戶名", value: "測試戶名" },
  { name: "enabled", label: "開放轉帳結帳", type: "checkbox", value: "false" },
];
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refresh.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const show = () => render(<OperationForm operation="bank" label="儲存銀行設定" fields={fields}/>);

test("receipt date keeps its stable accessible name while showing the Taiwan timezone hint", () => {
  render(<OperationForm operation="receipt" label="確認已收款" fields={[{ name: "bankReceivedAt", label: "銀行入帳時間", type: "datetime-local" }]}/>);
  expect(screen.getByLabelText("銀行入帳時間", { exact: true })).toHaveAttribute("type", "datetime-local");
  expect(screen.getByText("（臺灣時間 UTC+8）")).toBeVisible();
});

test("bank validation identifies each invalid field, retains input and focuses the first without sending a write", async () => {
  show();
  fireEvent.change(screen.getByLabelText("銀行代碼"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("收款帳號"), { target: { value: "abc" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(await screen.findByRole("alert")).toHaveTextContent("請修正標示的欄位");
  const code = screen.getByLabelText("銀行代碼");
  expect(code).toHaveAttribute("aria-invalid", "true");
  expect(code).toHaveAccessibleDescription(/3 位數字/);
  expect(code).toHaveValue("12");
  await waitFor(() => expect(code).toHaveFocus());
  expect(screen.getByLabelText("收款帳號")).toHaveAttribute("aria-invalid", "true");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("moving focus to submit defers blur errors so the first save click keeps its target", async () => {
  show();
  const name = screen.getByLabelText("戶名");
  fireEvent.change(name, { target: { value: "" } });
  const submit = screen.getByRole("button", { name: "儲存銀行設定" });
  fireEvent.blur(name, { relatedTarget: submit });
  expect(screen.queryByText("請輸入戶名。")).not.toBeInTheDocument();
  fireEvent.click(submit);
  expect(await screen.findByText("請輸入戶名。")).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("dirty bank drafts block navigation and unload; reverting to saved values removes the guard", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  show();
  fireEvent.change(screen.getByLabelText("銀行名稱"), { target: { value: "尚未儲存" } });
  expect(screen.getByText("有尚未儲存的銀行設定。")).toBeVisible();
  const link = document.createElement("a"); link.href = "/admin/more"; document.body.append(link);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true }); link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true); expect(confirm).toHaveBeenCalledOnce();
  const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.change(screen.getByLabelText("銀行名稱"), { target: { value: "測試銀行" } });
  const cleanUnload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(cleanUnload);
  expect(cleanUnload.defaultPrevented).toBe(false); link.remove();
});

test("acknowledged saves clear dirty warnings and preserve leading zeroes", async () => {
  fetchMock.mockResolvedValue(new Response('{"ok":true}'));
  show();
  fireEvent.change(screen.getByLabelText("戶名"), { target: { value: "更新戶名" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("已儲存。");
  expect(screen.queryByText("有尚未儲存的銀行設定。")).not.toBeInTheDocument();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).data).toMatchObject({ bankCode: "004", bankAccount: "001234567890", enabled: false });
  expect(refresh).toHaveBeenCalledOnce();
});

test("server field errors reach the corresponding control and keep the draft guarded", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "請修正標示的欄位。", fieldErrors: { bankAccount: ["請重新核對收款帳號。"] } }), { status: 400 }));
  show();
  fireEvent.change(screen.getByLabelText("戶名"), { target: { value: "更新戶名" } });
  fireEvent.submit(screen.getByRole("form"));
  await screen.findByText("請重新核對收款帳號。");
  await waitFor(() => expect(screen.getByLabelText("收款帳號")).toHaveFocus());
  expect(screen.getByText("有尚未儲存的銀行設定。")).toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
});
