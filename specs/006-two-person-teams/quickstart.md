# Quickstart: 小組活動與逐題搶答

## Prerequisites

- Node.js `>=22.12` and npm.
- Copy `.env.example` to ignored `.env`; set `TEACHER_USERNAME` and `TEACHER_PASSWORD`. Configure Google Sheets credentials only when testing Guided Notes writeback. Never commit `.env` or credential files.
- Install dependencies with `npm.cmd ci`.

## Run locally

1. Start the API with `npm.cmd run dev --workspace=server`.
2. Start the UI with `npm.cmd run dev --workspace=client`.
3. Open the Vite URL, normally `http://127.0.0.1:5173/`. For student phones/tablets, set `HOST=0.0.0.0`, `VITE_HOST=0.0.0.0`, `CLIENT_ORIGIN=http://<teacher-LAN-address>:5173`, and `VITE_API_BASE_URL=http://<teacher-LAN-address>:3000` in `.env`, restart both processes, and open the teacher's LAN address. Use a trusted classroom network and local firewall rules.

## Validation scenarios

1. **Teacher setup**: log in with configured credentials, create an activity, import multiple Guided Notes questions, and verify the activity join code is shown. Confirm invalid credentials and second-owner attempts fail.
2. **Random group codes**: create multiple groups. Each invite code is a fixed-width six-character numeric string (including possible leading zeroes), codes are random and unique within the activity, and codes may repeat across different activities. Confirm no sequential group count is exposed. The 101st group fails; zero through 100 groups are allowed.
3. **Group sessions**: join a group from a second browser using its invite code. Confirm the teacher sees the invite code and active session count only. Two active membership sessions are allowed; a third is rejected. Several sockets using one session count as one seat and share the team's answer state. The app does not verify whether active sessions belong to distinct people.
4. **Full activity capacity (mandatory MVP gate)**: create 100 groups with two active membership sessions each. Confirm all 200 sessions can join and appear in the teacher roster, with two active sessions shown per group. Submit one valid answer per group; confirm the other session sees the shared answer and a resubmission does not create another accepted answer. Complete this scenario before declaring the MVP ready.
5. **Code retry behavior**: enter an invalid invite code repeatedly and verify there is no attempt counter or cooldown. Confirm wrong/unknown codes do not disclose other group existence.
6. **Session reconnect and leave**: disconnect the last socket for one student session. Reconnect with that same session within two minutes and confirm the same seat is restored. Let the deadline expire and confirm the seat is released; explicit leave releases immediately. Verify leader leave/expiry closes new joins while another active session can continue; member leave/expiry frees a seat when the leader remains.
7. **Independent questions**: draft answers for two questions, submit one, and confirm the other device-local draft is unchanged. Submit from different groups on different questions and confirm each question is independent.
8. **Receipt ordering and validity**: submit a valid request before an invalid request; confirm invalid submissions do not consume answer rank or a group's question slot. For two valid same-question requests, confirm the earliest complete server receipt wins. Test answer request versus teacher end in both receipt orders. Confirm original answer text is retained and knowledge correctness is not auto-scored.
9. **Visibility boundary**: while live, confirm a student sees only phase, questions, own group submission state, own answer, and acknowledgment. Confirm other-team status, answers, counts, lead, and global sequence are absent from responses/events. Confirm teacher can view full live records.
10. **Teacher reconnect**: disconnect the teacher's last socket and verify the separate two-minute activity grace; reconnect before expiry to continue, or let expiry end the activity. Verify explicit teacher leave ends immediately.
11. **Final results and writeback**: end the activity and confirm winner/no-winner results are read-only; correct and incorrect valid answers follow receipt order. Refresh the results using only the activity join code with no group session and verify this works even if the group's two seats are occupied. Confirm the same endpoint reveals no results while the activity is live. No-winner preview skips its cell. Simulate Sheets failure and retry without reopening the activity or changing results. The MVP includes persisted retry state/safe retry and teacher retry controls.

## Commands

- Unit, integration, and acceptance suite: `npm.cmd test` (Vitest)
- Workspace builds: `npm.cmd run build`

Run both commands before releasing changes. Tests cover normal, validation, concurrency, reconnect, privacy, lifecycle, and retry behavior.
