# Lab 4 Test Plan: Actions Taken, Ticket Workflow, and Role Dashboards

## 1. Purpose and Test-Driven Commitment

This document defines the comprehensive test strategy, verification catalogue, and traceability matrix for Sprint 4 of TokTickIT. In accordance with Test-Driven Development (TDD) principles, all test cases, assertion boundaries, failure paths, concurrency conditions, and expected outcomes are specified and committed prior to feature implementation.

Every Acceptance Criterion (AC-01 through AC-23) defined in `specification.md` maps directly to planned automated tests across unit, integration, concurrency serialization, security authorization, visual accessibility, and end-to-end (E2E) suites.

> [!NOTE]
> As this document is authored during **Issue 1 (Engineering Contract & Test Plan)**, all test cases and candidate verification records are currently marked **Pending** / **Planned**. Actual test execution results, execution timestamps, and log summaries will be recorded upon implementation in subsequent issues.

---

## 2. Test Scope, Risk Assessment, and Environments

### 2.1 Scope of Automated Testing

1. **Actions Taken Lifecycle & Attribution:** Creation, validation, editing, assignment, completion with decoupled actor attribution (`completedById`), cancellation (with reason), and inactive assignee rejection.
2. **Durable Idempotency & Replay:** Normalization, fingerprint matching, simultaneous retries, replay after edits/completion, replay after ticket resolution, and conflicting payload rejection (`409 IDEMPOTENCY_CONFLICT`).
3. **Append-Only History & Trigger Enforcement:** PostgreSQL trigger `trg_action_history_append_only` preventing direct UPDATE/DELETE, atomic rollback on history failure, and chronological state reconstruction.
4. **Ticket Resolution Gate & Baseline Transitions:** Verification that `Ticket.currentStatus` cannot transition to `RESOLVED` unless owner is assigned, $\ge 1$ action is completed with result, and 0 actions are pending; full verification of permitted/prohibited transitions from `server/src/ticket-workflow.ts`.
5. **Parent-Ticket Concurrency Serialization:** Multi-client concurrent execution testing proving that race conditions between action creation and ticket resolution cannot produce an invalid invariant, accounting for both valid lock acquisition orders.
6. **Operational Role Dashboards & Drill-Downs:** Metric calculations, UTC date boundary enforcement, personal vs team scoping, private content exclusion, and drill-down URL query validation (`statusGroup=active`, `owner=unassigned&statusGroup=active`, `actionAssignee=me&actionStatus=PENDING&statusGroup=active`, `completedBy=me&completedDate=today`).
7. **Disaster Recovery Rehearsal:** Verification of full backup and restore into a separate disposable test database verifying row counts, relations, sequences, and trigger enforcement.
8. **Regression Protection:** Ensuring 100% pass rate across existing Lab 1, Lab 2, and Lab 3 suites.
9. **Accessibility & Responsive Checks:** Automated WCAG 2.2 AA audits (axe-core), focus management/trapping, and 400% zoom (320px equivalent) viewport containment across desktop, tablet, and mobile breakpoints.

### 2.2 Test Environments & Runners

| Suite Type | Runner / Tool | Target Environment | Database / Schema |
| :--- | :--- | :--- | :--- |
| **Server Unit & Integration** | Vitest | Node.js 20+ | PostgreSQL (`toktickit_test` or transaction rollback) |
| **Server Concurrency Race** | Vitest + raw PG client pool | Node.js 20+ | PostgreSQL (concurrent connections with row locks) |
| **Client Component Tests** | Vitest + React Testing Library | jsdom | Mocked API Handlers (MSW / fetch spies) |
| **End-to-End (E2E)** | Playwright | Chromium (Headless) | Isolated PostgreSQL schema (`e2e_test`) via `playwright.lab4.config.ts` |
| **Accessibility Audits** | `@axe-core/playwright` | Chromium | Isolated E2E web server |

