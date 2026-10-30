# Lab 4 Sprint Engineering Specification: Actions Taken, Ticket Workflow, and Role Dashboards

## 1. Sprint Goal

Deliver the Actions Taken operational foundation, an append-only historical audit trail, robust parent-Ticket concurrency serialization, a verified Ticket resolution gate, and dedicated operational role dashboards for IT Staff and Requesters in TokTickIT. The increment preserves all data and capabilities from Labs 1–3 while hardening workflow integrity, eliminating race conditions between task execution and ticket closure, ensuring full WCAG 2.2 AA accessibility, and maintaining the responsive Zen Green visual language.

## 2. Stakeholder Request Interpretation

TokTickIT previously introduced role-based authentication, an IT Staff ticket queue, and basic ticket status updates. However, IT Staff still lack granular tracking of operational tasks performed on tickets, and Requesters lack visibility into the concrete progress being made.

In this increment, the IT service desk requires:
1. **Granular Operational Records (Actions Taken):** IT Staff must be able to record individual diagnostic, remediation, and verification actions taken on a ticket. A single ticket may have multiple actions taken by different staff members, independent of the primary ticket coordinator.
2. **Accountability and Append-Only History:** Edits, assignments, and status transitions must never overwrite past history. Every change must be preserved in an immutable audit log with full before-and-after fidelity and deterministic ordering, enforced at the database level against direct mutations.
3. **Decoupled Completion Attribution:** Any active staff member can complete an action assigned to another staff member or an unassigned action. The completion metric and audit log must attribute the work to the actual completion actor (`completedById`), not the nominal assignee.
4. **Strict Ticket Resolution Gate:** A ticket cannot be marked `RESOLVED` arbitrarily. It must have an assigned owner, at least one completed action demonstrating tangible results, and no unresolved pending actions.
5. **Concurrency and Race-Condition Protection:** Staff members working concurrently on actions or ticket resolution must never leave the system in an inconsistent state (such as resolving a ticket while a pending action is simultaneously added).
6. **Durable Idempotent Retries:** Network drops and user double-clicks must safely replay without generating duplicate actions or redundant history records, even if the ticket resolves before the retry arrives.
7. **Role-Tailored Dashboards with Precise Drill-Downs:** Requesters require an executive summary of their active requests and recent updates (excluding internal technical notes), while IT Staff require actionable operational metrics, workload breakdowns, and 1-click drill-down navigation into queues where destination filters (`statusGroup=active`, `actionAssignee=me`, `completedBy=me`) exactly mirror the counted sets.
8. **Zen Green Continuity and Zero Regression:** All existing capabilities (categories, attachments, public comments, internal notes, user management, and session authentication) must continue to function seamlessly.

## 3. Scope

### Included

- **Actions Taken Domain Lifecycle:** Support for `PENDING`, `COMPLETED`, and `CANCELLED` action statuses with mandatory field validations (`result` required on completion; `cancellationReason` required on cancellation; `followUpNote` required when follow-up is requested).
- **Explicit Completion Attribution:** Tracking `completedById: Int?` on `ActionTaken` (immutable once set) reflecting the authenticated staff member who completed the action, backed by the `COMPLETED` history event.
- **Append-Only History Audit Trail (`ActionTakenHistory`):** Atomic audit records capturing every creation, edit, assignment change, and status transition with actor identity, before/after values, and deterministic ordering (`createdAt ASC`, tie-breaker `id ASC`), enforced against direct SQL updates/deletions by a PostgreSQL trigger.
- **Parent-Ticket Concurrency Serialization:** Shared row-level locking (`SELECT id, "currentStatus", "ownerId", "updatedAt" FROM "Ticket" WHERE id = $1 FOR UPDATE`) across all Action mutations and Ticket status updates to prevent race conditions and phantom actions on resolved tickets.
- **Enforced Ticket Resolution Gate:** Validation on `PATCH /api/staff/tickets/:id/status` requiring (1) an assigned ticket owner (`ownerId != null`), (2) at least one `COMPLETED` Action Taken with a non-empty `result`, and (3) zero `PENDING` Actions Taken.
- **Terminal Ticket Mutation Freezing & Reopen Rules:** Actions Taken cannot be created, edited, assigned, completed, or cancelled on tickets in terminal states (`RESOLVED`, `CLOSED`, `CANCELLED`). An explicit reopen transition (`RESOLVED -> REOPENED` or `CLOSED -> REOPENED`) is required prior to further operational work. `CANCELLED` tickets cannot be reopened.
- **Durable Create-Action Retry Policy:** Idempotency key tracking on Action creation comparing canonical normalized payloads against a stored creation fingerprint, enabling safe replay even after subsequent edits or ticket resolution.
- **Legacy Data & Migration Preservation:** Zero loss or corruption of existing tickets, attachments, users, comments, or notes. Legacy tickets remain intact without fabricating artificial actions; resolution gate applies solely to active transitions moving to `RESOLVED`.
- **IT Staff Dashboard & Precise Drill-Downs:** Authoritative operational metrics (Open Tickets, Pending Actions, Completed Actions today, Unassigned Tickets) with explicit query extensions (`statusGroup=active`, `owner=unassigned&statusGroup=active`, `actionAssignee=me&actionStatus=PENDING&statusGroup=active`, `completedBy=me&completedDate=today`) guaranteeing that drill-down destinations reproduce the counted sets.
- **Requester Dashboard:** Authoritative requester-scoped metrics (Active Tickets, Awaiting Requester, Resolved/Closed), recent ticket activity summaries (strictly excluding internal notes and technical audit logs), and direct navigation to owned tickets with status filtering (`statusGroup=active`, `status=WAITING_FOR_REQUESTER`, `statusGroup=resolved_closed`).
- **Zen Green UI & Accessibility:** High-contrast, responsive layouts (desktop, tablet, mobile) compliant with WCAG 2.2 AA (minimum 4.5:1 text contrast, visible focus rings, non-color status indicators, modal focus trapping/restoration, and no clipped content at 400% zoom / 320px viewport).
- **Comprehensive Test Harness:** Automated unit, integration, concurrency race, security authorization, regression, accessibility (axe-core), and E2E test suites in isolated test environments.

### Excluded

- Automatic SLA timers, breach countdown clocks, on-call schedules, and automated escalation engines.
- External notification channels (Email, SMS, LINE, Webhooks, Push notifications).
- Inventory consumption, spare parts tracking, purchasing orders, and material cost accounting.
- Labor billing, hourly rate calculators, payroll integration, and timesheet exports.
- Multi-tier electronic signatures, managerial sign-offs, and approval workflow trees.
- Direct active-to-CLOSED status shortcuts (bypassing RESOLVED) or reopening CANCELLED tickets.
- Standalone Actions Taken management page (all action interactions occur in-context on Ticket Detail and queue drill-downs).
- Custom business-intelligence report designers, OLAP cubes, and CSV/PDF data warehouse export tools.
- Multi-tenant organizational partitioning and production cloud orchestration.

