# Lab 4 REST API Specification: Actions Taken, Ticket Workflow, and Role Dashboards

## 1. Purpose and Conventions

This document specifies the REST API contract for Lab 4 of TokTickIT. It extends the established Lab 3 API conventions, defining all new and updated endpoints, request/response JSON schemas, authentication and CSRF headers, standard error envelopes, parent-ticket concurrency control, durable idempotency replay semantics, and role authorization rules.

### 1.1 Protocol and Security Conventions

- **Base URL:** `/api`
- **Transport Security & Sessions:** Authenticated endpoints require a valid session cookie (`toktickit_session`) established via `/api/auth/login`. Unauthenticated requests return `401 Unauthorized` with code `AUTHENTICATION_REQUIRED`.
- **Mandatory Password Change:** Users with `mustChangePassword = true` are blocked from accessing operational endpoints, returning `403 Forbidden` with code `PASSWORD_CHANGE_REQUIRED`.
- **CSRF Protection:** State-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) require the `X-CSRF-Token` header containing the active CSRF token matching the session. Mismatches or missing tokens return `403 Forbidden` with code `CSRF_INVALID` (matching `server/src/auth.ts`).
- **Content Type:** All request and response bodies use `Content-Type: application/json; charset=utf-8`.
- **Standard Response Envelopes:**
  - Success responses wrap data inside a top-level `data` property:
    ```json
    {
      "data": { ... }
    }
    ```
  - Paginated queue responses use top-level `data`, `pagination`, and `query` properties (matching `StaffQueueResponse` in `client/src/api.ts`):
    ```json
    {
      "data": [ ... ],
      "pagination": { "page": 1, "pageSize": 20, "totalItems": 42, "totalPages": 3, "hasPreviousPage": false, "hasNextPage": true },
      "query": { ... }
    }
    ```
  - Error responses strictly use the existing TokTickIT error envelope:
    ```json
    {
      "error": {
        "code": "RESOLUTION_GATE_PENDING_ACTIONS",
        "message": "Ticket cannot be resolved while 1 pending action remains.",
        "fields": [],
        "retryable": false
      }
    }
    ```

---

## 2. Shared Representations & Data Types

### 2.1 Action Taken Representation

```typescript
interface ActionTakenDto {
  id: number;
  ticketId: number;
  idempotencyKey: string | null;
  description: string;
  result: string | null;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  assignee: {
    id: number;
    name: string;
    email: string;
    role: "IT_STAFF" | "ADMINISTRATOR";
  } | null;
  createdBy: {
    id: number;
    name: string;
    email: string;
    role: "IT_STAFF" | "ADMINISTRATOR";
  };
  completedBy: {
    id: number;
    name: string;
    email: string;
    role: "IT_STAFF" | "ADMINISTRATOR";
  } | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  cancellationReason: string | null;
  version: number;
  completedAt: string | null; // ISO 8601
  cancelledAt: string | null; // ISO 8601
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
}
```

### 2.2 Action Taken History Representation

```typescript
interface ActionTakenHistoryDto {
  id: number;
  actionTakenId: number;
  ticketId: number;
  eventType: "CREATED" | "UPDATED" | "ASSIGNED" | "COMPLETED" | "CANCELLED";
  actor: {
    id: number;
    name: string;
    email: string;
    role: "IT_STAFF" | "ADMINISTRATOR";
  };
  changes: {
    description?: { before: string | null; after: string | null };
    result?: { before: string | null; after: string | null };
    status?: { before: string | null; after: string | null };
    assignee?: { beforeId: number | null; afterId: number | null };
    completedBy?: { beforeId: number | null; afterId: number | null };
    followUpRequired?: { before: boolean | null; after: boolean | null };
    followUpNote?: { before: string | null; after: string | null };
    attachmentNotes?: { before: string | null; after: string | null };
    cancellationReason?: { before: string | null; after: string | null };
  };
  versionBefore: number | null;
  versionAfter: number;
  createdAt: string; // ISO 8601
}
```

---

## 3. Actions Taken API Endpoints

### 3.1 List Actions Taken for a Ticket

- **Endpoint:** `GET /api/tickets/:id/actions`
- **Description:** Returns all Actions Taken associated with the specified ticket, ordered by `createdAt ASC, id ASC`.
- **Authorization:**
  - `REQUESTER`: Permitted only if `Ticket.requesterId == currentUser.id`. If ticket does not exist OR belongs to another requester, returns an identical safe HTTP 404 response.
  - `IT_STAFF`, `ADMINISTRATOR`: Permitted on any existing ticket.