### 2.3 Playwright Configuration Scheduling for Lab 4

The repository currently defaults `playwright.config.ts` to `e2e/lab-02` and has `playwright.lab3.config.ts` for `e2e/lab-03`.
- **Scheduling Commitment:** `playwright.lab4.config.ts` will be created in **Issue #49** (Actions Taken and Ticket Workflow), as the first Lab 4 E2E tests (`actions-taken-flow.spec.ts` and `ticket-resolution.spec.ts`) execute in that issue.
- **Config Path:** `playwright.lab4.config.ts`
- **Test Directory:** `./e2e/lab-04`
- **Database Isolation:** Connects via `E2E_DATABASE_URL` (`e2e_test` schema).
- **Execution Command:** `npx playwright test --config playwright.lab4.config.ts`

---

## 3. Test Catalogue by Target File

### 3.1 Server Integration: Actions Taken & Idempotency (`server/tests/lab-04/actions-taken.api.test.ts`)

| Test ID | Method & Path | Description / Precondition | Expected Status & Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-ACT-01` | `POST /api/tickets/:id/actions` | IT Staff creates action with valid description and assignee ID. | `201 Created`; action status `PENDING`, initial history `CREATED` logged atomically. | Passed |
| `TEST-ACT-02` | `POST /api/tickets/:id/actions` | IT Staff attempts to assign action to an inactive user. | `422 Unprocessable Entity`; code `INVALID_ACTION_ASSIGNEE`. | Passed |
| `TEST-ACT-03` | `POST /api/tickets/:id/actions` | IT Staff attempts to assign action to a user with role `REQUESTER`. | `422 Unprocessable Entity`; code `INVALID_ACTION_ASSIGNEE`. | Passed |
| `TEST-ACT-04` | `POST /api/tickets/:id/actions` | Requester attempts to create an action taken. | `403 Forbidden`. | Passed |
| `TEST-ACT-05` | `POST /api/tickets/:id/actions` | Follow-up required is `true` but `followUpNote` is omitted or empty. | `422 Unprocessable Entity`; code `FOLLOW_UP_NOTE_REQUIRED`. | Passed |
| `TEST-ACT-06` | `PATCH /api/actions/:id` | IT Staff updates description and follow-up note on a `PENDING` action. | `200 OK`; version incremented, `UPDATED` history logged. | Passed |
| `TEST-ACT-07` | `PATCH /api/actions/:id` | IT Staff attempts to edit an action with a stale version. | `409 Conflict`; code `ACTION_VERSION_CONFLICT`. | Passed |
| `TEST-ACT-08` | `PATCH /api/actions/:id/status` | IT Staff completes action providing a valid result string ($\ge 3$ chars). | `200 OK`; status `COMPLETED`, `completedAt` set, `completedById` recorded, `COMPLETED` history logged. | Passed |
| `TEST-ACT-09` | `PATCH /api/actions/:id/status` | IT Staff attempts to complete action with empty or whitespace result. | `422 Unprocessable Entity`; code `ACTION_RESULT_REQUIRED`. | Passed |
| `TEST-ACT-10` | `PATCH /api/actions/:id/status` | IT Staff cancels action providing a non-empty cancellation reason. | `200 OK`; status `CANCELLED`, `cancelledAt` set, `CANCELLED` history logged. | Passed |
| `TEST-ACT-11` | `PATCH /api/actions/:id/status` | IT Staff attempts to cancel action without cancellation reason. | `422 Unprocessable Entity`; code `CANCELLATION_REASON_REQUIRED`. | Passed |
| `TEST-ACT-12` | `PATCH /api/actions/:id` | IT Staff attempts to edit an already `COMPLETED` or `CANCELLED` action. | `422 Unprocessable Entity`; code `ACTION_TERMINAL_IMMUTABLE`. | Passed |
| `TEST-ACT-13` | `GET /api/tickets/:id/actions` | Requester retrieves actions on an owned ticket. | `200 OK`; returns all actions (`PENDING`, `COMPLETED`, `CANCELLED`) in read-only format. | Passed |
| `TEST-ACT-14` | `GET /api/tickets/:id/actions` | Requester attempts to retrieve actions on someone else's ticket or non-existent ticket. | `404 Not Found`; identical safe error code `TICKET_NOT_FOUND`. | Passed |
| `TEST-ACT-15` | `GET /api/actions/:id/history` | IT Staff retrieves audit history for an action. | `200 OK`; returns ordered history array (`createdAt ASC, id ASC`). | Passed |
| `TEST-ACT-16` | `GET /api/actions/:id/history` | Requester attempts to retrieve audit history for an action. | `403 Forbidden`. | Passed |
| `TEST-ACT-17` | `POST /api/tickets/:id/actions` | Retry submission with identical `idempotencyKey` and identical payload. | `200 OK`; returns existing action without creating duplicate action or history record. | Passed |
| `TEST-ACT-18` | `POST /api/tickets/:id/actions` | Retry submission with identical `idempotencyKey` but differing payload. | `409 Conflict`; code `IDEMPOTENCY_CONFLICT`. | Passed |
| `TEST-ACT-19` | `POST /api/tickets/:id/actions` | User with `mustChangePassword = true` attempts to create an action. | `403 Forbidden`; code `PASSWORD_CHANGE_REQUIRED`. | Passed |
| `TEST-ACT-20` | `POST /api/tickets/:id/actions` | State-changing request submitted with invalid CSRF token. | `403 Forbidden`; code `CSRF_INVALID`. | Passed |
| `TEST-ACT-21` | `POST /api/tickets/:id/actions` | Replay with identical key after the created Action has been edited or completed. | `200 OK`; fingerprint matches original creation request, safely returns stored creation response. | Passed |
| `TEST-ACT-22` | `POST /api/tickets/:id/actions` | Replay with identical key after the parent Ticket has transitioned to `RESOLVED` or `CLOSED`. | `200 OK`; key handled before mutable gates, returning stored creation response without terminal error. | Passed |
| `TEST-ACT-23` | `POST /api/tickets/:id/actions` | Replay with equivalent normalized payload (whitespace variations, omitted defaults). | `200 OK`; normalized fingerprint matches, safely replays without conflict. | Passed |
| `TEST-ACT-24` | `POST /api/tickets/:id/actions` | Concurrent simultaneous requests submitted with the identical idempotency key. | Row lock serializes execution: exactly one inserts the action; the second safely replays with `200 OK`. | Passed |
| `TEST-ACT-25` | `PATCH /api/actions/:id/status` | Staff User B completes an action assigned to Staff User A. | `200 OK`; `ActionTaken.completedById` is recorded as User B (`B.id`), while `assigneeId` remains User A (`A.id`). | Passed |
| `TEST-ACT-26` | `PATCH /api/actions/:id/status` | Staff User B completes an unassigned action (`assigneeId = null`). | `200 OK`; `ActionTaken.completedById` is recorded as User B (`B.id`), while `assigneeId` remains `null`. | Passed |

---

### 3.2 Server Integration: Ticket Workflow & Resolution Gate (`server/tests/lab-04/ticket-workflow.api.test.ts`)

| Test ID | Method & Path | Description / Precondition | Expected Status & Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-RES-01` | `PATCH /api/staff/tickets/:id/status` | Ticket has assigned owner, 1 completed action with result, 0 pending actions. Target $\rightarrow$ `RESOLVED`. | `200 OK`; returns `previousStatus`, updates `currentStatus` to `RESOLVED`, clears resolution indications. | Passed |
| `TEST-RES-02` | `PATCH /api/staff/tickets/:id/status` | Ticket has 1 completed action and 0 pending actions, but `ownerId` is null. Target $\rightarrow$ `RESOLVED`. | `422 Unprocessable Entity`; code `RESOLUTION_GATE_NO_OWNER`. | Passed |
| `TEST-RES-03` | `PATCH /api/staff/tickets/:id/status` | Ticket has assigned owner, but 0 completed actions. Target $\rightarrow$ `RESOLVED`. | `422 Unprocessable Entity`; code `RESOLUTION_GATE_NO_COMPLETED_ACTION`. | Passed |
| `TEST-RES-04` | `PATCH /api/staff/tickets/:id/status` | Ticket has assigned owner, 1 completed action, but 1 pending action remains. Target $\rightarrow$ `RESOLVED`. | `422 Unprocessable Entity`; code `RESOLUTION_GATE_PENDING_ACTIONS`. | Passed |
| `TEST-RES-05` | `POST /api/tickets/:id/actions` | Attempting to create an Action Taken on a `RESOLVED` or `CLOSED` ticket. | `422 Unprocessable Entity`; code `TICKET_TERMINAL_IMMUTABLE`. | Passed |
| `TEST-RES-06` | `PATCH /api/staff/tickets/:id/status` | Reopening a `RESOLVED` or `CLOSED` ticket to `REOPENED` succeeds; subsequent action creation succeeds. | `200 OK`; `currentStatus` becomes `REOPENED`. | Passed |
| `TEST-RES-07` | `PATCH /api/staff/tickets/:id/status` | Attempting to transition `CANCELLED` ticket to `REOPENED` or any other status. | `409 Conflict`; code `INVALID_STATUS_TRANSITION` (CANCELLED is terminal). | Passed |
| `TEST-RES-08` | `PATCH /api/staff/tickets/:id/status` | Attempting prohibited active-to-CLOSED shortcut (`OPEN` $\rightarrow$ `CLOSED`). | `409 Conflict`; code `INVALID_STATUS_TRANSITION`. | Passed |
| `TEST-RES-09` | `PATCH /api/staff/tickets/:id/status` | Stale update submission where `expectedUpdatedAt` does not match database. | `409 Conflict`; code `TICKET_VERSION_CONFLICT`. | Passed |
| `TEST-RES-10` | `PATCH /api/staff/tickets/:id/status` | Legacy ticket query: retrieving existing resolved/closed tickets from Lab 3. | `200 OK`; query succeeds without requiring backfilled actions. | Passed |

