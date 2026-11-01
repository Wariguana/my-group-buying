import Link from "next/link";
import { linkStyles } from "@/components/consumer/ui/primitives";
import { findHelpArticle, helpGroups } from "@/app/help/articles";
import { FooterAccordion } from "./footer-accordion";
import styles from "./help-center.module.css";

function FooterLinks({ slugs }: { slugs: string[] }) {
  return <ul className={styles.footerLinks}>{slugs.map(slug => {
    const article = findHelpArticle(slug)!;
    return <li key={slug}><Link href={`/help/${slug}`} className={`${linkStyles.row} ${styles.footerLink}`}><span>{article.title}</span>{article.policy && <span className={styles.pendingTag}>待核定</span>}</Link></li>;
  })}</ul>;
}

export function ConsumerFooter() {
  return <footer className={styles.footer}>
    <div className={styles.footerDesktop} data-footer-layout="desktop">{helpGroups.map(group => <section key={group.title}>
      <h2 className={styles.footerTitle}>{group.title}</h2>
      <nav aria-label={`${group.title}連結`}><FooterLinks slugs={group.slugs} /></nav>
    </section>)}</div>
    <div className={styles.footerMobile} data-footer-layout="mobile">{helpGroups.map(group => <FooterAccordion key={group.title} title={group.title}>
      <nav aria-label={`${group.title}連結`}><FooterLinks slugs={group.slugs} /></nav>
    </FooterAccordion>)}</div>
    <p className={styles.slogan}>一起買，更簡單。</p>
  </footer>;
}
