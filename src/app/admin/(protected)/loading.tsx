import styles from "@/components/admin/admin.module.css";

export default function AdminLoading() {
  return <div role="status" aria-busy="true" className={styles.shellLoading}>
    <p>正在載入營運內容…</p><div aria-hidden="true" /><div aria-hidden="true" />
  </div>;
}