---

### 3.3 Server Concurrency: Serialization & Race Conditions (`server/tests/lab-04/concurrency-serialization.test.ts`)

| Test ID | Scope | Description / Simulation | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-CONC-01` | Action Creation vs Ticket Resolution | 10 concurrent iterations where Thread A attempts to resolve ticket while Thread B attempts to add a `PENDING` action. | Row lock ensures serialization. Either ticket resolves first (causing action creation to fail with `422 TICKET_TERMINAL_IMMUTABLE`) or action creates first (causing resolution to fail with `422 RESOLUTION_GATE_PENDING_ACTIONS`). In 0% of runs is a resolved ticket left with pending actions. | Passed |
| `TEST-CONC-02` | Action Completion vs Ticket Resolution | Thread A attempts to complete last pending action while Thread B concurrently attempts to resolve ticket. | Lock serialization handles both valid acquisition orders: (1) If resolution locks first, it fails gate (pending action still open), then action completes; (2) If action completion locks first, action completes, then resolution evaluates gate and succeeds. In both orders, state remains consistent. | Passed |
| `TEST-CONC-03` | Concurrent Action Edits | Two threads attempt to update the same action simultaneously with the same version number. | Exactly one thread succeeds with `200 OK`; the other fails with `409 ACTION_VERSION_CONFLICT`. | Passed |

---

### 3.4 Server Integration: Role Dashboards & Drill-Downs (`server/tests/lab-04/staff-dashboard.api.test.ts`, `requester-dashboard.api.test.ts` & `dashboard-performance.test.ts`)

| Test ID | Method & Path | Description / Precondition | Expected Status & Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-DASH-01` | `GET /api/staff/dashboard` | IT Staff queries dashboard with populated seed data. | `200 OK`; accurate counts for open tickets (team), pending actions (user), completed actions today (user), unassigned tickets (team). | Passed |
| `TEST-DASH-02` | `GET /api/staff/dashboard` | Completed Actions Today UTC boundary check: action completed at 23:59 UTC yesterday vs 00:01 UTC today. | `200 OK`; only actions completed $\ge 00:00:00.000\text{Z}$ today by current user (`completedById == currentUser.id`) are included. | Passed |
| `TEST-DASH-03` | `GET /api/staff/dashboard` | IT Staff queries dashboard with zero tickets in database. | `200 OK`; returns zero counts and empty arrays safely without throwing errors. | Passed |
| `TEST-DASH-04` | `GET /api/staff/dashboard` | Requester attempts to query IT Staff dashboard endpoint. | `403 Forbidden`. | Passed |
| `TEST-DASH-05` | `GET /api/requester/dashboard` | Requester queries personal dashboard. | `200 OK`; returns counts and recent tickets strictly matching `Ticket.requesterId == currentUser.id`. | Passed |
| `TEST-DASH-06` | `GET /api/requester/dashboard` | Requester dashboard privacy check: ticket has internal notes and staff audit history. | `200 OK`; recent activity includes public comments/status only; internal notes and audit history are absent. | Passed |
| `TEST-DASH-07` | `GET /api/requester/dashboard` | Requester with zero submitted tickets queries dashboard. | `200 OK`; returns 0 active, 0 awaiting, 0 resolved, empty `recentTickets`. | Passed |
| `TEST-DASH-08` | `GET /api/requester/dashboard` | IT Staff attempts to query Requester dashboard endpoint. | `403 Forbidden`. | Passed |
| `TEST-DASH-09` | `GET /api/staff/tickets?statusGroup=active` | Query staff queue with `statusGroup=active`. | `200 OK`; returns only non-terminal tickets (`NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED`); top-level `query` echoes filter. | Passed |
| `TEST-DASH-10` | `GET /api/staff/tickets?owner=unassigned&statusGroup=active` | Query unassigned active tickets. | `200 OK`; returns unassigned active tickets, strictly excluding cancelled unassigned tickets. | Passed |
| `TEST-DASH-11` | `GET /api/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active` | Precondition: Database includes an active ticket with pending action for me, plus a `CANCELLED` ticket with a frozen pending action for me. | `200 OK`; returns only the active ticket; the cancelled ticket is excluded from both the count and this queue query. | Passed |
| `TEST-DASH-12` | `GET /api/staff/tickets?completedBy=me&completedDate=today` | Query tickets containing actions completed by current user today. | `200 OK`; returns tickets containing actions where `completedById == currentUser.id` completed today (UTC). | Passed |
| `TEST-DASH-13` | `GET /api/tickets?statusGroup=active` & `statusGroup=resolved_closed` | Query requester tickets with status group filters. | `200 OK`; returns matching requester tickets; top-level `query` echoes filter. | Passed |
| `TEST-PERF-01` | Performance Smoke | Measure response times for `/api/staff/dashboard` and `/api/requester/dashboard` against a seeded dataset of 500 tickets. | Response time $< 200\text{ms}$ at 95th percentile. | Passed |

