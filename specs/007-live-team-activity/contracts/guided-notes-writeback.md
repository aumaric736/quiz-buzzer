# Guided Notes Writeback Contract

This contract extends the existing teacher-only preview and confirmation flow and the `SheetsGateway` boundary.

## Create or regenerate preview

- Request: existing activity and authenticated teacher session context.
- Response: a new preview identifier, activity identifier, items with group name and answer parts, target labels/current occupancy status, and an `expiresAt` five minutes after creation. The preview reads mapped target coordinates even if target cells are already occupied and presents the occupied labels for correction.
- Regeneration is the same preview-creation operation. It reads the current sheet and current winning-answer snapshot and returns a new ID and deadline.
- No-winner items remain marked as skipped/unchanged and do not produce writes.

## Confirm preview

- Request: preview identifier from the current teacher's activity.
- The server rejects an expired preview with a recoverable `PREVIEW_EXPIRED` response that the client maps to a visible “regenerate preview” action, not a terminal error.
- Before the first write, the server resolves target coordinates from stored import mappings and verifies the sheet structure separately from cell content. It re-reads the sheet and validates all target cells as one set. A cell is blank only if it has no formula and its entered value is empty after trimming leading/trailing whitespace. Full-width spaces, tab characters, and line breaks are whitespace. A formula is occupied even if its computed value is empty.
- If any target is occupied, no cell is written. The error response identifies every affected question/target label and asks the teacher to clear them, then regenerate or reconfirm.
- Confirm also verifies the sheet structure and answer snapshot against the preview. Changes require a new preview.
- Every writable cell receives `小組：{winningGroupName}。回答：{answerPart}。` using the answer part's original content. A valid answer such as `0` is not treated as blank.
- No-winner cells are skipped and left untouched.
- Write all updates using the existing batch gateway; preserve the existing verification and retry reconciliation behavior for provider failures.

## Error cases

| Condition | Result |
|---|---|
| Preview expired | Reject confirmation, return recoverable expiry state, allow new preview creation. |
| Formula or trimmed non-empty target | Reject the whole batch; return all affected target labels; perform zero writes. |
| Answer snapshot or layout changed | Reject stale preview; require regeneration. |
| Provider unavailable before write | Keep existing safe failure/retry behavior; do not claim completion. |
| Write outcome uncertain | Keep existing `unknown` reconciliation flow; do not blindly duplicate or overwrite. |
