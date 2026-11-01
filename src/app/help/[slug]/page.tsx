import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findHelpArticle, policyDraftPreviewAllowed } from "../articles";
import { HelpPage } from "@/components/help/help-page";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = findHelpArticle((await params).slug);
  if (!article) return {};
  return { title: `${article.title}${article.policy ? "（尚未核定）" : ""}｜QBUY 快易購`, description: article.description, ...(article.policy ? { robots: { index: false, follow: false } } : {}) };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const article = findHelpArticle((await params).slug);
  if (!article) notFound();
  return <HelpPage article={article} preview={policyDraftPreviewAllowed(process.env)} />;
}
