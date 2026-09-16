import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/app/group-buys/[slug]/actions", () => ({
  submitPublicOrderAction: vi.fn(),
  startSevenElevenStoreSelectionAction: vi.fn(),
}));

import { PublicOrderFormView } from "@/app/group-buys/[slug]/order-form";

const slug = "gb-AbCdEf0123_-xyZ9";
const draftKey = `group-buy-order-draft:${slug}`;
const scrollIntoView = vi.fn();
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
  vi.unstubAllGlobals();
});

const itemA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  salePrice: 120,
  stock: 5,
  purchaseLimit: 3,
  product: { name: "蘋果", unit: "箱" },
};
const pickup = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  pickupStartAt: null,
  pickupEndAt: null,
  pickupLocation: { name: "中正取貨點", address: "台北市中正區" },
};

function renderView(overrides: Partial<Parameters<typeof PublicOrderFormView>[0]> = {}) {
  return render(<PublicOrderFormView
    slug={slug}
    items={[itemA]}
    pickups={[pickup]}
    allowsSelfPickup
    allowsSevenEleven={false}
    storeSelectionReturn={false}
    storeSelectionError={false}
    selectedSevenElevenStore={null}
    state={{ status: "idle" }}
    pending={false}
    formAction={vi.fn()}
    {...overrides}
  />);
}

function orderDraft(savedAt = Date.now()) {
  return JSON.stringify({
    version: 1,
    savedAt,
    values: {
      quantities: { [itemA.id]: "2" },
      fulfillmentMethod: "SEVEN_ELEVEN",
      selectedPickupId: pickup.id,
      customerName: "王小明",
      customerPhone: "0912-345-678",
    },
  });
}

test("renders accessible customer, pickup, quantity, and submit controls", () => {
  renderView();
  expect(screen.getByLabelText("訂購人姓名")).toBeRequired();
  expect(screen.getByLabelText("手機號碼")).toBeRequired();
  expect(screen.getByRole("radio", { name: /中正取貨點/ })).toBeChecked();
  expect(screen.getByLabelText("蘋果數量")).toHaveAttribute("max", "3");
  expect(screen.getAllByRole("button", { name: "送出訂單" })).toHaveLength(2);
  for (const submit of screen.getAllByRole("button", { name: "送出訂單" })) expect(submit).toBeEnabled();
});

