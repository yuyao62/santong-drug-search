# 三同 · 藥品查詢

可部署到 GitHub Pages 的繁體中文查詢系統。無後端、無 API 金鑰、無套件依賴。支援中英文／健保碼／成分／廠商搜尋、完整複方三同比對、日期給付篩選、支付價排序、CSV 匯出與 JSON / CSV 匯入。

## 正式資料庫

已載入使用者提供的健保署「115年11月查詢檔（另案上網）」TXT ZIP。225,028 筆原始歷次紀錄，45,224 個健保碼，2026-10-30 快照日有正支付價且期間涵蓋當日者為 13,838 個健保碼。這不是供貨或庫存數量。

網站自動載入 8 個 GZIP JSON 分檔（合計約 4 MB），不是示範資料。完整來源檔名與 SHA-256 保存在 data/drugs.json。快照日期不是官方發布日期；匯入資料未標示可確認的官方發布時間，因此 updatedAt 為 null。

每個健保碼顯示快照日適用的主檔欄位，另保留去重後的價格期間。不同查詢日依價格有效期間選價；零或空白金額不列入「有效正支付價」篩選。此篩選不等同即時健保給付認證。名稱與成分採快照版本，不能解讀為完整歷史藥品主檔；三同比對限快照日使用。

目前僅對欄位完整且未發現釋放型態疑慮的口服單方錠劑／膠囊列出候選，並額外要求官方分類分組相同。複方、非口服固體、疑似特殊釋放型態、缺欄或解碼異常者仍可搜尋，但不自動比對。分類分組不是臨床替代的充分條件。

網站頁尾提供 SQLite GZIP 下載。部署時由 JSON 分檔產生 SQLite（drugs、ingredients、price_periods、metadata 四表，另有 name_audit 查核紀錄表），有健保碼、名稱、價格日期索引。下載後解壓縮即可用 SQLite 工具開啟。不含病人或處方資料。GitHub Pages 前端讀取壓縮 JSON，無須後端；需要支援 DecompressionStream 的瀏覽器。

重新匯入官方 TXT：`python3 scripts/build_nhi.py RAW_DIRECTORY --as-of YYYY-MM-DD`。程式按 1,859 位元組 Big5 格式解析，遇到長度／日期／數值異常就停止，無法解碼字元保留替換符且停用該品項比對。SQLite 重建：`python3 scripts/build_sqlite.py`。更新資料後先執行 `npm test` 再提交全部資料分檔與清單。不會自動抓取官方資料。

## 中文名稱查核修正

2026-10-30 以食藥署「全部藥品許可證資料集」72,096 筆許可證紀錄交叉核對。中文名稱含問號或替換字元者共有 422 個健保碼，其中 415 個確認並修正，7 個未能可靠確認而保留原名、標示待核對。

原始健保署 JSON 分檔不覆寫。`data/name-corrections.json` 保存每個健保碼的原中文／英文名、修正中文名、許可證、來源英文名、來源異動日、查核方法，以及官方 ZIP 的 SHA-256。網站與 SQLite 均套用相同校正，SQLite 的 `name_audit` 表可回查原文。名稱修正不會變更成分、含量、價格或三同比對資格，也不代表許可證目前有效；來源註銷狀態保留在校正證據中。

查核條件：依健保碼取許可證流水號，並區分製／輸家族；英文品名經全半形、大小寫及標點正規化後須相同。只移除明確的「鋁箔/膠箔」包裝尾註，另對一組製造商括號與成分括號對調的 Benamine 英文名做明確對應。多個候選中文名、英文實質差異、官方名稱仍含私人造字或缺字，一律不自動修正。新版本主檔原名稱或英文名與校正依據不符時，網站拒絕套用舊校正。

來源：https://data.gov.tw/dataset/9122 ，官方 ZIP：https://data.fda.gov.tw/data/opendata/export/36/json 。重建：`python3 scripts/verify_names.py TFDA_JSON.zip`，再執行 `npm test` 與 `python3 scripts/build_sqlite.py`。

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

官方公開摘要欄位不能直接保證完整複方含量、給藥基準及釋放型態，原始官方 CSV 不能直接用一般匯入按鈕載入。官方 TXT 已由 build_nhi.py 專用程式轉換。請由藥師依官方明細與許可證資料整理核對，轉成以下格式；不可把「規格量」直接視為每個成分含量，亦不可從藥名猜測。

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
