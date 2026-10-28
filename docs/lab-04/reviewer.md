# Lab 4 - Peer Review Record

**Author:** Tanadet Nuchaikaew - 67070501081 - GitHub: @Kawi-HBLI

**Peer reviewer:** Songwit Rueangsawat - 67070501060 - GitHub: @R1NNE0

**Partner I reviewed:** Thanawat Suntarawattana - 67070501022 - GitHub: @Maibokdaimhai

Dates below are UTC. This record tracks review activities across the 4 planned GitHub Issues and 5 PRs for Lab 4.

---

## 1. Review Protocol & Working Agreements

1. **Sequential Progression:** Work follows the Kanban flow (`Backlog` $\rightarrow$ `Specified` $\rightarrow$ `Started` $\rightarrow$ `PR Review` $\rightarrow$ `Fixing` $\rightarrow$ `Done`).
2. **Feature Branching:** All work packages use isolated feature branches (`feature/<name>`) targeting `lab4-staging`.
3. **No Self-Merging:** The PR author MUST NOT merge their own PR. Only the peer reviewer merges after formal `Approve` status.
4. **Active Conversations:** If changes are requested during peer review, the author addresses feedback on the same branch, moves card to `Fixing`, pushes fixes, and re-requests review.
5. **Release PR:** Once all feature PRs are merged into `lab4-staging`, a final release PR is opened into `main`.

---

## 2. Pull Requests I Authored (Reviewed by @R1NNE0)

