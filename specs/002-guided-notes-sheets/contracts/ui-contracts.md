# UI Contracts: Guided Notes 匯入與匯出

These user-visible behaviors derive from the component and sequence diagrams. The screen is a local teacher flow; student views never receive Google credentials or spreadsheet cell data.

## Import and Worksheet Selection

- A teacher enters or pastes a Google Sheets URL, then selects a worksheet discovered from the workbook metadata.
- Explain that the source file must be shared with the configured service-account email; show the email without displaying private credentials.
- Show an explicit loading state while the server inspects the workbook.
- On import, display the recognized question numbers and blank count per question. Question descriptions are not imported.
- The first successful import creates the activity's numbered question list. If a list already exists, a question-count mismatch is rejected without partial changes.
- Unknown or ambiguous structure, missing questions/blanks, and inaccessible or unshared files show plain-language corrective guidance. Never guess a blank location or display raw Google error details.

## Export Preview and Confirmation

- Export is offered only after the activity ends.
- Show a per-question preview with winning group, ordered answer parts, blank count, and human-readable target labels. Display no-winner questions as unchanged.
- If answer part count does not match the number of detected blanks, mark that question as skipped and explain how to correct it. Do not shift later answers into its blanks.
- Require an explicit teacher confirmation before any write request. Cancel leaves the original worksheet unchanged.
- Before confirmation takes effect, the server rereads the source sheet. If structure changed, show a new preview and require confirmation; if a target is no longer blank, do not overwrite it.
- Tell the teacher not to edit the worksheet from another window during export. The service revalidates immediately before writing and verifies after writing, but Google's API cannot prevent every simultaneous collaborator edit.
- Show written, unchanged, skipped, failed, and uncertain outcomes separately. When a network response is uncertain, instruct the teacher to review the source before retry; do not claim the export succeeded.

## Permissions and Errors

- The service-account email is the only Google identity used by this feature. Teacher-selected local role/session is checked for activity ownership but is not represented as a Google account.
- Missing spreadsheet sharing or read/write permission messages explain that the teacher must share the source file with the configured account and grant the needed access.
- Errors never reveal a credential, private key, raw API response, worksheet cell contents, or internal stack trace.
- No live synchronization or collaborative editing of the Google Sheet is offered.
