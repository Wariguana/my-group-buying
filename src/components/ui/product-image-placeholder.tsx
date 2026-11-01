import styles from "./product-image-placeholder.module.css";

export function ProductImagePlaceholder({ compact = false, failed = false }: { compact?: boolean; failed?: boolean }) {
  return (
    <div className={`${styles.placeholder}${compact ? ` ${styles.compact}` : ""}`} data-product-image-placeholder={failed ? "failed" : "missing"}>
      <svg className={styles.artwork} viewBox="0 0 160 128" width={160} height={128} aria-hidden="true" focusable="false">
        <ellipse cx="80" cy="113" rx="53" ry="7" fill="#bd8e5e" opacity=".13" />
        <path d="m35 45 45-13 45 13-45 17Z" fill="#d6a16b" />
        <path d="m80 32 45 13-45 17Z" fill="#e3b27d" />
        <path d="m35 48 45 14v49L41 99q-6-2-6-8Z" fill="#edc390" />
        <path d="m80 62 45-14v43q0 6-6 8l-39 12Z" fill="#dca772" />
        <path d="m35 45 45 17-13 18q-2 3-6 2L22 68q-5-2-2-6l12-15q1-2 3-2Z" fill="#f5d5ac" />
        <path d="m80 62 45-17q2 0 4 2l11 14q3 4-2 6L99 81q-5 2-7-2Z" fill="#f3ca96" />
        <path d="m47 83 16 5v8l-16-5Z" fill="#fff3df" opacity=".65" />
        <path d="M80 66v41" stroke="#ca945e" strokeWidth="1.5" opacity=".45" />
        <path d="m67 18-2-7m16 5 2-8m13 13 5-5" fill="none" stroke="#dc9a55" strokeWidth="4" strokeLinecap="round" opacity=".75" />
      </svg>
      <span className={compact ? "sr-only" : styles.caption}>{failed ? "圖片暫時無法顯示" : "暫無商品圖片"}</span>
    </div>
  );
}
