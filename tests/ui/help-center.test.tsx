import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { helpArticles, helpGroups, findHelpArticle, policyDraftPreviewAllowed } from "@/app/help/articles";
import { ConsumerFooter } from "@/components/help/consumer-footer";
import { HelpPage } from "@/components/help/help-page";

afterEach(cleanup);

test("every Footer destination resolves to an actual article with unique section anchors", () => {
  const slugs = helpGroups.flatMap(group => group.slugs);
  expect(new Set(slugs).size).toBe(9);
  expect(helpArticles.map(article => article.slug).sort()).toEqual([...slugs].sort());
  for (const article of helpArticles) {
    expect(new Set(article.sections.map(section => section.id)).size).toBe(article.sections.length);
    expect(article.sections.length).toBeGreaterThan(0);
    for (const link of article.sections.flatMap(section => section.links ?? [])) {
      expect(link.href).not.toBe("#");
      if (link.href.startsWith("/help/")) expect(findHelpArticle(link.href.slice(6))).toBeDefined();
    }
  }
  expect(findHelpArticle("not-a-topic")).toBeUndefined();
});

test("mobile Footer has independent accessible accordions, persistent inert panels and no duplicate brand logo", () => {
  const { container } = render(<ConsumerFooter />);
  const mobile = container.querySelector('[data-footer-layout="mobile"]')!;
  const buttons = within(mobile as HTMLElement).getAllByRole("button");
  expect(buttons).toHaveLength(2);
  const panels = buttons.map(button => container.querySelector<HTMLElement>(`[id="${button.getAttribute("aria-controls")}"]`)!);
  expect(new Set(panels).size).toBe(2);
  buttons.forEach((button, index) => {
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panels[index]).toHaveAttribute("aria-hidden", "true");
    expect(panels[index]).toHaveAttribute("inert");
    expect(panels[index]).toHaveAttribute("aria-labelledby", button.id);
  });
  fireEvent.click(buttons[0]); fireEvent.click(buttons[1]);
  buttons.forEach(button => expect(button).toHaveAttribute("aria-expanded", "true"));
  expect(panels[0]).not.toHaveAttribute("inert");
  expect(within(panels[0]).getByRole("link", { name: "付款方式" })).toHaveAttribute("href", "/help/payment");
  fireEvent.click(buttons[0]);
  expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
  expect(buttons[1]).toHaveAttribute("aria-expanded", "true");
  expect(panels[0]).toHaveAttribute("inert");
  expect(within(panels[0]).getByText("付款方式")).toBeInTheDocument();
  for (let click = 0; click < 8; click++) fireEvent.click(buttons[0]);
  expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
  expect(screen.getAllByText("一起買，更簡單。")).toHaveLength(1);
  expect(container.querySelector("img")).not.toBeInTheDocument();
});

test("formal environments cannot expose policy draft bodies or pretend they are approved", () => {
  expect(policyDraftPreviewAllowed({ NODE_ENV: "production", QBUY_ENV: "production" })).toBe(false);
  expect(policyDraftPreviewAllowed({ NODE_ENV: "development", QBUY_ENV: "production" })).toBe(false);
  expect(policyDraftPreviewAllowed({ NODE_ENV: "production" })).toBe(false);
  expect(policyDraftPreviewAllowed({ NODE_ENV: "production", QBUY_ENV: "test" })).toBe(false);
  expect(policyDraftPreviewAllowed({ NODE_ENV: "production", QBUY_ENV: "staging" })).toBe(true);
  expect(policyDraftPreviewAllowed({ NODE_ENV: "development" })).toBe(true);
  const article = findHelpArticle("privacy")!;
  const { container, rerender } = render(<HelpPage article={article} />);
  expect(container.querySelector('[data-policy-status="unpublished"]')).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "正式政策尚未發布" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "登入與識別資料（程式盤點）" })).not.toBeInTheDocument();
  rerender(<HelpPage article={article} preview />);
  expect(container.querySelector('[data-policy-status="draft-preview"]')).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "登入與識別資料（程式盤點）" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "待營運確認，尚不得發布" })).toBeVisible();
});

test("FAQ is keyboard-compatible native disclosure and distinguishes payment from bank confirmation", () => {
  const { container } = render(<HelpPage article={findHelpArticle("faq")!} />);
  const question = screen.getByText("上傳付款截圖就算付款完成嗎？", { exact: true });
  expect(question.closest("details")?.open).toBe(false);
  fireEvent.click(question);
  expect(question.closest("details")?.open).toBe(true);
  expect(within(question.closest("details")!).getByText(/仍要人工確認實際銀行入帳/)).toBeVisible();
  for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) expect(container.querySelector(anchor.getAttribute("href")!)).toBeInTheDocument();
});
