import Link from "next/link";
import { logoutAdmin } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth/current-admin";
import { PageHeader, linkStyles } from "@/components/ui/primitives";
import { AdminIcon } from "@/components/admin/admin-icon";
import { adminNavigation } from "@/components/admin/navigation";
import styles from "@/components/admin/admin.module.css";
import { LogoutButton } from "../logout-button";

export default async function AdminMorePage() {
  const admin = await requireAdmin();
  return <div className={styles.morePage}>
    <PageHeader title="更多功能" description="依營運工作分類，找到需要的功能。" />
    <nav aria-label="更多營運功能" className={styles.moreGroups}>
      {adminNavigation.map(group => ({ ...group, links: group.links.filter(link => !link.primary) })).filter(group => group.links.length).map(group =>
        <section key={group.title} className={styles.moreGroup}>
          <h2>{group.title}</h2>
          <ul>{group.links.map(link => <li key={link.id}>
            <Link href={link.href} className={`${linkStyles.row} ${styles.moreLink}`}>
              <span className={styles.moreIcon}><AdminIcon name={link.icon} /></span>
              <span><span className={styles.moreLinkTitle}>{link.label}</span><span className={styles.moreDescription}>{link.description}</span></span>
              <AdminIcon name="arrow" />
            </Link>
          </li>)}</ul>
        </section>)}
    </nav>
    <section id="account" className={styles.moreAccount} aria-labelledby="more-account-title">
      <div><h2 id="more-account-title">管理帳號</h2><p className={styles.accountLabel}>目前登入帳號</p><p className={styles.accountEmail}>{admin.email}</p></div>
      <form action={logoutAdmin}><LogoutButton /></form>
    </section>
  </div>;
}
