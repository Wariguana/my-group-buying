import Link from "next/link";
import { buttonStyles, titleStyles } from "@/components/consumer/ui/primitives";

export default function HelpNotFound() {
  return <section><h1 className={titleStyles.page}>找不到這份說明</h1><p className="my-4 text-stone-600">請從購物協助中心選擇現有的說明主題。</p><Link href="/help" className={buttonStyles.secondary}>返回購物協助中心</Link></section>;
}
