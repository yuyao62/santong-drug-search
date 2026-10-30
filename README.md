# 三同 · 藥品查詢

可部署到 GitHub Pages 的繁體中文查詢系統。無後端、無 API 金鑰、無套件依賴。支援中英文／健保碼／成分／廠商搜尋、完整複方三同比對、日期給付篩選、支付價排序、CSV 匯出與 JSON / CSV 匯入。

## 目前資料狀態

**程式已完成，正式藥品資料尚未匯入；不是全臺藥品資料庫。** `data/drugs.json` 為空。`體驗示範` 使用虛構藥名、代碼、廠商及價格，不可用於調劑。未連接 GitHub 或發布網站前，沒有線上查詢網址。

## 在 GitHub 啟用

1. 建立儲存庫（例如 `santong-drug-search`），將本資料夾的內容放到 `main` 根目錄，含 `.github/workflows/pages.yml`。
2. 開啟 Settings → Pages → Build and deployment → Source，選 **GitHub Actions**。
3. 到 Actions 執行 `Test and deploy GitHub Pages`。成功後使用部署輸出的網址。
4. 若第一次部署因尚未設定 Pages 而失敗，完成第 2 步後重新執行。

上傳至公開儲存庫或 GitHub Pages 的藥品主檔可被他人讀取，不得放入病人、處方、帳號或其他非公開資料。

## 本機執行

需要 Node.js 24（測試、資料整理）及 Python 3（本機預覽）。

```sh
npm test
python3 -m http.server 8000
```

開啟 `http://localhost:8000`。請勿直接雙擊 HTML，瀏覽器可能阻擋資料載入。

## 正式資料準備

來源：中央健康保險署「健保用藥品項查詢項目檔」，政府資料開放授權條款第 1 版。

- 資料集與授權資訊：https://data.gov.tw/dataset/23715
- 官方查詢：https://info.nhi.gov.tw/INAE3000
- 查詢檔與格式說明：https://www.nhi.gov.tw/ch/lp-2466-1.html
- 處方替代條件：https://www.nhi.gov.tw/ch/cp-5798-d1af3-2844-1.html

官方公開摘要欄位不能直接保證完整複方含量、給藥基準及釋放型態，本版**不宣稱原始官方 CSV 可直接匯入**。請由藥師依官方明細與許可證資料整理核對，轉成以下格式；不可把「規格量」直接視為每個成分含量，亦不可從藥名猜測。

`data/template.csv` 是欄位範本；`data/demo.json` 提供虛構格式例子。CSV 請使用 UTF-8；Excel 請另存 CSV UTF-8。每個健保碼保留一筆，對應同一價格有效期間；若需歷史資料，請另行建立主檔版本。本版拒絕重複健保碼，避免混用不同期間價格。

| 欄位 | 內容 |
| --- | --- |
| code | 唯一健保碼（必填文字） |
| name | 中文品名（必填） |
| englishName | 英文品名（可空） |
| ingredients | 完整成分陣列，每項有 name 與 strength，複方須列全；CSV 中使用 JSON 陣列字串 |
| form | 詳細劑型，含緩釋／腸溶等（必填） |
| specification | 給藥基準與必要規格，如每錠、每瓶 10 mL；含量應保留濃度基準（必填） |
| manufacturer | 廠商（可空） |
| price | 該給付期間健保支付價，數字；未知 JSON 用 null、CSV 留空 |
| validFrom / validTo | 價格給付有效起迄日，YYYY-MM-DD（必填，非許可證有效日） |

正式 JSON 可為陣列或 `{ "source": "來源", "updatedAt": "YYYY-MM-DD", "drugs": [...] }`。網站匯入只存於記憶體，重新整理後清除；不會自動寫入儲存庫。

管理者可將核對後的資料永久加入網站：

```sh
npm run import -- reviewed.csv "健保署主檔，藥師核對" 2026-10-30
npm test
git add data/drugs.json
git commit -m "Update reviewed drug master"
git push
```

更新日請填真實資料更新日。每次更新核對新增、停付、成分、價格及劑型，提交後 GitHub Actions 會重新部署。**本版沒有自動抓取或自動更新官方藥品資料。**

## 比對規則與使用界線

完整成分集合、各成分含量、詳細劑型及給藥規格經全半形、英文大小寫、連續空白正規化後，全部一致才列為候選；成分順序不同可匹配。沒有鹽類推論、單位換算、同義劑型合併或等效劑量建議，因此可能漏掉需專業判讀的候選。相同 ATC、相同主成分、名稱含相同字詞均不足以判定三同。資料正確性取決於主檔完整性；程式無法識別主檔是否漏填了某個成分。

清單會排除原品項。給付日期篩選僅依匯入有效期間，並非即時確認健保給付、供貨或庫存。支付價依資料標示之給付單位，非零售售價。程式未自動執行處方不可替代、支付價不高於原品項、給付規定、許可證、途徑、適應症或臨床等效性審核。須由藥師核對後決定，不可直接據此換藥。

## 驗證

`npm test` 驗證完整複方、劑量／鹽類／劑型／規格區別、給付日邊界、無效主檔拒絕、搜尋與 CSV 往返、試算表公式注入防護。部署前亦會執行。網站以文字節點呈現匯入欄位，避免把品名當 HTML 執行。
