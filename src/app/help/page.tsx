import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles, linkStyles, messageStyles, titleStyles } from "@/components/consumer/ui/primitives";
import { helpArticles, helpGroups } from "./articles";
import styles from "@/components/help/help-center.module.css";

export const metadata: Metadata = { title: "購物協助中心｜QBUY 快易購", description: "查看團購訂購、付款、取貨配送、取消退款與平台資訊。" };

export default function HelpCenterPage() {
  return <>
    <div className={styles.breadcrumb}><Link href="/" className={buttonStyles.secondary}>返回商城</Link></div>
    <header className={styles.intro}><h1 className={titleStyles.page}>購物協助中心</h1><p className={styles.description}>從第一次參加團購，到付款與取貨，找到這一步需要的說明。</p></header>
    <p role="note" className={`${messageStyles.info} ${styles.notice}`}>目前營運資訊與正式政策仍待核定。本中心先說明已確認的系統流程，不代表尚未開放的銀行、配送或客服已提供服務。</p>
    <div className={styles.hubGrid}>{helpGroups.map(group => <section key={group.title} className={styles.hubCard}><h2>{group.title}</h2><ul>{helpArticles.filter(article => group.slugs.includes(article.slug)).map(article => <li key={article.slug}><Link href={`/help/${article.slug}`} className={linkStyles.row}><span>{article.title}</span>{article.policy && <span className={styles.pendingTag}>待核定</span>}</Link><p>{article.description}</p></li>)}</ul></section>)}</div>
  </>;
}