- **Path Parameters:**
  - `id` (integer): Positive integer Ticket ID.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "data": {
        "ticketId": 42,
        "total": 2,
        "items": [
          {
            "id": 1,
            "ticketId": 42,
            "description": "Replaced faulty RAM stick in slot 2 and ran memtest86.",
            "result": "Passes 4 passes of memtest86 with 0 errors.",
            "status": "COMPLETED",
            "assignee": {
              "id": 3,
              "name": "Jane IT",
              "email": "jane.it@toktickit.local",
              "role": "IT_STAFF"
            },
            "createdBy": {
              "id": 3,
              "name": "Jane IT",
              "email": "jane.it@toktickit.local",
              "role": "IT_STAFF"
            },
            "completedBy": {
              "id": 4,
              "name": "Bob Staff",
              "email": "bob.staff@toktickit.local",
              "role": "IT_STAFF"
            },
            "followUpRequired": true,
            "followUpNote": "Check system stability again in 48 hours.",
            "attachmentNotes": "memtest-results.txt",
            "cancellationReason": null,
            "version": 2,
            "completedAt": "2026-10-27T14:30:00.000Z",
            "cancelledAt": null,
            "createdAt": "2026-10-27T10:00:00.000Z",
            "updatedAt": "2026-10-27T14:30:00.000Z"
          }
        ]
      }
    }
    ```
  - `401 Unauthorized`: Session missing or expired (`AUTHENTICATION_REQUIRED`).
  - `403 Forbidden`: Mandatory password change required (`PASSWORD_CHANGE_REQUIRED`).
  - `404 Not Found`: Ticket does not exist OR ticket owned by another requester (`TICKET_NOT_FOUND`).

---

### 3.2 Create Action Taken & Durable Idempotency

- **Endpoint:** `POST /api/tickets/:id/actions`
- **Description:** Creates a new Action Taken on an active ticket. Atomically acquires an exclusive write lock on the parent ticket row, validates active ticket status, inserts the `ActionTaken` record, and inserts the initial `CREATED` record in `ActionTakenHistory`.
- **Authorization:** `IT_STAFF`, `ADMINISTRATOR`.
- **Headers:** `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "description": "Inspected network switch uplink port and replaced patch cable.",
    "assigneeId": 4,
    "followUpRequired": false,
    "followUpNote": null,
    "attachmentNotes": "Refer to switch port status screenshot.",
    "idempotencyKey": "a9e6d0a7-24a9-4672-87c1-014c51486f91"
  }
  ```
- **Canonical Payload Normalization:**
  1. Trim leading and trailing whitespace from string fields (`description`, `followUpNote`, `attachmentNotes`).
  2. Treat empty or whitespace-only `followUpNote` and `attachmentNotes` as `null`.
  3. Default `followUpRequired` to `false` if omitted.
  4. Default `assigneeId` to `null` if omitted.
  5. The canonical fingerprint is computed as the SHA-256 hex digest of the canonical JSON string:
     `{"assigneeId":<int|null>,"attachmentNotes":<str|null>,"description":<str>,"followUpNote":<str|null>,"followUpRequired":<bool>}`.
- **Execution & Evaluation Order:**
  1. Authenticate user, check mandatory password change, verify CSRF (`CSRF_INVALID`).
  2. Authorize role (`IT_STAFF`, `ADMINISTRATOR`).
  3. Validate schema types and string boundaries; compute `incomingFingerprint`.
  4. Open transaction and acquire parent row lock: `SELECT id, "currentStatus", "ownerId", "updatedAt" FROM "Ticket" WHERE id = $1 FOR UPDATE`.
  5. **Evaluate Idempotency Key BEFORE Mutable Creation Gates:**
     - If `idempotencyKey` was supplied, query `ActionTaken` by `(ticketId, idempotencyKey)`.
     - **If Match Found:**
       - Compare `creationFingerprint === incomingFingerprint`.
       - If matching $\rightarrow$ Replay success: return HTTP 200 with stored `creationResponse`. **This replay succeeds even if the parent Ticket has since moved to RESOLVED, CLOSED, or CANCELLED, and even if the assigned staff member is now inactive.**
       - If mismatch $\rightarrow$ Payload conflict: return HTTP 409 with code `IDEMPOTENCY_CONFLICT`.
     - **If No Match Found:**
       - Now enforce mutable creation gates: verify `Ticket.currentStatus` is not terminal (`RESOLVED`, `CLOSED`, `CANCELLED`); verify `assigneeId` is an active staff/admin user; verify `followUpNote` is present if `followUpRequired = true`.
       - Insert `ActionTaken` storing `idempotencyKey`, `creationFingerprint`, and response DTO (`completedById` is `null` initially).
       - Insert initial `CREATED` record into `ActionTakenHistory`.
       - Commit transaction and return HTTP 201 with created DTO.
- **Responses:**
  - `201 Created`: Returns `{ "data": ActionTakenDto }`.
  - `200 OK`: Idempotent replay returning `{ "data": ActionTakenDto }`.
  - `400 Bad Request`: Schema validation error (`VALIDATION_ERROR`).
  - `401 Unauthorized`: Session invalid (`AUTHENTICATION_REQUIRED`).
  - `403 Forbidden`: Role not authorized or CSRF invalid (`CSRF_INVALID`).
  - `404 Not Found`: Ticket not found (`TICKET_NOT_FOUND`).
  - `409 Conflict`: Conflicting idempotency payload (`IDEMPOTENCY_CONFLICT`).
  - `422 Unprocessable Entity`:
    - Assignee is inactive or has role `REQUESTER` (`INVALID_ACTION_ASSIGNEE`).
    - Parent ticket is terminal (`TICKET_TERMINAL_IMMUTABLE`).
    - `followUpRequired` is true but `followUpNote` is missing (`FOLLOW_UP_NOTE_REQUIRED`).

---

### 3.3 Edit Action Taken

- **Endpoint:** `PATCH /api/actions/:id`
- **Description:** Updates non-status fields of an existing Action Taken. Acquires parent ticket exclusive lock, performs a stale-update version check, updates `ActionTaken`, and appends an `UPDATED` (or `ASSIGNED`) record to `ActionTakenHistory`.
- **Authorization:** `IT_STAFF`, `ADMINISTRATOR`.
- **Headers:** `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "description": "Updated description with new diagnostic findings.",
    "assigneeId": 5,
    "followUpRequired": true,
    "followUpNote": "Monitor CPU thermals under full load.",
    "attachmentNotes": "hwmonitor-log.csv",
    "version": 1
  }
  ```
- **Responses:**
  - `200 OK`: Returns `{ "data": ActionTakenDto }` with incremented `version`.
  - `401 Unauthorized`: Session invalid.
  - `403 Forbidden`: Role not authorized or CSRF invalid (`CSRF_INVALID`).
  - `404 Not Found`: Action not found (`ACTION_NOT_FOUND`).
  - `409 Conflict`: Stale update detected (`ACTION_VERSION_CONFLICT`).
  - `422 Unprocessable Entity`: Action is terminal (`ACTION_TERMINAL_IMMUTABLE`) or parent ticket is terminal (`TICKET_TERMINAL_IMMUTABLE`).

---

### 3.4 Transition Action Taken Status (Complete / Cancel)

- **Endpoint:** `PATCH /api/actions/:id/status`
- **Description:** Transitions an Action Taken from `PENDING` to either `COMPLETED` or `CANCELLED`. When completing, records `completedById = currentUser.id` and `completedAt = now()`. Appends a `COMPLETED` or `CANCELLED` audit entry to `ActionTakenHistory`.
- **Authorization:** `IT_STAFF`, `ADMINISTRATOR`.
- **Headers:** `X-CSRF-Token: <token>`
- **Request Body for Completion:**
  ```json
  {
    "status": "COMPLETED",
    "result": "Applied BIOS patch 1.4.2; system booted into Windows without blue screen.",
    "version": 1
  }
  ```
- **Request Body for Cancellation:**
  ```json
  {
    "status": "CANCELLED",
    "cancellationReason": "User canceled service request as workstation was already replaced.",
    "version": 1
  }
  ```
- **Attribution Rule:** Any active IT Staff or Administrator may complete the action; `completedById` is assigned to the authenticated user completing the action (`req.auth.user.id`), preserving `assigneeId`.
- **Responses:**
  - `200 OK`: Returns `{ "data": ActionTakenDto }`.
  - `409 Conflict`: Stale update conflict (`ACTION_VERSION_CONFLICT`).
  - `422 Unprocessable Entity`:
    - `result` missing for completion (`ACTION_RESULT_REQUIRED`).
    - `cancellationReason` missing for cancellation (`CANCELLATION_REASON_REQUIRED`).
    - Attempted transition on already terminal action (`ACTION_TERMINAL_IMMUTABLE`).
    - Parent ticket is terminal (`TICKET_TERMINAL_IMMUTABLE`).

---

### 3.5 Retrieve Action Taken Audit History

- **Endpoint:** `GET /api/actions/:id/history`
- **Description:** Returns the complete historical audit log for the specified Action Taken, ordered by `createdAt ASC, id ASC`.
- **Authorization:** `IT_STAFF`, `ADMINISTRATOR`. (Requesters receive `403 Forbidden`).
- **Responses:**
  - `200 OK`:
    ```json
    {
      "data": {
        "actionTakenId": 1,
        "total": 2,
        "items": [
          {
            "id": 10,
            "actionTakenId": 1,
            "ticketId": 42,
            "eventType": "CREATED",
            "actor": {
              "id": 3,
              "name": "Jane IT",
              "email": "jane.it@toktickit.local",
              "role": "IT_STAFF"
            },
            "changes": {
              "description": { "before": null, "after": "Replaced RAM stick in slot 2." },
              "status": { "before": null, "after": "PENDING" },
              "assignee": { "beforeId": null, "afterId": 3 }
            },
            "versionBefore": null,
            "versionAfter": 1,
            "createdAt": "2026-10-27T10:00:00.000Z"
          }
        ]
      }
    }
    ```
  - `401 Unauthorized`: Session invalid.
  - `403 Forbidden`: Requester role.
  - `404 Not Found`: Action not found (`ACTION_NOT_FOUND`).

---

## 4. Ticket Status & Resolution Gate Endpoint

### 4.1 Update Ticket Status (Extended for Resolution Gate)

- **Endpoint:** `PATCH /api/staff/tickets/:id/status`
- **Description:** Updates `Ticket.currentStatus` in the Staff Queue/Detail workflow. Preserves all existing Lab 3 parameters (`status`, `expectedUpdatedAt`), error codes, and requester-resolution-indication clearing behavior while enforcing the Ticket Resolution Gate on transitions into `RESOLVED`.
- **Authorization:** `IT_STAFF`, `ADMINISTRATOR`.
- **Headers:** `X-CSRF-Token: <token>`
- **Request Body:**
  ```json
  {
    "status": "RESOLVED",
    "expectedUpdatedAt": "2026-10-27T10:00:00.000Z"
  }
  ```
- **Execution & Serialization Flow:**
  1. Open Prisma transaction.
  2. Execute raw query: `SELECT id, "currentStatus", "ownerId", "updatedAt" FROM "Ticket" WHERE id = $1 FOR UPDATE`.
  3. Validate permitted transition from `ticket.currentStatus` to requested `targetStatus` using `isValidStatusTransition(ticket.currentStatus, targetStatus)`. If invalid, return HTTP 409 with code `INVALID_STATUS_TRANSITION`.
  4. Validate optimistic concurrency: verify `ticket.updatedAt.toISOString() === new Date(expectedUpdatedAt).toISOString()`. If mismatch, return HTTP 409 with code `TICKET_VERSION_CONFLICT`.
  5. If `targetStatus === "RESOLVED"`, evaluate **Resolution Gate**:
     - Check: `ticket.ownerId !== null`. If null $\rightarrow$ rollback and return HTTP 422 with code `RESOLUTION_GATE_NO_OWNER`.
     - Query: `SELECT count(*) FROM "ActionTaken" WHERE "ticketId" = $1 AND status = 'COMPLETED' AND length(trim(result)) >= 3`. If count is 0 $\rightarrow$ rollback and return HTTP 422 with code `RESOLUTION_GATE_NO_COMPLETED_ACTION`.
     - Query: `SELECT count(*) FROM "ActionTaken" WHERE "ticketId" = $1 AND status = 'PENDING'`. If count $> 0 \rightarrow$ rollback and return HTTP 422 with code `RESOLUTION_GATE_PENDING_ACTIONS`.
  6. Execute ticket update:
     - Set `currentStatus = targetStatus`.
     - If `clearsResolutionIndication(targetStatus)` is true (`RESOLVED`, `CLOSED`, `CANCELLED`, `REOPENED`), set `requesterResolutionIndicatedAt = null` and `requesterResolutionIndicatedById = null`.
  7. Commit transaction.
- **Success Response (200 OK):**
  Matches `StaffStatusResponse` in `client/src/api.ts`:
  ```json
  {
    "data": {
      "previousStatus": "OPEN",
      "currentStatus": "RESOLVED",
      "requesterResolutionIndicatedAt": null,
      "requesterResolutionIndicatedBy": null,
      "updatedAt": "2026-10-27T15:00:00.000Z"
    }
  }
  ```
- **Responses:**
  - `200 OK`: Status updated successfully.
  - `400 Bad Request`: Missing/malformed `expectedUpdatedAt` or invalid status string (`VALIDATION_ERROR`).
  - `401 Unauthorized`: Unauthenticated.
  - `403 Forbidden`: Non-staff user or CSRF invalid (`CSRF_INVALID`).
  - `404 Not Found`: Ticket not found (`TICKET_NOT_FOUND`).
  - `409 Conflict`:
    - Transition not permitted: `{ "error": { "code": "INVALID_STATUS_TRANSITION", "message": "This status transition is not permitted." } }`
    - Stale update: `{ "error": { "code": "TICKET_VERSION_CONFLICT", "message": "This ticket was modified by another operation. Refresh and try again." } }`
  - `422 Unprocessable Entity` (Resolution Gate Failures):
    - No Owner: `{ "error": { "code": "RESOLUTION_GATE_NO_OWNER", "message": "Ticket must be claimed by or assigned to an IT Staff owner before it can be resolved." } }`
    - No Completed Action: `{ "error": { "code": "RESOLUTION_GATE_NO_COMPLETED_ACTION", "message": "Ticket must have at least one completed Action Taken with documented results before resolution." } }`
    - Pending Actions Exist: `{ "error": { "code": "RESOLUTION_GATE_PENDING_ACTIONS", "message": "Ticket has pending actions. All actions must be completed or cancelled before resolution." } }`

---

## 5. Operational Role Dashboards

### 5.1 IT Staff Dashboard

- **Endpoint:** `GET /api/staff/dashboard`
- **Description:** Returns authoritative operational metrics, breakdown lists, and recent activity preview for the IT Staff operational dashboard.
- **Authorization:** `IT_STAFF`, `ADMINISTRATOR`.
- **Query Parameters:** None.
- **Response `200 OK`:**
  ```json
  {
    "data": {
      "metrics": {
        "openTicketsCount": 14,
        "pendingActionsCount": 2,
        "completedActionsTodayCount": 3,
        "unassignedTicketsCount": 3
      },
      "myWork": {
        "assignedTicketsCount": 5,
        "items": [
          {
            "id": 12,
            "ticketNumber": "TCK-2026-00012",
            "summary": "VPN connection drops every 10 minutes",
            "requestedPriority": "HIGH",
            "itPriority": "HIGH",
            "currentStatus": "IN_PROGRESS",
            "pendingActionsCount": 1,
            "updatedAt": "2026-10-27T11:20:00.000Z"
          }
        ]
      },
      "unassignedQueue": {
        "total": 3,
        "items": [
          {
            "id": 45,
            "ticketNumber": "TCK-2026-00045",
            "summary": "New hire monitor setup request",
            "requestedPriority": "MEDIUM",
            "itPriority": "MEDIUM",
            "currentStatus": "OPEN",
            "createdAt": "2026-10-27T08:30:00.000Z"
          }
        ]
      },
      "recentActions": [
        {
          "id": 1,
          "ticketId": 12,
          "ticketNumber": "TCK-2026-00012",
          "description": "Adjusted MTU size on router interface to 1420.",
          "status": "COMPLETED",
          "performerName": "Jane IT",
          "completedAt": "2026-10-27T14:15:00.000Z"
        }
      ]
    }
  }
  ```

---

### 5.2 Requester Dashboard

- **Endpoint:** `GET /api/requester/dashboard`
- **Description:** Returns authoritative request summary metrics and recent activity scoped strictly to the authenticated Requester's tickets.
- **Authorization:** `REQUESTER`.
- **Query Parameters:** None.
- **Response `200 OK`:**
  ```json
  {
    "data": {
      "metrics": {
        "activeTicketsCount": 3,
        "awaitingRequesterCount": 1,
        "resolvedClosedCount": 8
      },
      "recentTickets": [
        {
          "id": 33,
          "ticketNumber": "TCK-2026-00033",
          "summary": "Need access to Figma workspace",
          "currentStatus": "WAITING_FOR_REQUESTER",
          "latestPublicUpdate": "Staff commented: Please provide your corporate Adobe ID.",
          "updatedAt": "2026-10-27T13:45:00.000Z"
        },
        {
          "id": 28,
          "ticketNumber": "TCK-2026-00028",
          "summary": "Outlook calendar sync failure on Mac",
          "currentStatus": "RESOLVED",
          "latestPublicUpdate": "Action completed: Cleared corrupt Exchange cache.",
          "updatedAt": "2026-10-27T09:15:00.000Z"
        }
      ]
    }
  }
  ```

---

## 6. Query Extensions for Dashboard Drill-Down

To ensure every metric card navigates to a fully functional, filtered destination reproducing the counted sets, the following query parameters are defined:

### 6.1 Staff Ticket Queue (`GET /api/staff/tickets`) Extensions

- **Response Compatibility:** Preserves top-level `data`, `pagination`, and `query` properties matching `StaffQueueResponse` in `client/src/api.ts`.
- **Query Parameter Extensions:**
  - **`statusGroup` (string):**
    - Accepted value: `"active"`
    - Meaning: Filters tickets where `currentStatus IN ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED')`.
  - **`owner` (string):**
    - Existing accepted values: `"unassigned"`, `"me"`, or integer user ID.
    - Combining `owner=unassigned&statusGroup=active` returns exactly unassigned active tickets.
  - **`actionAssignee` & `actionStatus` (string):**
    - Combining `actionAssignee=me&actionStatus=PENDING&statusGroup=active` returns active tickets containing at least one pending action assigned to the current user (excluding cancelled tickets).
  - **`completedBy` & `completedDate` (string):**
    - Combining `completedBy=me&completedDate=today` returns tickets containing actions completed by the current user on the current UTC calendar day.
