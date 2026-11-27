# Implementation Plan: 小組即時狀態與回寫

**Branch**: `codex/007` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-live-team-activity/spec.md`

## Summary

延伸既有小組活動與 Guided Notes 匯出流程：沿用現有 WebSocket、SQLite、Google Sheets gateway 與分層 feature 結構，新增依教師／小組成員權限隔離的即時名冊與答案更新；將學生端人數定義為實際在線成員數，離線成員的席位仍保留兩分鐘；調整回寫格式及全目標格空白檢查，並把預覽期限改為五分鐘且到期可重產。前端使用 TypeScript、React、Vite、Tailwind CSS；測試使用 Vitest。

## Technical Context

**Language/Version**: TypeScript 5.9；Node.js `>=22.12`；前端 React 19、Vite 6、Tailwind CSS 4。

**Primary Dependencies**: 前端 React、Vite、Tailwind CSS；後端 Express 5、`ws`、`better-sqlite3`、`googleapis`；共享契約位於 `@quiz-buzzer/shared`。測試使用 Vitest 5.1。

**Storage**: SQLite 保存活動、小組、成員工作階段、作答與回寫嘗試；Google Sheets 為 Guided Notes 原始講義與回寫目標。

**Testing**: Vitest；既有 unit、integration 與 acceptance 分層測試。新增單元測試覆蓋空白判定與事件契約；整合測試覆蓋 WebSocket 權限、斷線期限及 Google Sheets gateway；React acceptance 測試覆蓋即時畫面與逾期重產。

**Target Platform**: 現代桌面及行動瀏覽器；Node.js 22 伺服器。

**Project Type**: TypeScript monorepo web application，含 `client`、`server` 及 `shared` workspaces。

**Performance Goals**: 自狀態變更成功提交起，所有有權查看且已連線的用戶端畫面須於 2 秒內套用最新狀態；驗收終點是畫面呈現，不是伺服器事件送達。此目標涵蓋 100 組、200 個有效工作階段。

**Constraints**: 小組最多 2 個席位；斷線成員在線計數立即減少但席位保留 2 分鐘；組長逾時關閉小組新加入。學生事件只含本組資訊；教師事件可含活動內全組名冊與答案。Teacher events use `activityLiveRevision` and team events use `groupLiveRevision`, both separate from the student-visible phase revision. 回寫預覽有效 5 分鐘；任何一個非空白或含公式目標格都必須使整批回寫停止。答案格式固定為「小組：{displayName}。回答：{答案}。」；`displayName` 是可呈現小組名稱或代號的小組顯示名稱。

**Scale/Scope**: 每場最多 100 組、200 個有效工作階段；本功能擴充既有活動頁、小組名冊、作答狀態與 Google Sheets 匯出預覽，不新增獨立應用程式或外部服務。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Plan assessment |
|---|---|
| I. Validated Inputs and Clear Errors | Pass. Event payloads, expiry, and Sheets cells are validated at their service boundaries; stale preview and occupied-cell errors remain actionable. |
| II. Secret Handling | Pass. Reuses existing environment-supplied Sheets credentials; no secrets or new credentials are introduced. |
| III. Evidence-Based Testing | Pass. Plan includes unit, integration, and acceptance coverage for normal and boundary paths, including the 200-session acceptance target. |
| IV. Attributed Dependencies and Materials | Pass. Reuses existing dependencies; no new external materials or packages are planned. |
| V. Verifiable Behavior | Pass. Server state, authorized events, sheet writes, and UI outcomes have repeatable checks; no mock-only behavior. |
| VI. Clear Structure and Consistent Data | Pass. Work remains within existing feature boundaries and shared contracts; state changes publish only after persistence succeeds. |
| VII. Subfeature-Based Delivery | Pass. Scope has its own feature directory and current Git branch `codex/007`. |
| VIII. Design-First with PlantUML | Pass. Phase 1 follows [component](../../diagrams/007-live-team-activity-component.puml), [class](../../diagrams/007-live-team-activity-class.puml), and [sequence](../../diagrams/007-live-team-activity-sequence.puml) diagrams as design blueprints. |

No constitution violations or exceptions are required.

**Post-design gate**: Rechecked after Phase 1. All gates remain passing; the design reuses the approved stack and credentials, preserves server-side access checks and transaction boundaries, includes repeatable normal/boundary/capacity checks, and aligns with the refreshed PlantUML diagrams.

## Project Structure

### Documentation (this feature)

```text
specs/007-live-team-activity/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── live-team-events.md
│   └── guided-notes-writeback.md
└── tasks.md                 # created by $speckit-tasks
```

### Source Code (repository root)

```text
client/src/features/
├── user-stage-sync/
│   ├── components/           # teacher roster/activity labels; student group status
│   ├── services/             # WebSocket event parsing and recovery
│   └── views/                # teacher activity and student group screens
└── guided-notes/
    ├── components/           # preview, expiry and occupied-target presentation
    ├── services/             # preview regeneration and writeback requests
    └── views/

server/src/features/
├── user-stage-sync/
│   ├── application/          # presence expiry, group state, answer publication
│   ├── realtime/             # authorized activity/team subscriptions
│   └── persistence/
│       └── migrations/       # audience-scoped live revision fields
└── guided-notes/
    ├── application/          # preview, target validation and confirmation
    ├── google-sheets/        # entered-value/formula metadata and batch writes
    └── persistence/          # export attempt lifecycle

shared/src/
├── user-stage-sync/          # event and snapshot contracts
└── guided-notes/             # preview and writeback contracts

tests/
├── unit/
├── integration/
└── acceptance/
```

**Structure Decision**: Extend the existing client/server/shared monorepo and its `user-stage-sync` and `guided-notes` feature modules. Add a SQLite migration for audience-scoped live revisions; keep business rules in server application services, event/request shapes in shared contracts, and presentation state in the existing React views. Put new tests next to the current feature-specific unit, integration, and acceptance suites.

## Complexity Tracking

No constitution violations; no additional project or abstraction layer is introduced.
