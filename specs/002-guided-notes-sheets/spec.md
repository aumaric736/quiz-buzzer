# Feature Specification: Guided Notes 匯入與匯出

**Feature Branch**: `002-guided-notes-sheets`  
**Created**: 2026-11-18  
**Status**: Draft  
**Input**: User description: "建立「課堂搶答系統」的子功能：Guided Notes 匯入與匯出。老師可以匯入以 Google Sheets 形式儲存的 Guided Notes，系統只需以題號表示題目，不要求匯入題目敘述，但題數必須與 Guided Notes 一致。搶答結束後，老師可以把搶答成功組別的答案寫回原 Guided Notes 的填空格中。重要限制：不可使用靜態方式匯入／匯出（例如固定把第一題答案寫到 C19 儲存格），必須動態辨識題目與填空格位置，因為驗收時會使用另一份 Guided Notes 測試。邊界情況：題數不一致、找不到填空格、沒有人答對的題目、Sheets 無法存取或權限不足、同一題有多個填空格。非目標：不做即時同步編輯。"

## Clarifications

### Session 2026-11-18

- Q: How should the system recognize question numbers and blank positions across different Guided Notes? → A: The user will provide several sample documents to define supported layouts; recognition remains dynamic and unknown or ambiguous layouts must fail safely.
- Q: How should one answer map to multiple blanks for a question? → A: The answer feature supplies ordered answer parts, which map in order to the detected blanks.
- Q: Where do successful groups and answers come from? → A: A separate answer subfeature supplies the per-question winning group and answer parts; this feature does not implement answer collection or winner determination.
- Q: What determines the activity's question list and count? → A: Importing Guided Notes creates the activity's numbered question list; if question data already exists, its count must match the document before import can complete.
- Q: How does the system get permission to access a teacher's Google Sheets? → A: Use a service account configured through environment variables; the teacher shares the Guided Notes with that account.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 老師匯入 Guided Notes (Priority: P1)

老師選擇一份 Google Sheets Guided Notes，讓系統讀取其題號與填空位置，並把題號清單載入目前活動。系統不需要複製或匯入題目敘述，但載入的題數必須與文件中的題數一致。

**Why this priority**: 後續搶答答案必須依照文件實際題數與位置處理；若匯入辨識錯誤，答案可能對應錯題或覆蓋錯誤內容。

**Independent Test**: 使用一份含多題的 Guided Notes 匯入，確認題號及題數正確；再以題數不一致、缺少填空格、無法存取或權限不足的文件驗證拒絕與錯誤提示。

**Acceptance Scenarios**:

1. **Given** 老師提供可讀取的 Guided Notes，**When** 匯入成功，**Then** 系統依文件辨識出的題號建立活動題目清單並顯示題數，不要求顯示題目敘述。
2. **Given** 活動已有題目資料且文件題數與活動題數不一致，**When** 老師匯入，**Then** 系統拒絕完成匯入、說明題數差異，且不建立部分題目或文件對應。
3. **Given** 文件沒有可辨識的填空格或題目結構不明確，**When** 老師匯入，**Then** 系統不猜測儲存格位置、不改動文件，並說明需修正的項目。
4. **Given** Google Sheets 無法存取或老師尚未分享文件給設定的服務帳戶，**When** 老師匯入，**Then** 系統顯示可理解的存取錯誤與分享權限提示，且不洩漏憑證。

---

### User Story 2 - 老師將成功組別答案寫回原文件 (Priority: P1)

搶答結束後，老師檢視題號與各題成功組別的答案，確認後將答案寫回原 Guided Notes 中對應的填空格。

**Why this priority**: 將課堂搶答結果整理回原講義，是這項功能的主要成果。

**Independent Test**: 匯入一份 Guided Notes，建立每題成功組別與答案的資料，結束活動後執行匯出，再確認答案只寫入辨識出的原文件填空位置，其他儲存格內容不變。

**Acceptance Scenarios**:

1. **Given** 活動已結束且匯入文件仍可寫入，**When** 老師確認匯出，**Then** 每題成功組別的答案寫回原 Guided Notes 中對應題號的填空格。
2. **Given** 某題沒有成功組別，**When** 老師匯出，**Then** 該題填空格保持原狀，其他有答案題目仍可按確認結果寫回。
3. **Given** 同一題辨識到多個填空格，**When** 系統準備匯出，**Then** 將成功答案提供的有序答案片段依填空格辨識順序逐一填入；片段數量不一致時停止該題寫入並說明原因。
4. **Given** 原文件已無寫入權限或不可存取，**When** 老師匯出，**Then** 系統不回報成功，說明存取問題並保留可重試狀態。

---

### User Story 3 - 老師檢查並確認題目對應 (Priority: P1)

老師在寫回前可檢查系統辨識出的題號、題數及填空對應，避免文件格式差異造成誤寫。

**Why this priority**: 驗收會使用不同 Guided Notes，辨識必須依文件內容動態進行，且在實際寫入前讓老師確認對應。

**Independent Test**: 使用題目位置及填空位置不同的兩份文件，確認系統依各文件辨識對應，而非依固定儲存格座標；老師取消確認時原文件維持不變。

**Acceptance Scenarios**:

1. **Given** 系統已辨識一份文件，**When** 老師檢查匯出預覽，**Then** 預覽逐題顯示題號、成功組別、答案及將寫入的填空位置。
2. **Given** 老師尚未確認預覽，**When** 老師取消或離開，**Then** 原文件不被修改。
3. **Given** 不同文件將相同題號放在不同位置，**When** 系統辨識與匯出，**Then** 寫入位置依目前文件的動態辨識結果決定，不得依固定題號／儲存格座標對照表。

### Edge Cases

- 匯入題數與活動題數不一致時，拒絕匯入並指出差異，不留下部分對應。
- 找不到題號或填空格、或辨識結果不唯一時，不猜測、不寫入，並提供修正提示。
- 沒有組別答對的題目保持原填空格內容，不填入虛構值或其他題答案。
- Sheets 無法存取、授權不足、唯讀或寫入失敗時，不宣稱成功；錯誤訊息不含憑證。
- 一題對應多個填空格時，依辨識順序將有序答案片段對應各空格；片段數量不相符時停止該題寫入。
- 寫入期間部分更新失敗時，顯示成功及失敗題目清單，避免重試造成重複或錯位寫入。
- 匯出前原文件結構已變更時，重新辨識並要求確認，不沿用過期位置。
- 老師明確選擇要匯入的工作表；文件辨識規則以老師提供的數份範例 Guided Notes 為基礎，且不得記錄為固定儲存格座標映射。
- 對範例未涵蓋、結構不明確或辨識信心不足的文件，系統停止匯入／寫入並要求修正或補充範例，不猜測位置。
- 若一題的有序答案片段數量與辨識出的填空格數量不同，該題不寫入並列入匯出結果供老師處理。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系統 MUST 允許老師為活動提供一份已分享給設定服務帳戶的 Google Sheets Guided Notes，並保留原文件識別資訊供後續寫回。
- **FR-002**: 系統 MUST 動態辨識文件中的題號與題目數量，並以此建立活動的題目清單；只需載入題號，不要求匯入題目敘述。
- **FR-003**: 若活動已有題目資料，系統 MUST 確認辨識到的題數與既有活動題數一致；不一致時拒絕完成匯入並提供明確差異訊息，且不得留下部分題目或文件對應。
- **FR-004**: 系統 MUST 動態辨識每題填空格在來源文件中的位置；MUST NOT 以固定儲存格座標、固定題號座標表或單一測試文件格式作為答案位置依據。支援的版面辨識規則 MUST 以老師提供的數份範例文件為基礎，且應涵蓋不同題目／空格位置。
- **FR-005**: 系統 MUST 在辨識失敗、找不到填空格或對應不唯一時停止受影響的匯出，且不得猜測或覆寫不相關內容。
- **FR-006**: 活動結束後，系統 MUST 從獨立作答子功能依題號取得搶答成功組別及其有序答案片段；本功能不收集答案或判定成功組別，並在寫回前提供老師逐題檢查與確認的機會。
- **FR-007**: 老師確認後，系統 MUST 將有成功答案的題目寫回原 Guided Notes 對應填空格；一題多空格時 MUST 按偵測順序將有序答案片段逐一寫入。沒有成功組別的題目 MUST 維持原狀；片段數與空格數不一致時 MUST 停止該題寫入並回報。
- **FR-008**: Sheets 無法存取、老師未將文件分享給服務帳戶、權限不足、唯讀或寫入失敗時，系統 MUST 回報明確、可採取行動的錯誤，且 MUST NOT 宣稱匯出成功。
- **FR-009**: 寫回前若來源文件的題目或填空結構已改變，系統 MUST 重新辨識並要求老師確認新的對應。
- **FR-010**: 系統 MUST 只更新對應填空格，不得修改其他文件內容；匯出取消時原文件 MUST 保持不變。
- **FR-011**: 系統 MUST 以安全設定保存及使用 Google Sheets 存取授權；機敏憑證 MUST 僅由環境變數提供，不得進入程式碼、文件、log 或前端畫面。
- **FR-012**: 本功能 MUST 不提供搶答期間對 Google Sheets 的即時同步編輯。
- **FR-013**: 所有文件識別、工作表選擇、題號、填空對應與匯出操作 MUST 驗證輸入及狀態，並提供清楚錯誤訊息。

