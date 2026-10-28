# 4A 安全審查與剩餘關卡

此為原始碼審查及本機／隔離自動化結果，不是外部滲透測試或法規認證。正式憑證與資料未接觸。

|範圍|目前控制／證據|剩餘事項|
|---|---|---|
|LINE OAuth|隨機 state/nonce/PKCE S256、定時比較 state、verify issuer/audience/expiry/nonce；session token hash 存 DB；既有 auth tests|正式 callback、provider、拒絕/登出/真機驗收待完成|
|Admin|server requireAdmin/getCurrentAdmin；密碼雜湊、DB session、HttpOnly/Lax/production Secure；新持久帳號限流 10/15min＋全域100/min|edge IP limiter、防分散式 DoS、帳號與復原權限實際設定|
|Checkout/QB ownership|查單、付款截圖、取消均以伺服器登入與 DB ownership 查詢；不接受 client totals/status|外部 Staging 權限驗收|
|取消退款物流|Admin checks、交易內重查、requestId、DB locks、immutable financial evidence；兩名 Admin 競態 integration|真實銀行/物流核實與權限分工|
|銀行/運費/門市設定|新增 ConfigurationAudit，同 transaction 寫 actor/time/target/內容 fingerprint，DB trigger 禁改刪；避免在 audit 再複製完整銀行資訊|secret manager／管理員稽核查詢權限與異地保存|
|CSRF|API 檢查 Origin、Server Actions 的 Origin/Host 防護、SameSite；外部選店 callback 採其專用檢核，不全域封鎖|TLS edge 必須覆寫 forwarding headers，固定 Host allowlist|
|高風險限流|DB 原子 upsert 共享計數；checkout/customer/admin、QB 操作及截圖上傳限流；LINE start 全域120/min|全域限制可能被 DoS 消耗；正式 edge IP/WAF 為必要補充|
|截圖|最大5MiB、真實 JPG/PNG decode、像素/頁數限制、重新編碼去 metadata；DB bytea 私有；下載 ownership/Admin、private no-store、nosniff/CSP sandbox|保存期限／個資告知與外部備份權限未核准|
|SQL/XSS|檢視 src 無 unsafe raw SQL／dangerouslySetInnerHTML；查詢參數化，展示 React escaping；外部 HTML 有 escape|持續 PR 審查，不宣稱無所有漏洞|
|秘密與日誌|server-only、無 public token、錯誤只用有限代碼；worker不輸出交易 payload；pool idle failure只固定字串|平台 HTTP logs 必須遮蔽 query OAuth code、Authorization、Cookie、form body；日志目的與保存期限待核准|
|真實 LINE|兩個啟用開關、Provider／身份／同意、固定 retry key、23h/8次限制；outbox與主交易分離|LINE accepted≠收到≠閱讀；正式推播與封鎖/退追蹤同步未驗收|
|ECPay|正式環境需 LOGISTICS_EXTERNAL；選店不等於寄件；既有簽章/選店nonce/一次性領用檢查|目前沒有啟用真實物流狀態 webhook；未來介接需簽章、時間窗、重播id/冪等設計|
|部署誤設|preflight 拒絕 E2E_*、Quick Tunnel、共享dev DB、錯誤 callback；功能預設關閉；staging禁止真實外部副作用|必須從 npm start/受管容器入口啟動；秘密與環境隔離仍需平台驗收|
|DB|每程序pool上限/timeout、獨立migration role、append-only audit權限樣板與DB triggers|實際供應商角色、TLS CA、backup role、網段驗收|
|依賴|npm audit --omit=dev 發現 fast-uri moderate GHSA-hrr3-gc8f-f4qj，無 high/critical；沒有自行更換套件|moderate需維護追蹤；GitHub Security/Trivy結果以本次PR checks為準|

限流使用雜湊身份，無原始 email；最久24h後由worker清理過期限流列。worker未運行會保留列，不影響過窗重置。限流拒絕目前使用既有通用錯誤回應（非獨立429），避免暴露帳號存在性；edge應有明確429與Retry-After。

法規待確認：個資蒐集告知與目的、付款證明與備份保留、消費者取消退款條款、食品品質與退回處理、客服窗口與事件通報責任。由負責人安排合格顧問審核；本次不自行給出法定保存年限或保證符合所有規定。

## 2026-10-28 依賴安全更新

本次即時 `npm audit --omit=dev` 與 4A 交接結果不同：原 lock 命中 Next critical／high、Zod high 與 fast-uri moderate。這是已知受影響版本的掃描結果，不表示本專案已遭攻擊，也不把特定 RCE 前置條件一律視為已滿足。

- Next 16.3.8 → 16.4.1，採公告列出的最低修補版本；eslint-config-next 同步 16.4.1。[Server Actions DoS 公告](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) 及 [typed-array cache 公告](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) 說明修補必要性；[SVG image optimization 公告](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) 另有 sharp 版本前置條件。本專案仍保留 sharp ≥0.35.5。
- Zod 4.5.4 → 4.6.6，修補 [大型集合驗證記憶體耗盡](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)；[上游修補](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd)。
- fast-uri 3.1.7 → 3.1.9，僅更新原依賴範圍內的 lock；未新增根依賴或新框架。

修補後 `.temp/audit-fixed.json` 的 info／low／moderate／high／critical 均為 0。此結論限本次 npm 掃描資料與鎖定依賴，不替代容器／秘密掃描、滲透測試或外部營運驗收。完整回歸與 GitHub CI/Security 證據列於本次品質驗收文件。

完整開發依賴掃描另發現測試工具的告警，已在既有版本範圍內修補：Vitest 4.1.12、Vite 8.3.5、Undici 8.12.3，以及 brace-expansion 1.1.21／5.0.12。未新增根依賴。[Vitest 公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp)、[Vite 公告](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw)、[Undici 公告](https://github.com/nodejs/undici/security/advisories/GHSA-2m5v-pch6-74hx)。`.temp/audit-all-fixed.json` 的完整（包含 dev）掃描亦為 0 vulnerabilities。