test("places product quantity before customer contact fields", () => {
  renderView();
  const quantity = screen.getByLabelText("蘋果數量");
  const customerName = screen.getByLabelText("訂購人姓名");
  expect(quantity.compareDocumentPosition(customerName) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("disables stock-zero and purchaseLimit-zero items with clear explanations", () => {
  renderView({ items: [
    { ...itemA, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stock: 0 },
    { ...itemA, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", stock: null, purchaseLimit: 0, product: { name: "橘子", unit: "袋" } },
  ] });
  expect(screen.getByLabelText("蘋果數量")).toBeDisabled();
  expect(screen.getAllByText("已無庫存")).toHaveLength(2);
  expect(screen.getByLabelText("橘子數量")).toBeDisabled();
  expect(screen.getByText("目前不可購買")).toBeVisible();
});

test("renders public-safe errors as an alert", () => {
  renderView({ state: { status: "error", message: "商品庫存不足，請重新整理後調整數量。" } });
  expect(screen.getByRole("alert")).toHaveTextContent("商品庫存不足");
});

test("genuinely invalid store selection still shows the retry warning before an order succeeds", () => {
  renderView({ allowsSevenEleven: true, storeSelectionReturn: true, storeSelectionError: true });
  expect(screen.getByRole("alert")).toHaveTextContent("無法使用這次的 7-ELEVEN 門市選擇，請重新選擇。");
  expect(screen.queryByRole("heading", { name: "訂購成功" })).not.toBeInTheDocument();
});

test("success keeps identifiers and fallback credentials out of the customer presentation", () => {
  const managementCode = "A".repeat(43);
  renderView({ state: {
    status: "success",
    publicCode: "ord-AbCdEf0123_-xyZ9",
    totalAmount: 240,
    managementCode,
  } });
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("訂購成功");
  expect(status).toHaveTextContent("訂單金額");
  expect(status).not.toHaveTextContent("ord-AbCdEf0123_-xyZ9");
  expect(status).toHaveTextContent("240");
  expect(status).toHaveTextContent("自取");
  expect(status).toHaveTextContent("中正取貨點");
  expect(status).toHaveTextContent("台北市中正區");
  expect(status).not.toHaveTextContent(managementCode);
  expect(status).not.toHaveTextContent("備用訂單存取碼");
  expect(screen.queryByTestId("management-code")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /存取碼/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看訂單" })).toHaveAttribute(
    "href",
    "/orders/ord-AbCdEf0123_-xyZ9",
  );
  expect(screen.queryByRole("button", { name: "送出訂單" })).not.toBeInTheDocument();
});

test("successful 7-ELEVEN order summarizes the selected store without exposing credentials", () => {
  const managementCode = "B".repeat(43);
  renderView({
    allowsSevenEleven: true,
    selectedSevenElevenStore: {
      id: "123456",
      name: "權威門市",
      address: "臺北市權威路 1 號",
      selectionToken: "S".repeat(43),
    },
    state: { status: "success", publicCode: "ord-AbCdEf0123_-xyZ9", totalAmount: 240, managementCode },
  });

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("7-ELEVEN 門市取貨");
  expect(status).toHaveTextContent("7-ELEVEN 權威門市");
  expect(status).toHaveTextContent("臺北市權威路 1 號");
  expect(status).not.toHaveTextContent(managementCode);
  expect(status).not.toHaveTextContent("備用訂單存取碼");
});

test("pending disables the fieldset and submit button to prevent duplicate submissions", () => {
  renderView({ pending: true });
  const submits = screen.getAllByRole("button", { name: "送出中…" });
  expect(submits).toHaveLength(2);
  for (const submit of submits) expect(submit).toBeDisabled();
  expect(screen.getByLabelText("訂購人姓名")).toBeDisabled();
  expect(screen.getByLabelText("蘋果數量")).toBeDisabled();
});

test("empty order summary stays compact and uses the light public visual treatment", () => {
  renderView();
  const summary = screen.getByLabelText("訂單摘要");
  expect(summary).toHaveTextContent("尚未選擇商品");
  expect(summary).toHaveClass("bg-stone-50", "py-3");
  expect(summary).not.toHaveClass("bg-stone-900", "text-stone-50", "shadow-sm");
});

test("mobile submit bar and desktop submit remain native actions for the same form", () => {
  renderView();
  const bar = screen.getByTestId("mobile-submit-bar");
  const mobileSubmit = screen.getByTestId("mobile-submit");
  const desktopSubmit = screen.getByTestId("desktop-submit");
  expect(bar).toHaveClass("fixed", "sm:hidden");
  expect(mobileSubmit).toHaveAttribute("type", "submit");
  expect(desktopSubmit).toHaveAttribute("type", "submit");
  expect(mobileSubmit.closest("form")).toBe(desktopSubmit.closest("form"));
});

test("both fulfillment methods render as native radios inside selectable cards", () => {
  renderView({ allowsSevenEleven: true });
  const selfPickup = screen.getByRole("radio", { name: "自取" });
  const sevenEleven = screen.getByRole("radio", { name: "7-ELEVEN 門市取貨" });
  expect(selfPickup).toBeChecked();
  expect(selfPickup.closest("label")).toHaveClass("cursor-pointer");
  expect(sevenEleven.closest("label")).toHaveClass("cursor-pointer");
});

test("one available fulfillment method is presented without a redundant radio choice", () => {
  const { container } = renderView();
  expect(screen.getByText("此團購目前提供以下取貨方式。")).toBeVisible();
  expect(screen.queryByRole("radio", { name: "自取" })).not.toBeInTheDocument();
  expect(container.querySelector('input[name="fulfillmentMethod"]')).toHaveValue("SELF_PICKUP");
  expect(container.querySelector('input[name="groupBuyPickupId"]')).toBeChecked();
});

test("shows only the fulfillment details for the selected method", () => {
  renderView({ allowsSevenEleven: true });
  expect(screen.getByRole("radio", { name: /中正取貨點/ })).toBeVisible();
  expect(screen.queryByText("尚未選擇 7-ELEVEN 門市")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: "7-ELEVEN 門市取貨" }));
  expect(screen.queryByRole("radio", { name: /中正取貨點/ })).not.toBeInTheDocument();
  expect(screen.getByText("尚未選擇 7-ELEVEN 門市")).toBeVisible();
  expect(screen.getByRole("button", { name: "選擇 7-ELEVEN 門市" })).toBeEnabled();
});

test("returned 7-ELEVEN store belongs to fulfillment details and can be reselected", () => {
  renderView({
    allowsSevenEleven: true,
    selectedSevenElevenStore: {
      id: "123456",
      name: "權威門市",
      address: "臺北市權威路 1 號",
      selectionToken: "A".repeat(43),
    },
  });
  expect(screen.getByRole("radio", { name: "7-ELEVEN 門市取貨" })).toBeChecked();
  expect(screen.getByText("7-ELEVEN 權威門市")).toBeVisible();
  expect(screen.getByText("店號：123456")).toBeVisible();
  expect(screen.getByText("地址：臺北市權威路 1 號")).toBeVisible();
  expect(screen.getByRole("button", { name: "重新選擇門市" })).toBeEnabled();
});

test("order summary reflects product, fulfillment, pickup, and contact state", () => {
  renderView();
  fireEvent.change(screen.getByLabelText("蘋果數量"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("訂購人姓名"), { target: { value: "王小明" } });
  fireEvent.change(screen.getByLabelText("手機號碼"), { target: { value: "0912-345-678" } });

  const summary = within(screen.getByLabelText("訂單摘要"));
  expect(screen.getByLabelText("訂單摘要")).toHaveClass("bg-stone-50/70", "shadow-sm");
  expect(screen.getByLabelText("訂單摘要")).not.toHaveClass("bg-stone-900", "text-stone-50");
  expect(summary.getByText("蘋果")).toBeVisible();
  expect(summary.getByText("× 2")).toBeVisible();
  expect(summary.getAllByText("$240")).toHaveLength(2);
  expect(summary.getByText("訂單總額")).toBeVisible();
  expect(summary.getByText("中正取貨點")).toBeVisible();
  expect(summary.getByText("王小明 · 0912-345-678")).toBeVisible();
  expect(screen.queryByText("請確認訂單內容，確認無誤後送出。")).not.toBeInTheDocument();
});

test("keeps the existing Server Action field names without exposing internal binding state", () => {
  const token = "A".repeat(43);
  const { container } = renderView({
    allowsSevenEleven: true,
    selectedSevenElevenStore: { id: "123456", name: "權威門市", address: "臺北市權威路 1 號", selectionToken: token },
  });
  expect(container.querySelector('input[name="groupBuySlug"]')).toBeInTheDocument();
  expect(container.querySelector('input[name^="item:"]')).toBeInTheDocument();
  expect(container.querySelector(`input[name="price:${itemA.id}"]`)).toHaveValue("120");
  expect(container.querySelector('input[name="fulfillmentMethod"]')).toBeInTheDocument();
  expect(container.querySelector('input[name="storeSelectionToken"]')).toHaveValue(token);
  expect(container.querySelector('input[name="customerName"]')).toBeInTheDocument();
  expect(container.querySelector('input[name="customerPhone"]')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(token);
  expect(document.body).not.toHaveTextContent("seven_eleven_selection_binding");
});

test("presents the confirmation amount without an estimate disclaimer", () => {
  renderView();
  expect(screen.getAllByText("訂單總額")).not.toHaveLength(0);
  expect(screen.queryByText("預估總額")).not.toBeInTheDocument();
  expect(screen.queryByText("以下金額依目前頁面售價試算，實際訂單仍以伺服器驗證結果為準。")).not.toBeInTheDocument();
});

test("saves current draft synchronously before starting 7-ELEVEN selection without internal tokens", () => {
  const selectionToken = "SECRET_SELECTION_TOKEN";
  renderView({
    allowsSevenEleven: true,
    selectedSevenElevenStore: { id: "123456", name: "權威門市", address: "臺北市權威路 1 號", selectionToken },
  });
  fireEvent.change(screen.getByLabelText("蘋果數量"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("訂購人姓名"), { target: { value: "王小明" } });
  fireEvent.change(screen.getByLabelText("手機號碼"), { target: { value: "0912-345-678" } });
  fireEvent.click(screen.getByRole("button", { name: "重新選擇門市" }));

  const stored = window.sessionStorage.getItem(draftKey);
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!)).toMatchObject({
    version: 1,
    values: {
      quantities: { [itemA.id]: "2" },
      fulfillmentMethod: "SEVEN_ELEVEN",
      selectedPickupId: pickup.id,
      customerName: "王小明",
      customerPhone: "0912-345-678",
    },
  });
  expect(stored).not.toContain(selectionToken);
  expect(stored).not.toContain("selectionToken");
  expect(stored).not.toContain("browserBinding");
  expect(stored).not.toContain("ECPay");
});

test("restores a valid draft after store selection while keeping the authoritative returned store", async () => {
  window.sessionStorage.setItem(draftKey, orderDraft());
  renderView({
    allowsSevenEleven: true,
    storeSelectionReturn: true,
    selectedSevenElevenStore: { id: "654321", name: "伺服器門市", address: "臺北市伺服器路 2 號", selectionToken: "A".repeat(43) },
  });

  await waitFor(() => expect(screen.getByLabelText("蘋果數量")).toHaveValue(2));
  expect(screen.getByLabelText("訂購人姓名")).toHaveValue("王小明");
  expect(screen.getByLabelText("手機號碼")).toHaveValue("0912-345-678");
  expect(screen.getByRole("radio", { name: "7-ELEVEN 門市取貨" })).toBeChecked();
  expect(screen.getAllByText("7-ELEVEN 伺服器門市")).toHaveLength(2);
  expect(screen.getByText("店號：654321")).toBeVisible();
});

test("does not restore a draft belonging to another Group Buy", async () => {
  window.sessionStorage.setItem("group-buy-order-draft:gb-other", orderDraft());
  renderView({ allowsSevenEleven: true, storeSelectionReturn: true });
  await waitFor(() => expect(screen.getByRole("radio", { name: "7-ELEVEN 門市取貨" })).toBeChecked());
  expect(screen.getByLabelText("蘋果數量")).toHaveValue(null);
  expect(screen.getByLabelText("訂購人姓名")).toHaveValue("");
  expect(window.sessionStorage.getItem("group-buy-order-draft:gb-other")).not.toBeNull();
});

test("ignores and removes an expired draft", async () => {
  window.sessionStorage.setItem(draftKey, orderDraft(Date.now() - 31 * 60 * 1000));
  renderView({ allowsSevenEleven: true, storeSelectionReturn: true });
  await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).toBeNull());
  expect(screen.getByLabelText("蘋果數量")).toHaveValue(null);
});

test("malformed draft data fails safely and is removed", async () => {
  window.sessionStorage.setItem(draftKey, "{not-json");
  expect(() => renderView({ allowsSevenEleven: true, storeSelectionReturn: true })).not.toThrow();
  await waitFor(() => expect(window.sessionStorage.getItem(draftKey)).toBeNull());
  expect(screen.getByLabelText("訂購人姓名")).toHaveValue("");
});

test("successful order clears its draft and stale store query without losing terminal success", async () => {
  window.sessionStorage.setItem(draftKey, orderDraft());
  window.history.replaceState({ preserved: true }, "", `/group-buys/${slug}?storeSelection=consumed-token&storeSelectionError=unavailable&keep=value`);
  renderView({
    allowsSevenEleven: true,
    storeSelectionReturn: true,
    storeSelectionError: true,
    state: { status: "success", publicCode: "ord-AbCdEf0123_-xyZ9", totalAmount: 240, managementCode: "A".repeat(43) },
  });

  expect(screen.getByRole("heading", { name: "訂購成功" })).toBeVisible();
  expect(screen.queryByText("無法使用這次的 7-ELEVEN 門市選擇，請重新選擇。")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看訂單" })).toHaveAttribute("href", "/orders/ord-AbCdEf0123_-xyZ9");
  await waitFor(() => {
    expect(window.sessionStorage.getItem(draftKey)).toBeNull();
    expect(window.location.search).toBe("?keep=value");
  });
  expect(window.history.state).toEqual({ preserved: true });
});

test("store-selection return scrolls the fulfillment details into view after restoration", async () => {
  window.sessionStorage.setItem(draftKey, orderDraft());
  renderView({ allowsSevenEleven: true, storeSelectionReturn: true });
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  expect(screen.getByTestId("fulfillment-details")).toHaveAttribute("id", "fulfillment-details");
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
});