---

## 4. Functional Requirements

### Actions Taken Lifecycle & Management

- **FR-01 - Create Action Taken:** An active IT Staff member or Administrator can record an Action Taken on an accessible, non-terminal ticket with an integer ticket ID, a description, optional integer assignee ID, follow-up flag/note, attachment references, and an optional client idempotency key. The authenticated creator is automatically recorded.
- **FR-02 - List Actions Taken:** Permitted users can retrieve all Actions Taken for a ticket. IT Staff and Administrators see all actions and management controls; Requesters see all actions (`PENDING`, `COMPLETED`, `CANCELLED`) on owned tickets in read-only mode. Requests for non-existent tickets or tickets owned by another requester return an identical safe HTTP 404 response.
- **FR-03 - Edit Action Taken:** An active IT Staff member or Administrator can update an existing action's description, follow-up flags, and attachment notes, preserving historical records.
- **FR-04 - Assign / Reassign Action Taken:** An active IT Staff member or Administrator can assign or reassign an action to any active IT Staff member or Administrator (integer User ID). Assigning to inactive users or requesters is rejected.
- **FR-05 - Complete Action Taken & Attribution:** An active IT Staff member or Administrator can transition a `PENDING` action to `COMPLETED`, providing a mandatory non-empty `result` text and completion timestamp. The system records `completedById` as the authenticated actor performing the completion, independent of `assigneeId`.
- **FR-06 - Cancel Action Taken:** An active IT Staff member or Administrator can transition a `PENDING` action to `CANCELLED`, providing a mandatory non-empty `cancellationReason`.
- **FR-07 - Append-Only Audit Trail:** The system atomically records an immutable history entry in `ActionTakenHistory` for every action creation, edit, assignment change, and status transition. Direct SQL updates or deletions against `ActionTakenHistory` are prevented by a database trigger.
- **FR-08 - View Action History:** IT Staff and Administrators can inspect the complete audit trail of an Action Taken, detailing actor, timestamp, event type, and field-level changes. Requesters are strictly forbidden from viewing internal history.
- **FR-09 - Durable Idempotency Handling:** Submitting an Action creation request with a previously committed `idempotencyKey` evaluates the key *before* mutable creation gates. If the canonical normalized payload matches the stored `creationFingerprint`, the server replays the original creation response with HTTP 200, even if the parent ticket is now resolved/closed or the original assignee is inactive. Conflicting payloads with the same key return HTTP 409 `IDEMPOTENCY_CONFLICT`.

### Ticket Workflow & Concurrency Serialization

- **FR-10 - Ticket Status Workflow Extension:** Staff and Administrators update ticket status via `PATCH /api/staff/tickets/:id/status`, supplying target `status` and `expectedUpdatedAt`. The endpoint updates `Ticket.currentStatus` strictly following the approved transition matrix from `server/src/ticket-workflow.ts`, returning `previousStatus` and `currentStatus`.
- **FR-11 - Enforce Resolution Gate:** When transitioning `Ticket.currentStatus` to `RESOLVED`, the server strictly blocks the update unless: (a) `ownerId` is assigned, (b) at least one `COMPLETED` Action Taken exists with a non-empty `result`, and (c) zero `PENDING` Actions Taken exist.
- **FR-12 - Terminal Ticket Immutability:** The server strictly rejects creating, editing, or altering Actions Taken on tickets with `currentStatus` in `RESOLVED`, `CLOSED`, or `CANCELLED`.
- **FR-13 - Reopening Workflow:** A `RESOLVED` or `CLOSED` ticket can transition to `REOPENED`. Once `REOPENED`, actions can be created or updated. `CANCELLED` tickets cannot be reopened.
- **FR-14 - Parent-Ticket Concurrency Serialization:** All Action mutations and Ticket status updates acquire an exclusive row lock on the parent ticket (`SELECT id, "currentStatus", "ownerId", "updatedAt" FROM "Ticket" WHERE id = $1 FOR UPDATE`), guaranteeing atomic gate evaluation and eliminating race conditions.
- **FR-15 - Stale Update Protection:** Ticket status updates validate `expectedUpdatedAt` against `Ticket.updatedAt`, returning HTTP 409 `TICKET_VERSION_CONFLICT` on mismatch. Action edits validate `version`, returning HTTP 409 `ACTION_VERSION_CONFLICT` on mismatch.

### Operational Role Dashboards & Drill-Downs

- **FR-16 - IT Staff Dashboard:** IT Staff and Administrators can access `/api/staff/dashboard` displaying authoritative counts: Open Tickets (team), Pending Actions (current user on active tickets), Completed Actions today (actions completed by current user since UTC midnight), and Unassigned Tickets (team).
- **FR-17 - Staff Workload Breakdown:** The Staff Dashboard provides categorized preview lists: "My Assigned Work" (up to 5 tickets owned by current user), "Unassigned Team Queue" (up to 5 unassigned tickets), and "Recent Action Activity" (up to 10 actions completed by or created by current user).
- **FR-18 - Requester Dashboard:** Requesters can access `/api/requester/dashboard` summarizing owned tickets: Active Tickets, Awaiting Requester Action (`WAITING_FOR_REQUESTER`), and Resolved/Closed Tickets, alongside a safe recent activity log (up to 5 tickets owned by the requester) excluding internal notes, audit history, and staff-only identifiers.
- **FR-19 - Interactive Metric Drill-Down:** Clicking metric cards navigates to queue views where the destination filter exactly reproduces the counted set (`/staff/tickets?statusGroup=active`, `/staff/tickets?owner=unassigned&statusGroup=active`, `/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active`, `/staff/tickets?completedBy=me&completedDate=today`, `/tickets?statusGroup=active`, `/tickets?status=WAITING_FOR_REQUESTER`, `/tickets?statusGroup=resolved_closed`).

### Quality, Regression, and System Hardening

