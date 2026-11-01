import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/checkout/queries", () => ({
  checkoutLabels: { REPORTED: "待 QBUY 確認", FINALIZED: "正式訂單已成立" },
}));
vi.mock("@/lib/qbuy/domain", () => ({
  labels: { PAID: "已付款", CANCELLED: "已取消／退款另列" },
}));

import { FormalOrderCard, PurchaseCard } from "@/components/admin/transaction-cards";

afterEach(cleanup);

const createdAt = new Date("2026-11-01T02:18:00.000Z");
test("purchase card distinguishes a purchase from a formally created order", () => {
  render(
    <PurchaseCard data={{
      customerName: "陳小姐", customerPhone: "09**-***-001", status: "REPORTED",
      createdAt, totalAmount: 1280, orderCount: 0, groupCount: 2,
    }}>
      <p>請先核對銀行實際入帳</p>
    </PurchaseCard>,
  );
  expect(screen.getByText("本次購買應收總額")).toBeVisible();
  expect(screen.getByText("正式訂單 0 筆 · 配送群組 2 個")).toBeVisible();
  expect(screen.getByText("待 QBUY 確認")).toBeVisible();
  expect(screen.queryByText("已付款")).not.toBeInTheDocument();
});

test("deep-linked purchase action details can start expanded", () => {
  render(
    <PurchaseCard defaultOpen data={{
      customerName: "陳小姐", customerPhone: "09**-***-001", status: "FINALIZED",
      createdAt, totalAmount: 200, orderCount: 1, groupCount: 1,
    }}>
      <p>取消審核中</p>
    </PurchaseCard>,
  );
  expect(screen.getByText("取消審核中")).toBeVisible();
  const details = screen.getByText("查看商品、付款、取消與配送詳情").closest("details");
  expect(details).toHaveAttribute("open");
});

test("formal order card supports noninteractive development preview", () => {
  render(
    <FormalOrderCard data={{
      orderNumber: "QB202611010001", groupTitle: "測試團購",
      customerName: "王先生", status: "PAID", createdAt, totalAmount: 860,
    }}>
      <span>模擬資料</span>
    </FormalOrderCard>,
  );
  expect(screen.getByText("QB202611010001")).toBeVisible();
  expect(screen.getByText("已付款")).toBeVisible();
  expect(screen.getByText("模擬資料")).toBeVisible();
  expect(screen.queryByRole("link", { name: "查看完整購買與履約資訊" })).not.toBeInTheDocument();
});