### Key Entities *(include if feature involves data)*

- **Guided Notes 文件**: 原始 Google Sheets 文件及其識別、存取與寫入狀態。
- **工作表**: 文件內供本活動使用的題目與填空範圍。
- **活動題目**: 由首次成功匯入的 Guided Notes 建立，以題號表示；後續作答子功能使用同一題目清單。
- **題目對應**: 活動題號、辨識到的填空位置及文件版本／結構資訊。
- **成功作答**: 由獨立作答子功能提供的某題成功組別及依序對應空格的答案片段。
- **匯出預覽**: 老師確認前逐題呈現的答案、成功組別及目標填空位置。
- **匯出結果**: 寫回成功、未寫回及失敗的題目清單。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 老師可在 2 分鐘內匯入一份有效 Guided Notes，並確認系統辨識題數與文件一致。
- **SC-002**: 對老師提供的至少兩份題目及填空位置不同的範例文件，所有可辨識答案均寫入正確題目填空格，且不依賴固定座標。
- **SC-003**: 題數不一致、找不到填空格或無法確認答案對應的情況下，0 個答案被寫入錯誤位置。
- **SC-004**: 沒有成功組別的題目在匯出後維持原填空格內容；其他題目不受影響。
- **SC-005**: 每次匯出前老師都能檢查逐題對應並取消；取消後來源文件沒有任何變更。
- **SC-006**: Sheets 存取及授權失敗時，老師收到清楚錯誤訊息且機敏憑證不出現在使用者可見訊息或記錄中。

## Assumptions

- 使用者為已有本機模擬老師工作階段的老師；帳號註冊不屬於本子功能。
- Guided Notes 文件在匯入時可讀取，且完成匯出時老師仍有原文件寫入權限。
- 匯出僅在搶答活動結束後進行，由老師明確確認後寫回。
- 題目以題號識別，不需要複製題目敘述或其他講義內容到搶答系統。
- 未有成功組別的題目不寫入任何值，既有填空內容原樣保留。
- 成功組別及有序答案片段由獨立作答子功能提供；本功能不實作搶答答案提交、答案儲存或成功組別判定。
- Google Sheets 存取使用由環境變數設定的服務帳戶；老師需將來源文件分享給該帳戶，並授予讀取及匯出所需寫入權限。
- 匯出預覽與明確確認可避免未授權自動修改原始講義。
- 不提供即時同步編輯；匯入與匯出是明確的老師操作。
- 老師會在規劃／實作前提供數份 Guided Notes 範例，作為支援版面辨識規則及驗收測試的依據；老師在匯入時選擇工作表。
- 首次成功匯入建立活動題目清單；之後的重匯或作答資料已有題目時，必須比對題數並維持既有題目一致性。
- 答案來源提供每題的成功組別及有序答案片段；數量不吻合時不得部分錯位寫入該題。