- **FR-20 - Legacy Ticket & Data Preservation:** All tickets, attachments, users, comments, and notes from earlier labs remain valid and operational. Legacy resolved/closed tickets without actions remain queryable without artificial data generation.
- **FR-21 - Standard Envelopes & Auth Consistency:** All endpoints maintain the established TokTickIT error format `{ error: { code, message, fields?, retryable? } }`, data wrapper `{ data: { ... } }`, top-level `query` echo on queue endpoints, CSRF validation with code `CSRF_INVALID`, and mandatory password change enforcement (`PASSWORD_CHANGE_REQUIRED`).
- **FR-22 - Responsive & Accessible Experience:** Dashboards and ticket detail panels render responsively across mobile (375px), tablet (768px), and desktop (1280px+) with zero horizontal viewport scrolling, pending-submit button states, form state preservation on recoverable failure, modal focus trapping/restoration, and full support for equivalent-width 320px reflow (caveat: automated tests and 320px viewport checks verify reflow and DOM criteria, but do not replace manual 400% zoom or screen-reader evaluation).

---

## 5. Business Rules

### Actions Taken Lifecycle & Validation

- **BR-01 - Single Ticket Association:** Every Action Taken belongs to exactly one parent Ticket (`ticketId` is a required integer referencing `Ticket.id`). Standalone or cross-ticket actions are prohibited.
- **BR-02 - Permitted Assignees & Performers:** The `assigneeId`, `createdById`, `completedById`, and history `actorId` of an Action Taken must be active users with role `IT_STAFF` or `ADMINISTRATOR` (integer referencing `User.id`). Assigning an action to a `REQUESTER`, an inactive account, or a non-existent user returns HTTP 422 with code `INVALID_ACTION_ASSIGNEE`.
- **BR-03 - Decoupled Ownership & Completion:**
  - The Ticket Owner coordinates the overall ticket, while actions represent discrete tasks.
  - Any permitted staff member may complete an action assigned to another staff member or an unassigned action.
  - Upon completion, `ActionTaken.completedById` is recorded as the authenticated actor performing the completion. The `assigneeId` is preserved as the assigned owner of the action.
- **BR-04 - Action Status Set:** Valid Action Taken statuses are strictly `PENDING`, `COMPLETED`, and `CANCELLED`. Newly created actions default to `PENDING`.
- **BR-05 - Completion Criteria:** Transitioning an Action Taken to `COMPLETED` requires a non-empty `result` string (minimum 3 non-whitespace characters, maximum 4,000 characters) and automatically records `completedAt = now()` and `completedById = currentUser.id`.
- **BR-06 - Cancellation Criteria:** Transitioning an Action Taken to `CANCELLED` requires a non-empty `cancellationReason` string (minimum 3 non-whitespace characters, maximum 2,000 characters) and automatically records `cancelledAt = now()`.
- **BR-07 - Follow-Up Validation:** If `followUpRequired` is set to `true`, `followUpNote` is mandatory (non-empty string, maximum 1,000 characters). If `followUpRequired` is `false`, `followUpNote` must be null or empty.
- **BR-08 - Description Length:** `description` is mandatory on creation and edit (minimum 5 characters, maximum 2,000 characters).
- **BR-09 - Attachment Notes:** `attachmentNotes` is optional (maximum 1,000 characters) and specifies diagnostic logs, screenshots, or files relevant to the action.

### Durable Idempotency & Creation Normalization

- **BR-10 - Canonical Payload Normalization:**
  Before computing the creation fingerprint, the request payload is canonically normalized:
  1. Trim leading and trailing whitespace from `description`, `followUpNote`, and `attachmentNotes`.
  2. Treat empty or whitespace-only `followUpNote` and `attachmentNotes` as `null`.
  3. Default `followUpRequired` to `false` if omitted.
  4. Default `assigneeId` to `null` if omitted.
  5. The canonical fingerprint is computed as `SHA-256` hex digest of the canonical JSON string:
     `{"assigneeId":<int|null>,"attachmentNotes":<str|null>,"description":<str>,"followUpNote":<str|null>,"followUpRequired":<bool>}`.
- **BR-11 - Idempotency Persistence & Evaluation Order:**
  `ActionTaken` stores `idempotencyKey: String?`, `creationFingerprint: String?`, and `creationResponse: Json?`.
  On `POST /api/tickets/:id/actions`:
  1. Verify authentication, mandatory password change, and CSRF (`CSRF_INVALID`).
  2. Authorize role (`IT_STAFF`, `ADMINISTRATOR`).
  3. Validate request schema and compute `incomingFingerprint`.
  4. Acquire parent Ticket row lock: `SELECT id, "currentStatus", "ownerId", "updatedAt" FROM "Ticket" WHERE id = $1 FOR UPDATE`.
  5. If `idempotencyKey` is supplied, query `ActionTaken` by `(ticketId, idempotencyKey)`.
     - **Match Found:**
       - If `creationFingerprint === incomingFingerprint` $\rightarrow$ replay success: return HTTP 200 with stored `creationResponse`. This replay succeeds **even if the parent Ticket has since transitioned to RESOLVED, CLOSED, or CANCELLED, and even if the assigned staff member is now inactive.**
       - If `creationFingerprint !== incomingFingerprint` $\rightarrow$ payload mismatch: return HTTP 409 with code `IDEMPOTENCY_CONFLICT`.
     - **No Match Found:**
       - Enforce mutable creation gates: check `Ticket.currentStatus` is not terminal (`RESOLVED`, `CLOSED`, `CANCELLED`); check `assigneeId` is active staff/admin; validate `followUpNote` if `followUpRequired = true`.
       - Insert `ActionTaken` (storing `idempotencyKey`, `creationFingerprint`, and response DTO), insert `ActionTakenHistory` record, and commit.
- **BR-12 - Idempotency Scope & Client Behavior:**
  - Client generates one UUIDv4 per creation intent.
  - Client reuses the identical key across retries (network timeouts, recoverable HTTP 502/504 errors).
  - Client generates a new key only when initiating a new creation action.
  - The web UI always supplies an `idempotencyKey`.

### Append-Only History & Audit Integrity

- **BR-13 - Atomic Audit Logging:** Every mutation to an Action Taken (creation, field edit, reassignment, completion, cancellation) must insert a corresponding record into `ActionTakenHistory` within the identical database transaction. If history logging fails, the entire transaction rolls back.
- **BR-14 - Database-Enforced Immutability:** Records in `ActionTakenHistory` are strictly append-only. A PostgreSQL database trigger `trg_action_history_append_only` intercepts any `UPDATE` or `DELETE` on `ActionTakenHistory` and aborts the query with an exception. Relations between `ActionTakenHistory`, `Ticket`, and `User` use `onDelete: Restrict, onUpdate: Cascade`.
- **BR-15 - Reconstructible State:** Each history entry records the event type (`CREATED`, `UPDATED`, `ASSIGNED`, `COMPLETED`, `CANCELLED`), the acting user (`actorId`), timestamp (`createdAt`), version increments, and complete before-and-after values for all mutable fields.
- **BR-16 - Deterministic History Ordering:** History records for an action are retrieved deterministically ordered by `createdAt ASC`, with tie-breaker `id ASC`.
- **BR-17 - Role Visibility of History:** IT Staff and Administrators have access to full Action Taken history records. Requesters are restricted to viewing current Action Taken records and cannot view internal history change events.