- **Validation & Defaults:**
  - Unrecognized parameters return HTTP 400 `VALIDATION_ERROR` with `fields`.
  - Default: No filter returns all tickets paginated, preserving Lab 3 behavior.
  - Response echoes normalized query in top-level `query` property.

### 6.2 Requester My Tickets (`GET /api/tickets`) Extensions

- **`statusGroup` (string):**
  - Accepted values: `"active"`, `"resolved_closed"`.
  - `"active"` filters to `currentStatus IN ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED')`.
  - `"resolved_closed"` filters to `currentStatus IN ('RESOLVED', 'CLOSED')`.
- **`status` (string):**
  - Accepted value: Any valid `TicketStatus` (e.g., `status=WAITING_FOR_REQUESTER`).
- **Validation & Defaults:**
  - Unrecognized query keys return HTTP 400 `VALIDATION_ERROR` with `fields`.
  - Default: returns all owned tickets paginated.
  - Response echoes normalized query in top-level `query` property.

---

## 7. Error Codes Catalog

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `RESOLUTION_GATE_NO_OWNER` | 422 | Ticket must have an assigned owner before resolution. |
| `RESOLUTION_GATE_NO_COMPLETED_ACTION` | 422 | Ticket must have at least one completed action with result. |
| `RESOLUTION_GATE_PENDING_ACTIONS` | 422 | Ticket cannot be resolved while pending actions remain. |
| `TICKET_TERMINAL_IMMUTABLE` | 422 | Actions cannot be created/modified on resolved, closed, or cancelled tickets. |
| `ACTION_TERMINAL_IMMUTABLE` | 422 | Completed or cancelled actions cannot be modified. |
| `INVALID_ACTION_ASSIGNEE` | 422 | Assignee must be an active IT Staff or Administrator account. |
| `ACTION_RESULT_REQUIRED` | 422 | Result text is required when completing an action. |
| `CANCELLATION_REASON_REQUIRED` | 422 | Cancellation reason is required when cancelling an action. |
| `FOLLOW_UP_NOTE_REQUIRED` | 422 | Follow-up note is required when followUpRequired is true. |
| `IDEMPOTENCY_CONFLICT` | 409 | The idempotency key was previously used with a different request payload. |
| `ACTION_VERSION_CONFLICT` | 409 | Stale action update. The action was modified by another operation. |
| `TICKET_VERSION_CONFLICT` | 409 | Stale ticket update. Expected updatedAt does not match database. |
| `INVALID_STATUS_TRANSITION` | 409 | The requested ticket status transition is not permitted. |
| `CSRF_INVALID` | 403 | CSRF security token is missing or invalid. |
| `PASSWORD_CHANGE_REQUIRED` | 403 | Mandatory password change required before operational access. |
| `TICKET_NOT_FOUND` | 404 | Ticket not found or access denied for requester. |
| `ACTION_NOT_FOUND` | 404 | Action Taken not found. |
