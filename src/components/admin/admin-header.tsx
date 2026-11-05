"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonStyles, linkStyles } from "@/components/ui/primitives";
import { AdminIcon } from "./admin-icon";
import { useAdminDestination } from "./admin-nav";
import { adminNavigation } from "./navigation";
import styles from "./admin.module.css";

export function AdminHeader({ email, accountAction }: { email: string; accountAction: ReactNode }) {
  const destination = useAdminDestination();
  const title = adminNavigation.flatMap(group => group.links).find(link => link.id === destination)?.label ?? "更多功能";
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus({ preventScroll: true }); }

  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => { node.close(); document.body.style.overflow = previous; };
  }, [open]);

  return <>
    <header className={styles.appHeader}>
      <Link href="/admin" className={`${linkStyles.brand} ${styles.mobileBrand}`} aria-label="QBUY 營運後台總覽">QBUY <span>營運後台</span></Link>
      <p className={styles.headerLocation}><span>營運管理</span><AdminIcon name="arrow" /><span>{title}</span></p>
      <button ref={trigger} type="button" className={`${buttonStyles.textAction} ${styles.accountTrigger}`} aria-haspopup="dialog" aria-expanded={open} aria-controls="adm-account-dialog" onClick={() => setOpen(true)}>
        <AdminIcon name="account" /><span>帳號</span>
      </button>
    </header>
    <dialog ref={dialog} id="adm-account-dialog" aria-labelledby="adm-account-title" className={styles.accountDialog}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"));
        const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className={styles.accountDialogHeading}>
        <h2 id="adm-account-title">管理帳號</h2>
        <button type="button" onClick={close} aria-label="關閉帳號選單" className={buttonStyles.icon}><AdminIcon name="close" /></button>
      </div>
      <p className={styles.accountLabel}>目前登入帳號</p>
      <p className={styles.accountEmail}>{email}</p>
      <div className={styles.accountActions}>{accountAction}</div>
    </dialog>
  </>;
}
