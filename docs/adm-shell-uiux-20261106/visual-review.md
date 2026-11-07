# 視覺審查與截圖

> 這是原 ADM Shell 交付的截圖快照，仍包含當時的舊制入口。現行 More 已改為 8 個次要入口，不再使用這些圖片宣稱最新畫面已驗證；請見 [清理驗證紀錄](../legacy-retirement-verification.md)。

以下逐張使用圖像檢視工具打開 Chromium PNG 審查，並配合真實 Playwright 操作；沒有把無溢位斷言當成視覺驗收。圖片是合成隔離資料，只隱藏 Next 開發浮層。最終人工營運驗收仍待使用者確認。

## 第一輪 → 修正 → 回歸

第一輪以 320／390／910／1440px 先實作及截圖，全部可操作，但視覺及狀態審查提出下列修正。保留的 [第一輪 910px](screenshots/first-iteration/more-910.png) 與 [第一輪桌面](screenshots/first-iteration/overview-1440.png) 是本次第一版實作，**不是原 main 畫面**。

| 第一輪觀察 | 實際修正／驗證 |
| --- | --- |
| 平板僅 16px 左右距離，字與功能區較靠邊 | 640px 起 24px gutters；More 兩欄仍有足夠文字寬度 |
| Sidebar 13px、說明 12px 偏小；固定 px 不利使用者文字縮放 | 導覽 14px／說明 13px，新的 Shell 字體用 rem；驗證 320px＋200% 字體、長合成帳號 |
| More 列 80px 偏鬆，手機一次能看到的次要功能少 | 列最小 72px，自然擴高容納換行；保留清楚圖示／標題／說明 |
| Header 40px 與內容 24px 不對齊，是平板 CSS 蓋過桌面 utility | ≥1024px 內容明確回到 40px，重新截 1024／1440px |
| 200% 字體時，原生 dialog 的 UA max-width 使內容額外變窄 | 設定明確 max-width，縮小標題／關閉鈕間距；長帳號正常換行，關閉／登出可操作 |
| pending 文字可能擠到底欄標籤 | 以不變更布局的細提示條及輔助技術 status 回饋；攔住真實 RSC 請求驗證等待到完成 |
| Skip link 取得焦點後會以 relative 進入桌面 grid | 改為取得焦點時固定於畫面上方，保留可見焦點與跳至 main |
| 深棕上的原焦點色對比 2.96:1，未達非文字 3:1 | 淺色區保留原外框；深色區用 `#ffc38d`，對比 8.47:1。沒有刪除 outline |
| 整頁截圖把 fixed bar 拍在文件中段，容易誤解為永久覆蓋 | 驗收改拍實際 viewport 的頂部／底部；底部操作使用 bounding box 與實際點擊確認沒有被遮住 |
| 讀取失敗後舊 reset 不能重新取資料 | 以測試程序 SELECT 故障重現，改 retry；恢復讀取後真正顯示 20 筆列表 |

## 逐張最終審查

頂部／底部圖片中的局部內容在視窗邊界外會延續正常捲動，不是被移除或文字截斷。所有列底部及表單主要操作另以真實捲動與點擊驗證。

