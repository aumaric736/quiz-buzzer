# Feature Specification: 全狀態返回角色選擇

**Feature Branch**: `codex/005`

**Created**: 2026-11-25

**Status**: Implemented

**Input**: User request to document the already implemented return-to-role control on the dedicated `codex/005` branch, including clearing the old teacher/student session context before selecting a role again.

## User Scenarios & Testing

### User Story 1 - 從任何流程返回角色選擇 (Priority: P1)

老師或學生在選定角色後，可以從活動建立、組別加入及活動各階段的畫面返回角色選擇，重新以相同或不同角色開始。

**Why this priority**: 使用者不必重啟應用程式即可切換角色；全域返回控制是此分支的核心功能。

**Independent Test**: 在老師和學生流程的活動建立前、建立／加入後及不同活動階段，確認共享畫面殼層都顯示返回控制；執行 reset 後確認角色選擇畫面出現，並可建立新的無活動、無組別 session。

**Acceptance Scenarios**:

1. **Given** 使用者已選擇老師或學生且處於任一後續流程，**When** 使用者按下「返回角色選擇」，**Then** 目前 session 先被服務端退役並清除活動／組別參照，成功後瀏覽器才清除舊 session id 並顯示角色選擇。
2. **Given** 使用者選擇返回時服務端無法完成 reset，**When** reset 回傳錯誤或服務無法連線，**Then** 保持目前角色流程及瀏覽器 session id，顯示錯誤並允許重試。
3. **Given** 瀏覽器保存的 session 已不存在，**When** 使用者選擇返回或恢復時服務端指出 session 不存在，**Then** 丟棄無效的本機 session id 並返回角色選擇。
4. **Given** reset 成功或舊 session 已不存在，**When** 使用者選擇老師或學生，**Then** 建立新的 active session，且不繼承舊角色、活動或組別上下文。

### User Story 2 - 保留活動資料並隔離其他參與者 (Priority: P1)

學生返回角色選擇時解除自己的組別關聯，但組別紀錄與名稱仍保留。老師返回時只退役自己的 session，不影響活動階段或仍在活動中的學生。

**Why this priority**: 角色切換不得刪除課堂資料，也不得中斷其他使用者正在進行的活動。

**Independent Test**: 學生加入組別後 reset，確認 session 參照清空、組別和活動資料仍在且相同組名仍被拒絕；老師在活動進行中 reset，確認 phase/revision 及其他學生 session 均不變。

**Acceptance Scenarios**:

1. **Given** 學生 session 已加入活動組別，**When** 該學生 reset-context，**Then** 該 session 的 `activityId`、`groupId` 清空並設置退役時間，活動、組別列和活動內名稱唯一性保留。
2. **Given** 老師建立的活動正由學生使用，**When** 老師 reset-context，**Then** 僅老師 session 被退役；活動階段、revision 與所有學生 session 維持原值，不結束活動或移交控制權。
3. **Given** 一個 session 已退役，**When** 再次 reset，**Then** 回傳成功且不再改變該 session 的退役與更新時間；恢復或執行活動操作則回傳 `404 SESSION_NOT_FOUND`。

### Edge Cases

- Reset 新建但尚未加入活動的 session 仍成功退役。
- 重複退出已存在的 retired session 為冪等操作；若 session 不存在，用戶端仍可清除過期識別值並返回角色選擇。
- 網路或服務端錯誤時不得先清除瀏覽器 session id 或顯示已返回角色選擇。
- 學生離開後，舊組名仍保留；使用者需以新組名重新加入活動。
- 教師離開仍有學生使用的活動時，不得改變活動階段或其他學生 session。
- 若使用者在角色選擇前尚無 session id，不需呼叫 reset 即可返回角色選擇。
- 不可用活動狀態及其復原（原 `user-stage-sync` 的 FR-014）不屬本功能，仍待後續子功能定義與實作。

## Requirements

### Functional Requirements

- **FR-001**: 每個老師或學生的後續流程都 MUST 提供可操作的「返回角色選擇」控制。
- **FR-002**: 返回控制 MUST 先完成目前 session 的退役；完成後才清除瀏覽器保存的舊 session id 並顯示角色選擇。
- **FR-003**: 退役 MUST 解除目前 session 與活動及組別的關聯，並標記該 session 已退役；不得刪除活動或組別資料。
- **FR-004**: Reset MUST 只影響指定 session。老師返回時 MUST 保持活動 phase/revision 及其他 session 不變；學生返回時 MUST 保留組別列與組名唯一性。
- **FR-005**: 已退役 session MUST 無法恢復或執行活動相關操作；再次退出已退役 session MUST 視為成功且不改變既有資料。
- **FR-006**: 若服務端已沒有目前 session，用戶端 MUST 丟棄過期的本機識別值並返回角色選擇。
- **FR-007**: Reset 失敗時用戶端 MUST 留在目前流程，保留舊 session id，顯示可讀訊息並允許重試。
- **FR-008**: 重新選擇角色 MUST 建立新的 active session，不得沿用舊角色、活動或組別上下文。
- **FR-009**: 此子功能 MUST 支援同一裝置的本機模擬，不新增帳號認證或外部設備服務。

### Key Entities

- **UserSession**: 本機模擬角色及目前活動／組別參照；退役後保留角色作歷史資料，活動與組別參照為空並記錄 `retiredAt`。
- **Activity**: 老師建立的活動及 phase/revision；角色返回不得改變其資料或建立者參照。
- **Group**: 活動中的組別紀錄；學生返回角色選擇不刪除組別，組名持續保留。

## Success Criteria

- **SC-001**: 老師與學生的八個代表流程狀態（活動前、準備中、搶答中、已結束；學生另含加入前／後）均由共用畫面殼層呈現返回控制。
- **SC-002**: 正常返回時，服務端 reset 成功先於瀏覽器 session id 清除；reset 失敗時，瀏覽器 id 和目前流程均保留。
- **SC-003**: 100% 的退役 session 恢復與活動操作被拒絕；同一活動的組別資料和名稱保留。
- **SC-004**: 老師返回時活動 phase/revision 與其他學生 session 不變；新選角色建立無舊上下文的 session。
- **SC-005**: 所有驗收情境均可由可重複執行的自動化測試驗證。

## Out of Scope

- 活動標記為不可用後的恢復訊息、API 防護及資料生命週期；這是後續功能，不屬 `codex/005`。
- 帳號註冊、身份驗證、教師控制權移交、活動結束或刪除。

## Assumptions

- 本機 session id 是用來恢復模擬狀態的非秘密識別值，不是認證憑證。
- 伺服端以 SQLite 保存 session、活動和組別狀態；應用程式僅監聽 loopback。
- 既有 `user-stage-sync` 應用程式提供老師／學生流程，本功能在其共用畫面殼層加入返回控制。
