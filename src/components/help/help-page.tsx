import Link from "next/link";
import { buttonStyles, disclosureStyles, linkStyles, messageStyles, titleStyles } from "@/components/consumer/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { helpArticles, type HelpArticle, type HelpSection } from "@/app/help/articles";
import styles from "./help-center.module.css";

export function HelpPage({ article, preview = false }: { article: HelpArticle; preview?: boolean }) {
  const blocked = article.policy && !preview;
  const sections: HelpSection[] = blocked ? [
    { id: "publication", title: "正式政策尚未發布", paragraphs: ["營運主體、聯絡管道及正式政策尚未完成核定。本頁只公告發布狀態，不提供條款草稿作為交易同意或個資蒐集的正式告知。"] },
    { id: "pending", title: "待營運與法律審查", items: article.blockers },
    { id: "next", title: "目前可查閱的流程說明", links: [{ label: "購物協助中心", href: "/help" }, { label: "聯絡資訊狀態", href: "/help/contact" }] },
  ] : article.sections;
  return <>
    <nav aria-label="協助中心導覽" className={styles.breadcrumb}><Link href="/" className={buttonStyles.secondary}>返回商城</Link><Link href="/help" className={buttonStyles.secondary}>購物協助中心</Link></nav>
    <header className={styles.intro}><h1 className={titleStyles.page}>{article.title}</h1><p className={styles.description}>{article.description}</p></header>
    <p className={`${article.policy ? messageStyles.warning : messageStyles.info} ${styles.notice}`} role="note">{blocked ? "尚未發布：內容仍待營運與法律審查，現階段尚無核定版本。" : article.notice}</p>
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="協助中心側邊導覽">
        <p className={styles.navTitle}>購物協助中心</p><nav aria-label="說明頁面">{helpArticles.map(topic => <Link key={topic.slug} href={`/help/${topic.slug}`} aria-current={topic.slug === article.slug ? "page" : undefined} className={`${linkStyles.row} ${styles.topicLink}`}>{topic.title}</Link>)}</nav>
        <p className={styles.navTitle}>本頁章節</p><nav aria-label="本頁章節">{sections.map(section => <a key={section.id} href={`#${section.id}`} className={linkStyles.row}>{section.title}</a>)}</nav>
      </aside>
      <article className={styles.article} aria-label={article.title} data-policy-status={article.policy ? blocked ? "unpublished" : "draft-preview" : undefined}>
        <details className={styles.mobileContents}><summary className={`${disclosureStyles} ${styles.footerSummary}`}>本頁章節<Icon name="chevron" className={styles.chevron} /></summary><nav aria-label="本頁章節">{sections.map(section => <a key={section.id} href={`#${section.id}`} className={linkStyles.row}>{section.title}</a>)}</nav></details>
        {sections.map(section => <section key={section.id} id={section.id} tabIndex={-1} className={styles.section}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {section.items && <ul>{section.items.map(item => <li key={item}>{item}</li>)}</ul>}
          {section.questions?.map(item => <details key={item.question} className={styles.faq}><summary className={disclosureStyles}>{item.question}</summary><p>{item.answer}</p></details>)}
          {section.links && <div className={styles.sectionLinks}>{section.links.map(link => <Link key={link.href} href={link.href} className={buttonStyles.secondary}>{link.label}</Link>)}</div>}
        </section>)}
        {article.policy && !blocked && <section id="publication-blockers" tabIndex={-1} className={styles.section}><h2>待營運確認，尚不得發布</h2><ul>{article.blockers?.map(item => <li key={item}>{item}</li>)}</ul></section>}
      </article>
    </div>
  </>;
}