| 截圖 | 審查結果 |
| --- | --- |
| [375×812 首頁](screenshots/overview-375.png) | Header／四個入口清楚；較長待辦自然換行，主操作保持可見 |
| [390×844 首頁](screenshots/overview-390.png) | 品牌／帳號平衡，工作內容優先；固定列不改變主頁正常捲動 |
| [390 帳號](screenshots/account-390.png) | 原生 modal 清楚隔離背景；關閉鈕保留鍵盤外框，登出與文字對齊 |
| [390 購買列表](screenshots/purchases-390.png) | 購買／正式訂單分開，篩選條件可辨認；長商品與金額沒有互相擠壓 |
| [320 More 頂部](screenshots/more-320.png) | 極小螢幕縮短品牌副標，中文分類／圖示／箭頭完整，描述沒有水平溢出 |
| [320 More 底部](screenshots/more-bottom-320.png) | 設定、通知及系統入口可捲到；帳號和登出完整位於底欄上方 |
| [390 More 頂部](screenshots/more-390.png) | 同一套功能列與圖示，沒有重複總覽／商品入口或第二個抽屜 |
| [390 More 底部](screenshots/more-bottom-390.png) | 次要功能、長帳號及登出間距一致，底部有可操作空間 |
| [320 詳情頂部](screenshots/detail-320.png) | 返回與六個段落入口在窄螢幕合理換列；日期必要時換行可讀 |
| [320 付款段落](screenshots/detail-payment-320.png) | 錨點與 Header 保持間距；確認金額、說明及展開操作完整 |
| [390 詳情頂部](screenshots/detail-390.png) | 摘要雙欄與金額清楚；主要與次要文字層級一致 |
| [390 付款段落](screenshots/detail-payment-390.png) | 長內容正常文件捲動，付款與配送段落未被固定 Header 擋住 |
| [768×1024 More](screenshots/more-768.png) | 兩欄十個入口與帳號完整；保留內容寬度，無 Rail／抽屜；短內容後空白為自然剩餘高度 |
| [910×868 More](screenshots/more-910.png) | 十個入口與帳號可在正常畫布內閱讀；底欄集中，點擊目標不橫跨整個螢幕 |
| [910 首頁](screenshots/overview-910.png) | 862px 可用內容，左右 24px；Header／底欄符合平板策略 |
| [1024×768 Sidebar](screenshots/overview-1024.png) | 斷點切為 232px 側欄；頁首與內容 40px 對齊，長側欄可獨立捲動 |
| [1440×900 Sidebar](screenshots/overview-1440.png) | 五分類字級、18px 圖示與 44px 列一致；選中區不過寬，內容與 Header 對齊 |
| [320＋200% 長帳號](screenshots/enlarged-account-320.png) | 帳號換行但不裁字，dialog 不水平溢出；標題、關閉與登出仍完整 |
| [390 導覽等待](screenshots/navigation-pending-390.png) | 等待真實 RSC 回應時保留 Shell／目前內容，連結 status 可供輔助技術讀取；恢復後正確選中訂單 |
| [390 讀取錯誤](screenshots/read-error-390.png) | 錯誤與空資料分開，提供重試／返回；Header／底欄可用；移除故障後重試恢復 |

額外操作：844×390 橫向、1024×500 短桌面、跨 1024 斷點開關帳號；Tab／Shift+Tab／Escape、返回焦點；原生觸控 tap、滑鼠、keyboard；query／hash／返回與重整；庫存及新增／編輯頁的父層選中狀態。

## 對比檢查

依 sRGB 相對亮度公式計算，數值沒有向上捨入作為通過依據。

| 顏色組合 | 對比 |
| --- | --- |
| 正文 `#40372f`／`#fffdf9` | 11.45:1 |
| 次要文字 `#746b62`／`#fffdf9` | 5.14:1 |
| 選中文字 `#9d4319`／`#fff0df` | 5.78:1 |
| 側欄文字 `#e8e1d9`／`#342f2b` | 10.21:1 |
| 側欄分類 `#c4b8ac`／`#342f2b` | 6.80:1 |
| 淺色區焦點 `#bd5b29`／`#fffdf9` | 4.41:1（非文字） |
| 深色區焦點 `#ffc38d`／`#342f2b` | 8.47:1（非文字） |

依 Vercel Web Interface Guidelines 審查本次修改的 Header、Nav、More、loading、error：原生 button／link、完整名稱、裝飾圖示隱藏、heading 層級、skip link、focus-visible、長文字、URL 選中、motion、pending／disabled 及 safe-area 規則均已覆核。這是修改範圍審查，不宣稱全站所有舊表單通過完整 WCAG 稽核。
