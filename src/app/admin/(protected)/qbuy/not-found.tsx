import Link from "next/link";
import { EmptyState, buttonStyles } from "@/components/ui/primitives";
export default function NotFound() { return <EmptyState title="找不到這筆購買紀錄" description="請確認編號，或返回訂單管理重新查詢。" action={<Link href="/admin/qbuy" className={buttonStyles.secondary}>返回訂單管理</Link>} />; }
