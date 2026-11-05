import { adminIcons, type AdminIconName } from "./navigation";

export function AdminIcon({ name }: { name: AdminIconName }) {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={adminIcons[name]} /></svg>;
}