### Ticket Status Workflow & Resolution Gate

- **BR-18 - Baseline Transition Matrix:** The permitted ticket status transitions are strictly governed by `server/src/ticket-workflow.ts`:
  - `NEW` $\rightarrow$ `OPEN`, `IN_PROGRESS`, `CANCELLED`
  - `OPEN` $\rightarrow$ `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED`
  - `IN_PROGRESS` $\rightarrow$ `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED`
  - `WAITING_FOR_REQUESTER` $\rightarrow$ `IN_PROGRESS`, `RESOLVED`, `CANCELLED`
  - `RESOLVED` $\rightarrow$ `CLOSED`, `REOPENED`
  - `CLOSED` $\rightarrow$ `REOPENED`
  - `REOPENED` $\rightarrow$ `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED`
  - `CANCELLED` $\rightarrow$ (none; strictly terminal)
  Any transition outside this matrix is rejected with HTTP 409 `INVALID_STATUS_TRANSITION`.
- **BR-19 - Ticket Resolution Gate Conditions (Proposed Design Decision):** A Ticket can only transition from an active status (`OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `REOPENED`) to `RESOLVED` if all of the following conditions are satisfied simultaneously:
  1. Primary Owner Assigned: The ticket has an assigned active owner (`Ticket.ownerId != null`).
  2. Proof of Work: The ticket has at least one Action Taken with status `COMPLETED` and a non-empty `result` (trimmed length $\ge 3$).
  3. No Pending Work: The ticket has zero Actions Taken with status `PENDING`.
  If any condition fails, the status update is rejected with HTTP 422, returning specific error codes `RESOLUTION_GATE_NO_OWNER`, `RESOLUTION_GATE_NO_COMPLETED_ACTION`, or `RESOLUTION_GATE_PENDING_ACTIONS`.
- **BR-20 - Clearing Resolution Indications:** Transitioning a ticket to `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED` atomically clears `requesterResolutionIndicatedAt` and `requesterResolutionIndicatedById` (`null`), matching Lab 3 behavior.
- **BR-21 - Terminal Ticket Immutability:** Tickets in status `RESOLVED`, `CLOSED`, or `CANCELLED` are terminal. No Action Taken can be created, edited, assigned, completed, or cancelled while the ticket remains in a terminal status (returns HTTP 422 `TICKET_TERMINAL_IMMUTABLE`).
- **BR-22 - Ticket Reopening for Remediation:** To perform additional actions on a `RESOLVED` or `CLOSED` ticket, an authorized staff member must transition the ticket to `REOPENED`. Once `REOPENED`, actions may be added or updated, and the ticket must satisfy the resolution gate again before returning to `RESOLVED`. `CANCELLED` tickets cannot be reopened.
- **BR-23 - Advisory Requester Resolution:** A Requester's "Problem Appears Resolved" indication remains purely advisory (`requesterResolutionIndicatedAt != null`) and does not bypass or satisfy the resolution gate, nor does it alter `Ticket.currentStatus`.
- **BR-24 - Legacy Ticket Preservation:** Pre-existing resolved or closed tickets from Labs 1–3 lacking Actions Taken remain valid, closed, and readable. The resolution gate is evaluated exclusively when executing an active transition moving into `RESOLVED`.

### Concurrency Control & Serialization

- **BR-25 - Parent-Ticket Exclusive Row Lock:** Any backend transaction that creates, edits, completes, or cancels an Action Taken, or updates Ticket status, MUST begin by locking the parent Ticket row: `SELECT id, "currentStatus", "ownerId", "updatedAt" FROM "Ticket" WHERE id = $1 FOR UPDATE`. This serializes all concurrent operations targeting the same ticket.
- **BR-26 - Elimination of Phantoms in Gate Evaluation:** Because the parent ticket is exclusively locked, a concurrent request cannot add a `PENDING` Action Taken while another transaction is evaluating the resolution gate and marking the ticket `RESOLVED`.
- **BR-27 - Optimistic Stale-Update Rejection:**
  - Ticket status updates require `expectedUpdatedAt` matching `Ticket.updatedAt`. Mismatches return HTTP 409 `TICKET_VERSION_CONFLICT`.
  - Action edits require `version` matching `ActionTaken.version`. Mismatches return HTTP 409 `ACTION_VERSION_CONFLICT`.
  - Terminal Action edits: Any attempt to edit or change status of an action that is already `COMPLETED` or `CANCELLED` returns HTTP 422 with code `ACTION_TERMINAL_IMMUTABLE`.

### Dashboard Calculations, Scoping & Exact Drill-Downs

- **BR-28 - Authoritative Backend Calculations:** Dashboard metrics are computed directly by PostgreSQL aggregate queries (`COUNT`), never calculated by client-side filtering.
- **BR-29 - Timezone & Date Boundaries:**
  - "Completed Today" evaluates strictly within UTC calendar boundaries:
    `ActionTaken.status = 'COMPLETED' AND ActionTaken.completedById = currentUser.id AND completedAt >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AND completedAt < DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day'`.
  - The UI displays an explicit "(UTC)" indicator with a tooltip showing the user's localized date equivalent.
- **BR-30 - Staff Dashboard Metrics & Drill-Down Mapping:**

| Metric Card | Counted Entity | Exact Calculation Predicate | Drill-Down Destination URL | Destination Predicate | Notes on Entity Match & Label |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Open Tickets** | Tickets | `currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/staff/tickets?statusGroup=active` | `currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | 1:1 Ticket count match. |
| **Unassigned Queue** | Tickets | `ownerId IS NULL AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/staff/tickets?owner=unassigned&statusGroup=active` | `ownerId IS NULL AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | 1:1 Ticket count match. Excludes cancelled unassigned tickets. |
| **Pending Actions** | Actions Taken | `ActionTaken.status = 'PENDING' AND ActionTaken.assigneeId = currentUser.id AND Ticket.currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active` | Active tickets containing $\ge 1$ pending action assigned to current user | **Entity Distinction:** Card counts discrete *Actions* ($N$ actions); destination lists *Tickets* containing them ($M \le N$). Destination link labeled: **"View tickets containing these actions"**. Neither count nor queue includes cancelled tickets retaining frozen pending actions. |
| **Completed Today** | Actions Taken | `ActionTaken.status = 'COMPLETED' AND ActionTaken.completedById = currentUser.id AND completedAt >= DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')` | `/staff/tickets?completedBy=me&completedDate=today` | Tickets containing actions completed by current user today (UTC) | **Entity Distinction:** Card counts discrete *Actions* completed by current user today. "Completed by" means `ActionTaken.completedById`. Destination link labeled: **"View tickets containing these actions"**. The dashboard's "Recent Action Activity" list is an in-context preview of the latest 10 items, not the complete result set. |

- **BR-31 - Requester Dashboard Metrics & Drill-Down Mapping:**

| Metric Card | Counted Entity | Exact Calculation Predicate | Drill-Down Destination URL | Destination Predicate | Notes on Entity Match |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Active Tickets** | Tickets | `requesterId = currentUser.id AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | `/tickets?statusGroup=active` | `requesterId = currentUser.id AND currentStatus IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')` | 1:1 Ticket count match. |
| **Awaiting Input** | Tickets | `requesterId = currentUser.id AND currentStatus = 'WAITING_FOR_REQUESTER'` | `/tickets?status=WAITING_FOR_REQUESTER` | `requesterId = currentUser.id AND currentStatus = 'WAITING_FOR_REQUESTER'` | 1:1 Ticket count match. Hydrates status filter dropdown. |
| **Resolved & Closed**| Tickets | `requesterId = currentUser.id AND currentStatus IN ('RESOLVED','CLOSED')` | `/tickets?statusGroup=resolved_closed` | `requesterId = currentUser.id AND currentStatus IN ('RESOLVED','CLOSED')` | 1:1 Ticket count match. Covers both resolved and closed. |

- **BR-32 - Requester Activity Feed Privacy:**
  - Recent activity feed displays ONLY public ticket updates (status transitions, public comments, and public action descriptions/results).
  - Internal Notes, audit history logs, and technical staff identifiers are strictly filtered out at the SQL/service layer.
- **BR-33 - Safe 404 for Missing and Cross-Requester Tickets:** When a Requester requests `/api/tickets/:id/actions`, if the ticket does not exist OR `Ticket.requesterId !== currentUser.id`, the server returns HTTP 404 with code `TICKET_NOT_FOUND`, preventing resource-existence leakage.

---

## 6. Authorization Matrix

| Operation / Endpoint | Requester | IT Staff | Administrator | Unauthenticated | Must Change Password |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **GET** `/api/tickets/:id/actions` | Owned Only (Safe 404) | Yes (All) | Yes (All) | 401 Unauthorized | 403 Forbidden |
| **POST** `/api/tickets/:id/actions` | 403 Forbidden | Yes (Active) | Yes (Active) | 401 Unauthorized | 403 Forbidden |
| **PATCH** `/api/actions/:id` | 403 Forbidden | Yes (Active) | Yes (Active) | 401 Unauthorized | 403 Forbidden |
| **PATCH** `/api/actions/:id/status` | 403 Forbidden | Yes (Active) | Yes (Active) | 401 Unauthorized | 403 Forbidden |
| **GET** `/api/actions/:id/history` | 403 Forbidden | Yes (All) | Yes (All) | 401 Unauthorized | 403 Forbidden |
| **PATCH** `/api/staff/tickets/:id/status` | 403 Forbidden | Yes (Gate Enforced)| Yes (Gate Enforced)| 401 Unauthorized | 403 Forbidden |
| **GET** `/api/staff/dashboard` | 403 Forbidden | Yes | Yes | 401 Unauthorized | 403 Forbidden |
| **GET** `/api/requester/dashboard` | Yes (Owned Only) | 403 Forbidden* | 403 Forbidden* | 401 Unauthorized | 403 Forbidden |
| **GET** `/api/tickets` (My Tickets) | Yes (Owned Only) | 403 Forbidden* | 403 Forbidden* | 401 Unauthorized | 403 Forbidden |
| **GET** `/api/staff/tickets` (Staff Queue) | 403 Forbidden | Yes | Yes | 401 Unauthorized | 403 Forbidden |

*\*Note: In accordance with Lab 3 role-boundary design, IT Staff and Administrators operate in staff workflows; Requester personal endpoints are reserved for the `REQUESTER` role.*

---

## 7. Status Transition Matrices

### 7.1 Ticket Status Transition Matrix (Preserved from `server/src/ticket-workflow.ts`)

| From `currentStatus` \ To Status | NEW | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER | RESOLVED | CLOSED | REOPENED | CANCELLED |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **NEW** | 409 | Allowed | Allowed | 409 | 409 | 409 | 409 | Allowed |
| **OPEN** | 409 | 409 | Allowed | Allowed | Gate Enforced | 409 | 409 | Allowed |
| **IN_PROGRESS** | 409 | 409 | 409 | Allowed | Gate Enforced | 409 | 409 | Allowed |
| **WAITING_FOR_REQUESTER**| 409 | 409 | Allowed | 409 | Gate Enforced | 409 | 409 | Allowed |
| **RESOLVED** (Terminal) | 409 | 409 | 409 | 409 | 409 | Allowed | Allowed | 409 |
| **CLOSED** (Terminal) | 409 | 409 | 409 | 409 | 409 | 409 | Allowed | 409 |
| **REOPENED** | 409 | 409 | Allowed | Allowed | Gate Enforced | 409 | 409 | Allowed |
| **CANCELLED** (Terminal)| 409 | 409 | 409 | 409 | 409 | 409 | 409 | 409 |

*Resolution Gate Enforcement Rule:* Transitions to `RESOLVED` require:
1. `Ticket.ownerId != null`
2. `count(ActionTaken WHERE status = 'COMPLETED' AND length(trim(result)) >= 3) >= 1`
3. `count(ActionTaken WHERE status = 'PENDING') == 0`

### 7.2 Action Taken Status Transition Matrix

| From Action Status \ To Status | PENDING | COMPLETED | CANCELLED |
| :--- | :---: | :---: | :---: |
| **PENDING** | — | Allowed (requires non-empty `result`) | Allowed (requires non-empty `cancellationReason`) |
| **COMPLETED** (Terminal) | 422 `ACTION_TERMINAL_IMMUTABLE` | — | 422 `ACTION_TERMINAL_IMMUTABLE` |
| **CANCELLED** (Terminal) | 422 `ACTION_TERMINAL_IMMUTABLE` | 422 `ACTION_TERMINAL_IMMUTABLE` | — |

---

## 8. Data Changes & Justified Database Decisions

### 8.1 Prisma Schema Extension

```prisma
enum ActionStatus {
  PENDING
  COMPLETED
  CANCELLED
}

enum ActionHistoryEvent {
  CREATED
  UPDATED
  ASSIGNED
  COMPLETED
  CANCELLED
}

model ActionTaken {
  id                  Int                  @id @default(autoincrement())
  ticketId            Int
  idempotencyKey      String?
  creationFingerprint String?
  creationResponse    Json?
  description         String
  result              String?
  status              ActionStatus         @default(PENDING)
  assigneeId          Int?
  createdById         Int
  completedById       Int?
  followUpRequired    Boolean              @default(false)
  followUpNote        String?
  attachmentNotes     String?
  cancellationReason  String?
  version             Int                  @default(1)
  completedAt         DateTime?
  cancelledAt         DateTime?
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  ticket              Ticket               @relation(fields: [ticketId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  assignee            User?                @relation("ActionAssignee", fields: [assigneeId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  createdBy           User                 @relation("ActionCreator", fields: [createdById], references: [id], onDelete: Restrict, onUpdate: Cascade)
  completedBy         User?                @relation("ActionCompleter", fields: [completedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  history             ActionTakenHistory[]

  @@unique([ticketId, idempotencyKey])
  @@index([ticketId, status])
  @@index([assigneeId, status])
  @@index([completedById, status, completedAt])
  @@index([createdById])
  @@index([createdAt])
}

model ActionTakenHistory {
  id        Int             @id @default(autoincrement())
  actionId  Int
  ticketId  Int
  actorId   Int
  eventType ActionEventType
  version   Int
  snapshot  Json
  createdAt DateTime        @default(now())

  action    ActionTaken     @relation(fields: [actionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  ticket    Ticket          @relation(fields: [ticketId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  actor     User            @relation("ActionHistoryActor", fields: [actorId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([actionId, createdAt])
  @@index([ticketId, createdAt])
  @@index([actorId, createdAt])
}
```

The `snapshot` column stores a canonical JSON object detailing field-level diffs and version transitions:

```json
{
  "changes": {
    "description": { "before": "Initial description", "after": "Updated description" },
    "result": { "before": null, "after": "Completed result text" },
    "status": { "before": "PENDING", "after": "COMPLETED" },
    "assignee": { "beforeId": 2, "afterId": 3 },
    "followUpRequired": { "before": false, "after": true },
    "followUpNote": { "before": null, "after": "Verify with user." },
    "attachmentNotes": { "before": null, "after": "diag.log" },
    "completedBy": { "beforeId": null, "afterId": 3 },
    "cancellationReason": { "before": null, "after": "Duplicate item." }
  },
  "versionBefore": 1,
  "versionAfter": 2
}
```

### 8.2 Database-Enforced Immutability Trigger

```sql
CREATE OR REPLACE FUNCTION fn_prevent_action_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionTakenHistory records are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_action_history_append_only
BEFORE UPDATE OR DELETE ON "ActionTakenHistory"
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_action_history_mutation();
```

### 8.3 Forward Migration & Recovery Rehearsal Strategy

1. **Pre-Migration Snapshot:**
   Prior to applying the Lab 4 migration, take a safeguard logical snapshot of the pre-migration database:
   `pg_dump --format=custom --file=backup_lab3_pre_migration.dump "$DATABASE_URL"`
2. **Forward Migration Execution:**
   - Execute SQL migration adding `ActionStatus` and `ActionHistoryEvent` enums.
   - Create tables `ActionTaken` and `ActionTakenHistory` with integer foreign keys, unique constraints, and indexes.
   - Install `trg_action_history_append_only` trigger.
   - All existing tables remain unmodified.
3. **Disaster Recovery Rehearsal Procedure (Disposable Test Database):**
   - **Post-Migration Archive:** After seeding Lab 4 actions and history, take snapshot:
     `pg_dump --format=custom --file=artifacts/lab-04/recovery/toktickit_lab4_snapshot.dump "$SOURCE_DB_URL"`
   - **Restoration Target:** Restore strictly into a separate, disposable database (e.g. `toktickit_recovery_test`). Never restore into the development or staging database!
     `pg_restore --clean --if-exists --dbname="$TARGET_RECOVERY_DB_URL" artifacts/lab-04/recovery/toktickit_lab4_snapshot.dump`
   - **Verification Invariants:**
     - Row count parity across `User`, `Ticket`, `Attachment`, `PublicComment`, `InternalNote`, `ActionTaken`, and `ActionTakenHistory`.
     - Relational integrity: Foreign keys remain valid and match source IDs.
     - Attachment check caveat: Recovery verification asserts database metadata preservation for Attachment records (file-content recovery from physical storage or S3 is an external storage process).
     - Sequence integrity: Autoincrement sequence state (including `last_value` and `is_called` where applicable) is preserved from the source database, and subsequent allocation remains collision-free without requiring sequence values to artificially equal `max(id)`.
     - History immutability: Re-verify that trigger `trg_action_history_append_only` blocks raw `UPDATE` and `DELETE` in the restored database.

### 8.4 Idempotent Seed Data Requirements
The seed script (`server/prisma/seed.ts`) must run idempotently using upserts:
- Ticket with 0 Actions: To verify resolution gate rejection and empty states.
- Ticket with 1 `PENDING` Action: Assigned to IT Staff, testing completion and cancellation flows.
- Ticket with 1 `COMPLETED` Action (valid result): Ready for resolution gate testing.
- Ticket with Mixed Actions (1 `COMPLETED`, 1 `PENDING`): Proving gate rejection until all actions are finalized.
- Ticket with `CANCELLED` Action: Demonstrating cancellation reason and history audit trail.
- Action completed by User B on ticket assigned to User A: Testing decoupled completion attribution.
- Cancelled ticket retaining frozen pending action: Verifying that neither the Pending Actions metric nor the drill-down includes it.
- Dashboard Distribution: Generating realistic counts for open tickets, pending actions, completed actions today (UTC boundary), and unassigned queue.

---

## 9. API Contract Summary

*(Full request/response schemas, error codes, and field definitions are detailed in `docs/lab-04/api-spec.md`)*

| Method | Endpoint Path | Description | Authorization | Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/tickets/:id/actions` | List all Actions Taken for ticket | Requester (owned; safe 404), Staff, Admin | `TICKET_NOT_FOUND` |
| `POST` | `/api/tickets/:id/actions` | Create new Action Taken | Staff, Admin | `TICKET_TERMINAL_IMMUTABLE`, `INVALID_ACTION_ASSIGNEE`, `FOLLOW_UP_NOTE_REQUIRED`, `IDEMPOTENCY_CONFLICT` |
| `PATCH` | `/api/actions/:id` | Update Action Taken fields | Staff, Admin | `ACTION_TERMINAL_IMMUTABLE`, `TICKET_TERMINAL_IMMUTABLE`, `ACTION_VERSION_CONFLICT` |
| `PATCH` | `/api/actions/:id/status` | Complete or Cancel Action Taken | Staff, Admin | `ACTION_RESULT_REQUIRED`, `CANCELLATION_REASON_REQUIRED`, `ACTION_TERMINAL_IMMUTABLE`, `ACTION_VERSION_CONFLICT` |
| `GET` | `/api/actions/:id/history` | Retrieve complete audit trail for Action | Staff, Admin | `ACTION_NOT_FOUND` |
| `PATCH` | `/api/staff/tickets/:id/status` | Update Ticket status (Resolution Gate enforced) | Staff, Admin | `INVALID_STATUS_TRANSITION`, `TICKET_VERSION_CONFLICT`, `RESOLUTION_GATE_NO_OWNER`, `RESOLUTION_GATE_NO_COMPLETED_ACTION`, `RESOLUTION_GATE_PENDING_ACTIONS` |
| `GET` | `/api/staff/dashboard` | Retrieve Staff operational metrics and queues | Staff, Admin | — |
| `GET` | `/api/requester/dashboard` | Retrieve Requester personal dashboard summary | Requester | — |

---

## 10. Acceptance Criteria

### Actions Taken Lifecycle & Validation
- **AC-01 (Create Action Taken):** Given an authenticated IT Staff member and an active ticket, when submitting a valid description, optional assignee, follow-up flags, and attachment notes, then the Action Taken is created with status `PENDING`, the creator is recorded, an initial `CREATED` history record is inserted atomically, and HTTP 201 is returned.
- **AC-02 (Reject Inactive Assignee):** Given an authenticated IT Staff member creating or updating an action, when specifying an `assigneeId` belonging to an inactive user or a user with role `REQUESTER`, then the request is rejected with HTTP 422 and code `INVALID_ACTION_ASSIGNEE`, and the database remains unchanged.
- **AC-03 (Complete Action Taken & Attribution):** Given an action in `PENDING` status, when an IT Staff member submits status `COMPLETED` with a non-empty `result`, then the action status updates to `COMPLETED`, `completedAt` is recorded, `completedById` is recorded as the authenticated actor (independent of `assigneeId`), a `COMPLETED` history record is logged, and HTTP 200 is returned.
- **AC-04 (Reject Completion Without Result):** Given an action in `PENDING` status, when submitting status `COMPLETED` with an empty or whitespace-only `result`, then the request is rejected with HTTP 422 and code `ACTION_RESULT_REQUIRED`, and status remains `PENDING`.
- **AC-05 (Cancel Action Taken):** Given an action in `PENDING` status, when an IT Staff member submits status `CANCELLED` with a non-empty `cancellationReason`, then the action status updates to `CANCELLED`, `cancelledAt` is recorded, a `CANCELLED` history record is logged, and HTTP 200 is returned.
- **AC-06 (Reject Cancellation Without Reason):** Given an action in `PENDING` status, when submitting status `CANCELLED` without a `cancellationReason`, then HTTP 422 is returned with code `CANCELLATION_REASON_REQUIRED`, and status remains `PENDING`.
- **AC-07 (Reject Editing Terminal Actions):** Given an action in `COMPLETED` or `CANCELLED` status, when attempting to edit its fields or change its status, then HTTP 422 is returned with code `ACTION_TERMINAL_IMMUTABLE`.
- **AC-08 (Reject Actions on Terminal Tickets):** Given a ticket with `currentStatus` in `RESOLVED`, `CLOSED`, or `CANCELLED`, when attempting to create or edit an Action Taken, then the request is rejected with HTTP 422 and code `TICKET_TERMINAL_IMMUTABLE`.
- **AC-09 (Requester Visibility & Safe 404):** Given an authenticated Requester viewing an owned ticket, all actions (`PENDING`, `COMPLETED`, `CANCELLED`) are returned in read-only format; when requesting a ticket owned by another user or a non-existent ticket, an identical safe HTTP 404 is returned; when attempting any POST/PATCH action endpoint, HTTP 403 Forbidden is returned.
- **AC-10 (Durable Idempotent Retries):** Given a client submitting an Action creation request with an `idempotencyKey`, when a retry is sent with the identical key and canonical payload, the existing Action Taken is returned with HTTP 200 without creating duplicate records or history entries. Replay succeeds even if the ticket is now terminal or the assignee inactive. If the payload differs, HTTP 409 `IDEMPOTENCY_CONFLICT` is returned.

### Ticket Resolution Gate & Concurrency Serialization
- **AC-11 (Resolution Gate - Success):** Given a ticket with an assigned owner, at least one `COMPLETED` action with a valid `result`, and zero `PENDING` actions, when IT Staff updates `currentStatus` to `RESOLVED` with matching `expectedUpdatedAt`, the transition succeeds with HTTP 200, returns `previousStatus`, and clears resolution indications.
- **AC-12 (Resolution Gate - Missing Owner):** Given a ticket with valid completed actions but no assigned owner (`ownerId == null`), when attempting to set status to `RESOLVED`, the server returns HTTP 422 with code `RESOLUTION_GATE_NO_OWNER`.
- **AC-13 (Resolution Gate - No Completed Actions):** Given a ticket with an assigned owner but zero `COMPLETED` actions, when attempting to set status to `RESOLVED`, the server returns HTTP 422 with code `RESOLUTION_GATE_NO_COMPLETED_ACTION`.
- **AC-14 (Resolution Gate - Pending Actions Remain):** Given a ticket with an assigned owner and one `COMPLETED` action, but also one `PENDING` action, when attempting to set status to `RESOLVED`, the server returns HTTP 422 with code `RESOLUTION_GATE_PENDING_ACTIONS`.
- **AC-15 (Parent Row Lock Concurrency Serialization):** Given two simultaneous requests targeting the same ticket (one attempting to resolve the ticket and one attempting to create a `PENDING` action), the parent row lock serializes the execution so that the ticket is either resolved first (causing the action creation to fail due to terminal ticket rule) or the action is created first (causing ticket resolution to fail due to pending actions rule). In no circumstance is a `RESOLVED` ticket left with a `PENDING` action.
- **AC-16 (Stale Update Detection):** Given a ticket status update submitting a stale `expectedUpdatedAt`, or an action edit submitting a stale `version`, the request is rejected with HTTP 409 (`TICKET_VERSION_CONFLICT` or `ACTION_VERSION_CONFLICT`).

### Dashboards & Navigation
- **AC-17 (Staff Dashboard Operational Metrics):** Given an authenticated IT Staff member, accessing `/api/staff/dashboard` returns accurate authoritative counts for `openTicketsCount` (team), `pendingActionsCount` (current user on active tickets), `completedActionsTodayCount` (actions completed by current user since UTC midnight), and `unassignedTicketsCount` (team).
- **AC-18 (Staff Dashboard Drill-Down):** Given the Staff Dashboard UI:
  - Clicking "Open Tickets" navigates to `/staff/tickets?statusGroup=active`.
  - Clicking "Unassigned Queue" navigates to `/staff/tickets?owner=unassigned&statusGroup=active`.
  - Clicking "Pending Actions" navigates to `/staff/tickets?actionAssignee=me&actionStatus=PENDING&statusGroup=active`, displaying tickets containing user's pending actions (excluding cancelled tickets).
  - Clicking "Completed Today" navigates to `/staff/tickets?completedBy=me&completedDate=today`, displaying tickets containing actions completed by the user today (UTC).
- **AC-19 (Requester Dashboard Scoping & Privacy):** Given an authenticated Requester, accessing `/api/requester/dashboard` returns counts and recent activity scoped strictly to tickets where `requesterId == currentUser.id`, and recent activity strictly excludes internal notes, audit history, and staff-only identifiers.
- **AC-20 (Requester Dashboard Drill-Down):** Given the Requester Dashboard UI, clicking "Active Tickets" navigates to `/tickets?statusGroup=active`, clicking "Awaiting Input" navigates to `/tickets?status=WAITING_FOR_REQUESTER`, and clicking "Resolved & Closed" navigates to `/tickets?statusGroup=resolved_closed`. Filters properly hydrate the UI and support browser Back/Forward navigation.
- **AC-21 (Role Boundary Enforcement):** Given a Requester attempting to access `/api/staff/dashboard` or `/staff/tickets`, HTTP 403 Forbidden is returned.

### Regression, Accessibility & Polish
- **AC-22 (Lab 1–3 Regression):** All pre-existing flows (ticket creation, categories, attachments, public comments, internal notes, user management, and session authentication) execute without regression.
- **AC-23 (Accessibility & Reflow):** All Lab 4 screens achieve 0 axe-core automated violations, meet 4.5:1 text contrast, support 100% keyboard navigation with visible focus rings and focus trapping in modals, and remain fully operable at 400% zoom (320px equivalent) without clipped content or horizontal page scroll.

---

## 11. Product Definition of Done

A user story or work package is considered complete when:
1. **Contract Adherence:** Implementation matches all specifications, schemas, status codes, and error envelopes in `specification.md`, `api-spec.md`, and `ui-spec.md`.
2. **Automated Test Coverage:**
   - Unit and integration tests verify every business rule, transition matrix constraint, and validation boundary.
   - Concurrency tests demonstrate parent-ticket row locking under simulated race conditions.
   - E2E tests in an isolated schema verify complete user journeys for Staff, Requesters, and Admins.
   - Axe-core accessibility tests pass with zero violations on all views.
3. **Zero Regression:** All existing test suites from Labs 1, 2, and 3 pass in full without workarounds or disabled tests.
4. **Clean Code & Build:** Client and server build cleanly with zero TypeScript errors, lint warnings, or console errors.
5. **No Visual Defects:** Responsive layouts verified across breakpoints with zero horizontal overflow, no clipped text at 400% zoom, and proper Zen Green styling.

## 12. Course Delivery & Submission Requirements

In accordance with Section 14 of the Lab 4 handout, course delivery requires:
1. Four sequential GitHub Issues tracking Kanban progression (`Backlog` $\rightarrow$ `Specified` $\rightarrow$ `Started` $\rightarrow$ `PR Review` $\rightarrow$ `Fixing` $\rightarrow$ `Done`).
2. Feature branches merged into `lab4-staging` via peer-reviewed Pull Requests, followed by a final release PR from `lab4-staging` into `main`.
3. Complete documentation in `docs/lab-04/` (`specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md`, `reviewer.md`, `ai-use.md`).
4. Full screenshot evidence captured under `artifacts/lab-04/screenshots/`.
5. Exactly one consolidated PDF report structured using headings `Answer Part 1` through `Answer Part 9`.

---

## 13. Requirement Provenance & Design Decisions

| Specification Item | Provenance | Type | Description / Rationale |
| :--- | :--- | :--- | :--- |
| **Actions Taken Basic Fields** | Handout (p. 2) | Explicit Requirement | Description, result, performer, follow-up flag/note, attachment notes. |
| **Action Status Set** (`PENDING`, `COMPLETED`, `CANCELLED`) | Stakeholder Consensus | Proposed Design Decision | Bridges basic fields and grading criteria for assignment, completion, and cancellation. |
| **Resolution Gate Formula** | Stakeholder Consensus | Proposed Design Decision | Mandates owner assigned, $\ge 1$ `COMPLETED` action with non-empty `result`, and 0 `PENDING` actions. |
| **Decoupled Completion Attribution (`completedById`)** | Technical Specification | Architecture Decision | Records actual completion actor on `ActionTaken` and in history, allowing any staff member to complete tasks. |
| **Parent-Ticket Row Locking Concurrency** | Technical Specification | Architecture Decision | Uses PostgreSQL `FOR UPDATE` on parent ticket to prevent race conditions during resolution. |
| **Append-Only History Model (`ActionTakenHistory`)** | Technical Specification | Architecture Decision | Reconciles editable actions with immutable audit requirements via a dedicated historical log table. |
| **Database-Enforced Immutability Trigger** | Technical Specification | Architecture Decision | PostgreSQL trigger rejecting direct `UPDATE` or `DELETE` on `ActionTakenHistory`. |
| **Idempotency Key & Canonical Fingerprint** | Technical Specification | Architecture Decision | Durable retry handling for action creation with payload normalization, comparing against stored creation fingerprint. |
| **Terminal Ticket Freezing & Reopen Rule** | Handout & Baseline | Business Rule | Freezes action mutations on `RESOLVED`, `CLOSED`, and `CANCELLED` tickets; reopening permitted only for `RESOLVED` and `CLOSED`. |
| **Legacy Ticket Preservation** | Handout (p. 4) | Explicit Requirement | Preserves all earlier data; resolution gate applies solely to active transitions moving to `RESOLVED`. |
| **Staff & Requester Dashboards & Drill-Downs** | Handout (p. 5–6) | Explicit Requirement | Dedicated operational and requester summaries with metric cards and queue drill-down navigation reproducing counted sets. |
| **Status Update Endpoint Extension** | Technical Specification | Architecture Decision | Extends existing `PATCH /api/staff/tickets/:id/status` preserving `expectedUpdatedAt`, `previousStatus`, and existing envelopes. |
