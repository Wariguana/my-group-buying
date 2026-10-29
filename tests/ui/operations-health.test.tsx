import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OperationsHealth } from "@/components/admin/operations-health";
const boundary = vi.hoisted(() => ({ health: vi.fn(), auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/current-admin", () => ({ requireAdmin: boundary.auth }));
vi.mock("@/lib/operations/health", () => ({ operationalHealth: boundary.health }));
import OperationsPage from "@/app/admin/(protected)/operations/page";

const health = () => ({ at: new Date("2026-10-29T00:00:00Z"), healthy: true, linePushEnabled: false,
  workers: ["checkouts", "notifications"].map(name => ({ name, hasRecord: true, lastSuccessAt: new Date("2026-10-29T00:00:00Z"), lastError: null as string | null, healthy: true })),
  queues: { expired: 0, reported: 0, anomalies: 0, unfinalized: 0, refunds: 0, cancellations: 0, shipmentPending: 0, shippingErrors: 0, returns: 0, notifications: 0, inventory: 0 },
});
afterEach(cleanup);

test("normal summary is compact while all zero metrics remain in collapsed diagnostics", () => {
  render(<OperationsHealth health={health()} />);
  expect(screen.getByRole("status")).toHaveTextContent("關鍵系統檢查正常");
  expect(screen.getByText("目前沒有監控佇列待辦。")).toBeVisible();
  expect(screen.getAllByRole("definition", { hidden: true })).toHaveLength(11);
  expect(screen.getByText("Checkout Worker").closest("details")).not.toHaveAttribute("open");
  expect(screen.queryByRole("link", { name: "前往處理" })).not.toBeInTheDocument();
});

test("only nonzero queues become action rows; they do not imply system health", () => {
  const h = health(); h.queues.reported = 3;
  render(<OperationsHealth health={h} />);
  const tasks = screen.getByRole("region", { name: "實際異常與待辦" });
  expect(within(tasks).getByText("待核帳超過 24 小時")).toBeVisible();
  expect(within(tasks).getByRole("link", { name: "前往處理" })).toHaveAttribute("href", "/admin/payments");
  expect(within(tasks).queryByText("可用庫存異常")).not.toBeInTheDocument();
});

test.each(["missing", "never", "stale", "failed"])("worker %s is distinct from zero queues", state => {
  const h = health(); h.healthy = false; h.workers[0].healthy = false;
  const worker = h.workers[0];
  if (state === "missing" || state === "never") Object.assign(worker, { hasRecord: state !== "missing", lastSuccessAt: null });
  if (state === "failed") worker.lastError = "WORKER_FAILED";
  render(<OperationsHealth health={h} />);
  expect(screen.getByRole("status")).toHaveTextContent("需要處理關鍵異常");
  const label = { missing: "無資料（未回報心跳）", never: "未執行（無成功紀錄）", stale: "已失聯（超過 3 分鐘）", failed: "執行失敗" }[state];
  expect(screen.getAllByText(label!, { exact: true })[0]).toBeVisible();
  expect(screen.getByText(/不能據此判定系統正常/)).toBeVisible();
});

test("read failure is unknown, exposes no counts or raw database error", async () => {
  boundary.health.mockRejectedValueOnce(new Error("private database URL"));
  render(await OperationsPage());
  expect(boundary.auth).toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("監控資料讀取失敗，系統狀態未知");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByText(/private database URL/)).not.toBeInTheDocument();
});