---

### 3.5 Server Integration: Database Triggers, Migration & Recovery Rehearsal (`server/tests/lab-04/migration-recovery.test.ts`)

| Test ID | Scope | Description / Verification | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-HIST-01` | Database Trigger Immutability | Attempt raw SQL `UPDATE "ActionTakenHistory"` or `DELETE FROM "ActionTakenHistory"`. | Trigger `trg_action_history_append_only` raises exception; query is rejected. | Passed |
| `TEST-HIST-02` | Atomic Rollback on Failure | Simulate database failure during history insertion inside creation transaction. | Entire transaction rolls back; no record created in `ActionTaken` or `ActionTakenHistory`. | Passed |
| `TEST-HIST-03` | State Timeline Reconstruction | Retrieve history records for an action that underwent create, edit, reassign, complete. | Records ordered by `createdAt ASC, id ASC` completely reconstruct field values at each step. | Passed |
| `TEST-MIGR-01` | Populated Migration | Apply Lab 4 Prisma migration on a database populated with Lab 3 users, tickets, attachments, comments, and notes. | Migration succeeds cleanly; 100% of existing rows and relationships remain intact. | Passed |
| `TEST-MIGR-02` | Seed Idempotency | Execute `prisma db seed` three consecutive times on the migrated database. | Seed completes without unique constraint violations or duplicate tickets/actions. | Passed |
| `TEST-MIGR-03` | Sequence Collision-Free Allocation | Verify sequence state (`last_value`, `is_called`) on `ActionTaken` and `ActionTakenHistory` sequences, ensuring subsequent allocations are collision-free. | Sequences advance cleanly; subsequent allocations generate strictly increasing unique IDs. | Passed |
| `TEST-RECOV-01` | Recovery Rehearsal in Disposable DB | Precondition: Database contains populated Lab 4 actions and history. Dump using `pg_dump --format=custom --file=...`. Restore into separate disposable test database (`toktickit_recovery_test`) using `pg_restore`. | 100% table row counts match source; foreign keys, sequence state (`last_value`/`is_called` with collision-free subsequent allocation), and trigger immutability verified. | Passed |

---

### 3.6 Client Component Tests (`client/tests/lab-04/*.test.tsx`)

| Test ID | Component | Scenario | Expected DOM / Interaction Behavior | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-UI-01` | `ActionsTakenSection.test.tsx` | Renders actions list with mixed statuses. | Correct Zen Green badge colors, clock icon for pending, checkmark for completed. | Passed |
| `TEST-UI-02` | `ActionsTakenSection.test.tsx` | Staff opens "Complete Action" modal, submits empty result. | In-modal error displayed; submit disabled or rejected; modal remains open and entered text preserved. | Passed |
| `TEST-UI-03` | `ActionsTakenSection.test.tsx` | Staff opens "Complete Action" modal, submits valid result string. | Submit enters pending disabled state with spinner; successfully completes; closes modal; refreshes list. | Passed |
| `TEST-UI-04` | `ActionsTakenSection.test.tsx` | Staff opens "Cancel Action" modal, submits valid reason. | Button enters pending disabled state; submits payload; closes modal; refreshes list. | Passed |
| `TEST-UI-05` | `ActionsTakenSection.test.tsx` | Modal focus management: open modal, press Tab, press Escape. | Focus is trapped inside modal; pressing Escape closes modal and restores focus to trigger button. | Passed |
| `TEST-UI-06` | `ActionsTakenSection.test.tsx` | Renders Actions Taken panel for Requester role. | Edit, complete, cancel, and add buttons are absent; read-only text is rendered. | Passed |
| `TEST-UI-07` | `TicketWorkflow.test.tsx` | Staff selects `RESOLVED` on ticket with pending actions. | Red alert banner renders with `role="alert"` explaining missing prerequisites. | Passed |
| `TEST-UI-08` | `StaffDashboard.test.tsx` | Renders 4 metric cards and drill-down links. | Cards display formatted counts; clicking "Unassigned Queue" navigates to `/staff/tickets?owner=unassigned&statusGroup=active`. | Passed |
| `TEST-UI-09` | `RequesterDashboard.test.tsx`| Renders requester summary cards and recent activity. | Displays active ticket counts; clicking "Awaiting Input" navigates to `/tickets?status=WAITING_FOR_REQUESTER`. | Passed |

---

### 3.7 End-to-End (E2E) Browser Tests (`e2e/lab-04/*.spec.ts`)

| Test ID | File | Scenario & User Journey | Expected Browser Behavior | Status |
| :--- | :--- | :--- | :--- | :---: |
| `TEST-E2E-01` | `actions-workflow.spec.ts` | Complete Actions Taken lifecycle: Staff logs in, opens ticket, adds action, assigns to teammate, edits note, completes with result. | All steps update UI in real time; audit history drawer reflects all transitions. | Passed |
| `TEST-E2E-02` | `actions-workflow.spec.ts` | Resolution gate enforcement: Staff attempts to resolve ticket with pending action $\rightarrow$ blocked; completes action $\rightarrow$ resolution succeeds. | UI displays gate error banner; once criteria satisfied, ticket status transitions to `RESOLVED`. | Passed |
| `TEST-E2E-03` | `dashboards.spec.ts` | Role dashboard journeys & drill-down: Staff clicks "Unassigned Queue" card $\rightarrow$ arrives at filtered queue; Requester clicks "Awaiting Input" $\rightarrow$ arrives at My Tickets with filtered status. | URL parameters populate correctly and table renders filtered results. Back/Forward navigation works. | Passed |
| `TEST-E2E-04` | `dashboards.spec.ts` | Responsive reflow test at 375px, 768px, and 1280px viewports. | Zero horizontal scrollbars; cards reflow vertically; tap targets meet minimum 44px size. | Passed |
| `TEST-E2E-05` | `dashboards.spec.ts` | WCAG 1.4.10 equivalent-width reflow check at 320px viewport. | Content reflows into single column without horizontal document scroll and with zero clipped content. | Passed |
| `TEST-E2E-06` | `dashboards.spec.ts` | Automated axe-core accessibility audit on Staff Dashboard, Requester Dashboard, and Actions Taken panel. | Zero WCAG 2.2 AA violations detected. | Passed |

---

## 4. Acceptance Criteria Traceability Matrix

| Acceptance Criterion | Description | Mapping Test IDs |
| :--- | :--- | :--- |
| **AC-01** | Create Action Taken & history record | `TEST-ACT-01`, `TEST-E2E-01` |
| **AC-02** | Reject inactive assignee or requester | `TEST-ACT-02`, `TEST-ACT-03` |
| **AC-03** | Complete Action Taken & attribution | `TEST-ACT-08`, `TEST-ACT-25`, `TEST-ACT-26`, `TEST-UI-03`, `TEST-E2E-01` |
| **AC-04** | Reject completion without result | `TEST-ACT-09`, `TEST-UI-02` |
| **AC-05** | Cancel Action Taken with reason | `TEST-ACT-10`, `TEST-UI-04` |
| **AC-06** | Reject cancellation without reason | `TEST-ACT-11` |
| **AC-07** | Reject editing terminal actions | `TEST-ACT-12` |
| **AC-08** | Reject actions on terminal tickets | `TEST-RES-05` |
| **AC-09** | Requester read-only visibility & safe 404 | `TEST-ACT-13`, `TEST-ACT-14`, `TEST-UI-06` |
| **AC-10** | Durable Idempotent Retries & Replay | `TEST-ACT-17`, `TEST-ACT-18`, `TEST-ACT-21`, `TEST-ACT-22`, `TEST-ACT-23`, `TEST-ACT-24` |
| **AC-11** | Resolution Gate - Success | `TEST-RES-01`, `TEST-E2E-02` |
| **AC-12** | Resolution Gate - Missing Owner | `TEST-RES-02`, `TEST-UI-07` |
| **AC-13** | Resolution Gate - No Completed Actions | `TEST-RES-03`, `TEST-UI-07` |
| **AC-14** | Resolution Gate - Pending Actions Remain | `TEST-RES-04`, `TEST-UI-07`, `TEST-E2E-02` |
| **AC-15** | Parent Row Lock Concurrency Serialization | `TEST-CONC-01`, `TEST-CONC-02` |
| **AC-16** | Stale Update Detection | `TEST-ACT-07`, `TEST-RES-09`, `TEST-CONC-03` |
| **AC-17** | Staff Dashboard Operational Metrics | `TEST-DASH-01`, `TEST-DASH-02`, `TEST-UI-08` |
| **AC-18** | Staff Dashboard Drill-Down | `TEST-DASH-09`, `TEST-DASH-10`, `TEST-DASH-11`, `TEST-DASH-12`, `TEST-E2E-03` |
| **AC-19** | Requester Dashboard Scoping & Privacy | `TEST-DASH-05`, `TEST-DASH-06`, `TEST-UI-09` |
| **AC-20** | Requester Dashboard Drill-Down | `TEST-DASH-13`, `TEST-E2E-03` |
| **AC-21** | Role Boundary Enforcement | `TEST-DASH-04`, `TEST-DASH-08` |
| **AC-22** | Lab 1–3 Regression Preservation | Regression Suites (Labs 1–3 test pass) |
| **AC-23** | Accessibility & Reflow (WCAG 2.2 AA) | `TEST-UI-05`, `TEST-E2E-04`, `TEST-E2E-05`, `TEST-E2E-06` |

---

## 5. Candidate Verification Records

```markdown
### Server Test Suite Execution
- **Command:** `npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests/lab-04`
- **Result:** Passed
- **Pass Count:** 65 (7 test files)
- **Fail Count:** 0

### Client Test Suite Execution
- **Command:** `npm --prefix client test`
- **Result:** Passed
- **Pass Count:** 132 (24 test files)
- **Fail Count:** 0

### Concurrency Race Test Execution
- **Command:** `npx dotenv-cli -e server/.env -- npx --prefix server vitest run tests/lab-04/concurrency-serialization.test.ts`
- **Result:** Passed
- **Iterations:** 10
- **Violations Detected:** 0

### Dashboard Performance Baseline (TEST-PERF-01)
- **Command:** `npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests/lab-04/dashboard-performance.test.ts`
- **Dataset Size:** 500 tickets, representative actions, comments, notes across documented ownership distribution
- **Methodology:** Warmup iterations followed by N=35 measured authenticated samples per endpoint; p95 computed via nearest-rank `sorted[Math.ceil(0.95 * N) - 1]`
- **Staff Dashboard:** Measured p95 = 14.65 ms (min = 9.92 ms, avg = 12.13 ms, max = 16.12 ms) vs target < 200 ms
- **Requester Dashboard:** Measured p95 = 12.65 ms (min = 7.96 ms, avg = 9.96 ms, max = 13.05 ms) vs target < 200 ms
- **Result:** Passed

### Disaster Recovery Rehearsal (TEST-RECOV-01)
- **Command:** `npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests/lab-04/migration-recovery.test.ts`
- **Backup / Restore Tooling:** Native PostgreSQL 15 custom-format `pg_dump -Fc` and `pg_restore` executed against isolated disposable databases (`toktickit_recov_src_*` and `toktickit_recov_dst_*`)
- **Row Count Parity:** 100% match across User, Category, RelatedSystem, Ticket, Attachment, PublicComment, InternalNote, ActionTaken, ActionTakenHistory
- **Sequence Parity:** Exact match of `last_value` and `is_called` across all 11 database sequences prior to post-restore allocations
- **Collision-Free Allocation:** Verified subsequent `ActionTaken` and `ActionTakenHistory` inserts advance cleanly from gaps without collisions
- **Trigger Immutability:** Verified restored `trg_action_history_append_only` trigger rejects direct `UPDATE` and `DELETE` on `ActionTakenHistory`
- **Result:** Passed

### Playwright E2E Suite Execution
- **Command:** `npx playwright test --config playwright.lab4.config.ts`
- **Result:** Passed
- **Schema:** `e2e_test`
- **Passed Scenarios:** 12 (desktop & mobile)
- **Axe-core Violations:** 0
```