| Work Package / Issue | Target Branch | Planned PR Link | Reviewer | Verdict & Status |
| :--- | :--- | :--- | :--- | :--- |
| **Issue 1:** Engineering contract and test plan ([#48](https://github.com/Kawi-HBLI/TokTickIT/issues/48)) | `feature/lab4-engineering-contract` $\rightarrow$ `lab4-staging` | [PR #52](https://github.com/Kawi-HBLI/TokTickIT/pull/52) | @R1NNE0 | Approved and Merged (`70d865d`) |
| **Issue 2:** Actions Taken and Ticket workflow ([#49](https://github.com/Kawi-HBLI/TokTickIT/issues/49)) | `feature/lab4-actions-workflow` $\rightarrow$ `lab4-staging` | In Progress | @R1NNE0 | Started |
| **Issue 3:** Role dashboards ([#50](https://github.com/Kawi-HBLI/TokTickIT/issues/50)) | `feature/lab4-dashboards` $\rightarrow$ `lab4-staging` | Planned | @R1NNE0 | Backlog |
| **Issue 4:** Final regression, hardening, and delivery evidence ([#51](https://github.com/Kawi-HBLI/TokTickIT/issues/51)) | `feature/lab4-final-verification` $\rightarrow$ `lab4-staging` | Planned | @R1NNE0 | Backlog |
| **Release PR:** Integrate Lab 4 into main | `lab4-staging` $\rightarrow$ `main` | Planned | @R1NNE0 | Planned |

### Detailed Review Log for Authored Work

#### Issue 1 / PR 1: Engineering Contract and Test Plan
- **Issue:** [#48](https://github.com/Kawi-HBLI/TokTickIT/issues/48)
- **Branch:** `feature/lab4-engineering-contract`
- **Scope:** Authored `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, and `ai-use.md`.
- **Review Events:**
  - *Independent Pre-PR Review (Round 1):* Identified baseline discrepancies including integer vs UUID primary keys, divergence from `server/src/ticket-workflow.ts`, RFC 7807 error envelopes instead of TokTickIT conventions, unsafe cascading delete potential, and missing idempotency retries.
    - *Author Action (Round 1):* Realigned all contracts to integer keys, enforced `Ticket.currentStatus`, preserved `{ data: { ... } }` and `{ error: { code, message, fields?, retryable? } }`, and added baseline transition matrices.
  - *Independent Pre-PR Review (Round 2):* Focused review identified 5 specific contract gaps:
    1. Durable idempotency: Required canonical payload normalization, `creationFingerprint` persistence, evaluating idempotency key before mutable gates (allowing replay on terminal tickets or inactive assignees), and client key lifecycle.
    2. Dashboard drill-downs: Addressed mismatches where default queue/ticket queries include terminal tickets; required compact mapping table with exact predicates, query parameters (`statusGroup=active`, `owner=unassigned&statusGroup=active`, `actionAssignee=me`, `statusGroup=resolved_closed`), and explicit Action vs Ticket entity distinctions.
    3. API details: Standardized on `CSRF_INVALID` (matching `server/src/auth.ts`), restored `previousStatus` in ticket status update response, and unified `ACTION_TERMINAL_IMMUTABLE`.
    4. History immutability & recovery: Replaced passive delete restrictions with active PostgreSQL database trigger `trg_action_history_append_only` rejecting direct UPDATE/DELETE; added concrete backup/restore rehearsal procedure (`TEST-RECOV-01`).
    5. Test plan & scheduling: Rescheduled `playwright.lab4.config.ts` creation to Issue #49; corrected AC-03 mapping to completion tests; expanded concrete planned tests for idempotency, triggers, and recovery.
    - *Author Action (Round 2):* Incorporated all 5 refinements across all 6 documents.
  - *Independent Pre-PR Review (Round 3):* Focused technical critique identified 4 remaining contract edge cases:
    1. Pending Actions drill-down: Added `statusGroup=active` to `/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active`, ensuring tickets in terminal states (specifically `CANCELLED` tickets retaining frozen pending actions) are excluded from both metric counts and drill-down results. Labeled destination links "View tickets containing these actions" to reinforce entity distinction (Action count vs Ticket rows).
    2. Decoupled completion attribution: Replaced assumption of assignee-based attribution with explicit `completedById: Int?` on `ActionTaken` and authenticated `actorId` in `ActionTakenHistory`. Permitted any active staff member or administrator to complete unassigned or cross-assigned actions. Aligned "Completed Today", activity feed, and drill-down filters (`/staff/tickets?completedBy=me&completedDate=today`) to `completedById`.
    3. Envelope consistency: Preserved TokTickIT's existing top-level queue envelope (`data`, `pagination`, `query`), rejecting any `meta.query` nesting to maintain strict backward compatibility with existing client and server code.
    4. Disposable database recovery rehearsal: Updated recovery rehearsal contract to restore PostgreSQL custom dumps into an isolated disposable test database (`toktickit_recovery_test`) rather than restoring back into the source database with renamed schemas.
    - *Author Action (Round 3):* Updated `specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, and `ai-use.md`.
  - *Pre-Submission Verification:* Re-checked transition matrix against `server/src/ticket-workflow.ts` (ensuring all diagonal same-status rejections including `CLOSED -> CLOSED` return 409 `INVALID_STATUS_TRANSITION`), refined recovery sequence verification to preserve source sequence state (`last_value`/`is_called`) and verify collision-free subsequent allocations without forcing `max(id)`, verified all 23 ACs trace to concrete test IDs, and confirmed all implementation tests remain marked `Planned`. PR #52 submitted targeting `lab4-staging`.
  - *Peer Review by @R1NNE0:* Formally approved PR #52 with three non-blocking suggestions:
    1. Clarify inverse Prisma relations for `User` and `Ticket` in schema.
    2. Add UI validation test coverage for empty cancellation reason.
    3. Extend terminal Ticket test coverage to include Cancelled tickets and action edits.
  - *Merge & Handoff:* Peer merged PR #52 into `lab4-staging` (`70d865d347d20f064a6a53bd984dc2817397a831`). Issue #48 closed. All three review suggestions acknowledged: inverse Prisma relations and terminal-state test extensions are incorporated into Issue #49 backend implementation; UI validation test for empty cancellation reason is deferred to Issue #49 frontend phase.

#### Issue 2: Actions Taken and Ticket Workflow
- **Issue:** [#49](https://github.com/Kawi-HBLI/TokTickIT/issues/49)
- **Branch:** `feature/lab4-actions-workflow`
- **Scope:** Database models (`ActionTaken`, `ActionTakenHistory`), append-only trigger, additive migration, seed data, Actions Taken CRUD/history API, durable idempotency replay, resolution gate enforcement on ticket status updates, and backend test suite.

---

## 3. Pull Requests I Reviewed for My Partner (@Maibokdaimhai)

| PR / Issue | Partner's Branch | Author | Verdict & Summary |
| :--- | :--- | :--- | :--- |
| Lab 4 Issue 1 | `feature/lab4-engineering-contract` | @Maibokdaimhai | Planned |
| Lab 4 Issue 2 | `feature/lab4-actions-workflow` | @Maibokdaimhai | Planned |
| Lab 4 Issue 3 | `feature/lab4-dashboards` | @Maibokdaimhai | Planned |
| Lab 4 Issue 4 | `feature/lab4-final-verification` | @Maibokdaimhai | Planned |
