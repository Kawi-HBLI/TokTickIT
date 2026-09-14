# Lab 3 REST API Specification

## 1. Purpose and Conventions

This contract extends the existing unversioned `/api` Lab 2 API. JSON property names remain `camelCase`; timestamps are UTC ISO 8601 strings; identifiers are opaque strings. Authentication uses a server-side opaque session in an `HttpOnly` cookie. Success responses use a `data` envelope and optional `meta`; errors use the shared envelope below.

All endpoints except `GET /api/health` and `POST /api/auth/login` require an authenticated Session, subject to the idempotent absent/expired-session Logout behavior in section 4.4. `GET /api/categories` and `GET /api/related-systems` remain available to authenticated users after the mandatory-password-change gate and return active records only. The Lab 2 `GET /api/requesters` endpoint is removed.

### 1.1 Shared success envelopes

```json
{
  "data": {}
}
```

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

### 1.2 Shared error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the highlighted fields and try again.",
    "fields": {
      "email": "Enter a valid email address."
    },
    "retryable": false
  }
}
```

- `fields` is optional and contains safe field-level messages.
- `retryable` is required for failures where the client needs to decide whether to offer Retry.
- Responses never include stack traces, SQL/filesystem details, password hashes, session tokens, CSRF hashes, or another Requester's protected data.
- Authentication and user-management responses include `Cache-Control: no-store`.

### 1.3 Status-code policy

| Status | Meaning |
|---|---|
| `200` | Successful read, update, or action with a response body |
| `201` | Resource created; include `Location` where a stable resource URL exists |
| `204` | Successful operation with no response body only where explicitly stated |
| `400` | Malformed JSON/query or field validation failure |
| `401` | Missing, expired, invalid Session, or invalid credentials |
| `403` | Authenticated User lacks role/resource permission or account is inactive |
| `404` | Missing resource or non-disclosing Requester ownership failure |
| `409` | Duplicate/state/concurrency/transition conflict |
| `410` | Owned/permitted Attachment exists but content was soft-removed |
| `429` | Login attempt limit exceeded; include `Retry-After` |
| `500` | Unexpected safe server failure |

## 2. Authentication, Cookies, CORS, and CSRF

### 2.1 Session cookie

- Name: `toktickit_session`.
- Value: random 32-byte opaque token encoded with base64url; only SHA-256 is stored in the database.
- Attributes: `HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`.
- Add `Secure` outside local HTTP development.
- Absolute expiry: eight hours. Expired/revoked Sessions are rejected and may be cleaned opportunistically.
- Rotate after successful Login and Change Password. Revoke all prior Sessions when role, activation, or initial password changes.

### 2.2 CORS

- Server allows exactly `CLIENT_ORIGIN` (local default `http://localhost:5173`).
- `credentials: true`; wildcard origins are forbidden.
- Approved methods and headers include `Content-Type`, `Idempotency-Key`, and `X-CSRF-Token`.
- Responses vary on `Origin`.
- The client uses one centralized API wrapper with `credentials: "include"` for every API call, including Attachment metadata, preview, download, upload, and removal requests; direct browser `fetch` calls that omit credentials are forbidden.

### 2.3 CSRF

- Each Session stores a random synchronizer token retrievably on the server. It is not an authentication bearer credential and is never logged or sent without the matching authenticated `HttpOnly` session cookie.
- Login and `GET /api/auth/me` return the CSRF token in the JSON response for that Session. The client holds it in memory, not persistent browser storage, so hard refresh and multiple tabs independently recover the same current Session token.
- Every unsafe authenticated method (`POST`, `PATCH`, `PUT`, `DELETE`) requires `X-CSRF-Token` matching the Session token using constant-time comparison.
- Missing/mismatched CSRF returns `403 CSRF_INVALID`.
- `POST /api/auth/login` has no prior Session token and therefore requires an exact approved `Origin`; missing/unapproved origin returns `403 ORIGIN_FORBIDDEN`.

### 2.4 Mandatory password-change gate

When `mustChangePassword` is true, only these protected endpoints are permitted:

- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`

Every other protected endpoint returns `403 PASSWORD_CHANGE_REQUIRED`.

## 3. Shared Representations

### 3.1 Safe User

```json
{
  "id": "user-id",
  "name": "Alex Thompson",
  "email": "alex.thompson@toktickit.local",
  "role": "IT_STAFF",
  "isActive": true,
  "mustChangePassword": false,
  "createdAt": "2026-09-12T08:00:00.000Z",
  "updatedAt": "2026-09-12T08:00:00.000Z"
}
```

Valid roles: `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.

### 3.2 Ticket statuses and priorities

```text
TicketStatus: NEW | OPEN | IN_PROGRESS | WAITING_FOR_REQUESTER |
              RESOLVED | CLOSED | REOPENED | CANCELLED

Priority: LOW | MEDIUM | HIGH | CRITICAL
```

### 3.3 Public Comment/Internal Note

```json
{
  "id": "entry-id",
  "content": "Plain text content",
  "author": {
    "id": "user-id",
    "name": "Alex Thompson",
    "role": "IT_STAFF"
  },
  "createdAt": "2026-09-12T08:00:00.000Z"
}
```

Internal Note representations are never included in general Ticket or Public Comment responses.

## 4. Authentication Endpoints

### 4.1 `POST /api/auth/login`

Public, exact approved Origin required.

Request:

```json
{
  "email": "alex.thompson@toktickit.local",
  "password": "local-development-password"
}
```

Validation: email is trimmed/lowercased and at most 254 characters; password is required and at most 72 characters. Reject unknown JSON properties.

Success `200` sets the Session cookie:

```json
{
  "data": {
    "user": { "id": "user-id", "name": "Alex Thompson", "email": "alex.thompson@toktickit.local", "role": "IT_STAFF", "isActive": true, "mustChangePassword": false },
    "csrfToken": "opaque-csrf-token"
  }
}
```

Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE`, `403 ORIGIN_FORBIDDEN`, `429 LOGIN_RATE_LIMITED`, `500 LOGIN_FAILED`.

### 4.2 `GET /api/auth/me`

Success `200`: same `user` and current Session `csrfToken` fields as Login. Errors: `401 AUTHENTICATION_REQUIRED`, `403 ACCOUNT_INACTIVE`, `500 CURRENT_USER_FAILED`.

### 4.3 `POST /api/auth/change-password`

Authenticated and CSRF-protected; permitted during the mandatory-change gate.

```json
{
  "currentPassword": "initial-or-current-password",
  "newPassword": "a-new-password-of-12-or-more"
}
```

- Both values are required; `newPassword` must satisfy the 12-72 character policy, differ from current password, and not equal normalized email.
- Success atomically replaces the hash, sets `mustChangePassword = false`, records `passwordChangedAt`, revokes every Session, creates one replacement Session, rotates cookie/CSRF, and returns `200` with the same shape as Login.
- Errors: `400 VALIDATION_ERROR`, `401 CURRENT_PASSWORD_INVALID`, `403 CSRF_INVALID`, `409 PASSWORD_REUSE`, `500 PASSWORD_CHANGE_FAILED`.

### 4.4 `POST /api/auth/logout`

With a valid Session, Logout requires matching CSRF, revokes the current Session, clears the cookie, and returns `204` with no body. With an absent or expired Session, it clears the cookie and returns the same idempotent `204` without requiring CSRF. A valid Session with missing/mismatched CSRF returns `403 CSRF_INVALID` and is not silently revoked.

## 5. Requester Ticket and Attachment API Migration

Existing Lab 2 paths and response fields remain unless changed below. Remove all `x-requester-id` requirements and ignore/reject any `requesterId` identity field in body/query.

| Method and path | Requester behavior |
|---|---|
| `POST /api/tickets` | Creates for authenticated `REQUESTER`; initializes `itPriority = requestedPriority`, `currentStatus = NEW`, `ownerId = null` |
| `GET /api/tickets` | Existing owned search/filter/sort/pagination under authenticated Requester |
| `GET /api/tickets/:id` | Owned Requester detail with Public Comments summary/resolution indication; never Internal Notes |
| `GET /api/tickets/:id/attachments` | Owned Attachment metadata |
| `POST /api/tickets/:id/attachments` | Owned upload under existing type/size/count rules |
| `GET /api/attachments/:id/preview` | Owned active content |
| `GET /api/attachments/:id/download` | Owned active content |
| `DELETE /api/attachments/:id` | Owned soft removal with existing reason rule |

Cross-Requester and missing resources share `404 TICKET_NOT_FOUND` or `404 ATTACHMENT_NOT_FOUND`. Removed owned Attachment content remains `410 ATTACHMENT_REMOVED`.

## 6. Public Comments and Resolution Indication

### 6.1 `GET /api/tickets/:id/public-comments`

Permitted for owning Requester, IT Staff, and Administrator. Requester ownership failures use safe `404`; staff missing Ticket uses `404`.

Success `200`:

```json
{
  "data": [],
  "meta": { "count": 0 }
}
```

Ordering is `createdAt asc`, then `id asc`. Pagination is not required for Lab 3.

### 6.2 `POST /api/tickets/:id/public-comments`

Permitted for owning Requester, IT Staff, and Administrator; CSRF-protected.

```json
{ "content": "Could you confirm whether the issue still occurs?" }
```

Content is trimmed, plain text, 1-2,000 characters. Author/time are ignored if supplied. Success `201` returns the created entry and `Location`. Errors: `400 VALIDATION_ERROR`, `403 CSRF_INVALID`, safe `404`, `500 PUBLIC_COMMENT_CREATE_FAILED`.

### 6.3 `POST /api/tickets/:id/resolution-indication`

Owning Requester only; CSRF-protected. The client submits the Ticket version it currently displays:

```json
{ "expectedUpdatedAt": "2026-09-12T08:00:00.000Z" }
```

- Allowed for `NEW`, `OPEN`, `IN_PROGRESS`, and `WAITING_FOR_REQUESTER`.
- Eligibility, version comparison, and the first write are atomic. A concurrent formal status change or stale version returns `409 TICKET_VERSION_CONFLICT`; no indication may remain on an ineligible status.
- First success records the authenticated Requester and server time; a repeated call with the current version returns the existing representation without changing status.
- Success `200`:

```json
{
  "data": {
    "indicatedAt": "2026-09-12T08:00:00.000Z",
    "indicatedBy": { "id": "user-id", "name": "Requester Name" },
    "currentStatus": "IN_PROGRESS"
  }
}
```

Errors: safe `404`, `409 RESOLUTION_INDICATION_NOT_ALLOWED`, `500 RESOLUTION_INDICATION_FAILED`.

## 7. Staff Ticket Queue and Detail

Every endpoint in this section requires `IT_STAFF` or `ADMINISTRATOR`.

### 7.1 `GET /api/staff/tickets`

Query parameters:

| Parameter | Values/default |
|---|---|
| `q` | trimmed partial Ticket Number, Summary, Requester name/email, or Category; default empty |
| `status` | one valid `TicketStatus` |
| `requestedPriority` | one valid `Priority` |
| `itPriority` | one valid `Priority` |
| `categoryId` | active or existing Category ID |
| `owner` | `unassigned`, `me`, or active permitted User ID |
| `sortBy` | `updatedAt` (default), `createdAt`, `requestedPriority`, `itPriority`, `status` |
| `sortDirection` | `desc` (default) or `asc` |
| `page` | positive integer, default `1` |
| `pageSize` | `10`, `20` (default), or `50` |

Success `200` contains compact rows and pagination metadata. Default stable ordering is `updatedAt desc`, then `ticketNumber desc`. Out-of-range pages return empty `data` with accurate metadata. Unknown/repeated unsupported values return `400 INVALID_QUERY`.

Each row includes `id`, `ticketNumber`, `createdAt`, `updatedAt`, `summary`, compact Requester/Category, `requestedPriority`, `itPriority`, `currentStatus`, nullable Owner, and resolution indication flag/time.

### 7.2 `GET /api/staff/tickets/:id`

Success `200` contains all safe Lab 2 Ticket Detail fields, Requester, nullable Owner, requested/IT priority, current status, `updatedAt` concurrency value, resolution indication, Public Comments, Internal Notes, and Attachment metadata. Stored filenames/paths, credentials, Sessions, and Requester-private data outside this Ticket are excluded.

### 7.3 `GET /api/staff/assignees`

Returns active Users whose role is `IT_STAFF` or `ADMINISTRATOR`, ordered by name then email. Safe fields: `id`, `name`, `email`, `role`. Used by assignment controls.

### 7.4 `POST /api/staff/tickets/:id/claim`

CSRF-protected. Empty JSON body. Atomically sets Owner to the authenticated staff User only if currently unassigned. Success `200` returns Owner and updated `updatedAt`. Errors: `404 TICKET_NOT_FOUND`, `409 TICKET_ALREADY_ASSIGNED`, `500 TICKET_CLAIM_FAILED`.

### 7.5 `PATCH /api/staff/tickets/:id/owner`

```json
{
  "ownerId": "active-staff-user-id",
  "expectedUpdatedAt": "2026-09-12T08:00:00.000Z"
}
```

`ownerId` may be `null` to explicitly unassign. A non-null Owner must be active IT Staff/Administrator. Success `200`; errors: `400 VALIDATION_ERROR`, `404 TICKET_NOT_FOUND`, `409 ASSIGNEE_NOT_ELIGIBLE`, `409 TICKET_VERSION_CONFLICT`, `500 TICKET_OWNER_UPDATE_FAILED`.

### 7.6 `PATCH /api/staff/tickets/:id/priority`

```json
{
  "itPriority": "HIGH",
  "expectedUpdatedAt": "2026-09-12T08:00:00.000Z"
}
```

Success `200` returns `requestedPriority`, `itPriority`, and updated `updatedAt`. Requested Priority is never accepted as mutable input. Errors: validation, not found, version conflict, safe `500 IT_PRIORITY_UPDATE_FAILED`.

### 7.7 `PATCH /api/staff/tickets/:id/status`

```json
{
  "status": "RESOLVED",
  "expectedUpdatedAt": "2026-09-12T08:00:00.000Z"
}
```

Success `200` returns old/new status, current resolution indication, and updated `updatedAt`. The server applies the specification transition matrix. Entering `REOPENED` clears the active resolution indication. Errors: `400 VALIDATION_ERROR`, `404 TICKET_NOT_FOUND`, `409 INVALID_STATUS_TRANSITION`, `409 TICKET_VERSION_CONFLICT`, `500 TICKET_STATUS_UPDATE_FAILED`.

### 7.8 Staff Attachment content

Staff Detail uses `GET /api/attachments/:id/preview` and `/download`. These routes allow owning Requester or permitted staff role after resolving the Attachment through its Ticket. Requester cross-owner requests remain safe `404`; removed content is `410`. Staff cannot soft-remove a Requester's Attachment in Lab 3.

## 8. Internal Notes

### 8.1 `GET /api/staff/tickets/:id/internal-notes`

IT Staff/Administrator only. Returns entries ordered `createdAt asc`, `id asc`; no Lab 3 pagination. A Requester receives `403 FORBIDDEN` without note content.

### 8.2 `POST /api/staff/tickets/:id/internal-notes`

IT Staff/Administrator only; CSRF-protected.

```json
{ "content": "Private operational context." }
```

Content is trimmed plain text, 1-4,000 characters. Backend supplies author/time. Success `201` with `Location`; errors: validation, forbidden, Ticket not found, safe `500 INTERNAL_NOTE_CREATE_FAILED`.

No update or delete endpoints exist for Public Comments or Internal Notes.

## 9. Administrator User API

Every endpoint in this section requires `ADMINISTRATOR` and returns `403 FORBIDDEN` to other roles.

### 9.1 `GET /api/admin/users`

Optional parameters: `q` for trimmed case-insensitive partial name/email and `role` for one valid Role. No pagination is required. Results order by normalized name then normalized email and include Safe User fields. Invalid role/unknown query parameters return `400 INVALID_QUERY`.

### 9.2 `POST /api/admin/users`

```json
{
  "name": "New User",
  "email": "new.user@toktickit.local",
  "role": "REQUESTER",
  "isActive": true,
  "initialPassword": "local-initial-password"
}
```

- Name: trimmed 2-100 characters.
- Email: trimmed/lowercase, valid, maximum 254, case-insensitively unique.
- Exactly one valid Role.
- `isActive` required Boolean.
- Initial password follows the 12-72 character policy and is hashed before persistence.
- Success `201` returns Safe User, never the password, and includes `Location: /api/admin/users/:id`.
- Errors: `400 VALIDATION_ERROR`, `409 EMAIL_ALREADY_EXISTS`, `500 USER_CREATE_FAILED`.

### 9.3 `PATCH /api/admin/users/:id`

At least one field is required; unknown fields are rejected.

```json
{
  "name": "Updated Name",
  "email": "updated@toktickit.local",
  "role": "IT_STAFF",
  "isActive": false,
  "expectedUpdatedAt": "2026-09-12T08:00:00.000Z"
}
```

- Update occurs atomically with last-active-Administrator and self-deactivation checks.
- Role/activation change revokes the target User's Sessions.
- Deactivation or changing the target role to `REQUESTER` atomically sets owned Ticket `ownerId` values to `null`; the response reports `unassignedTicketCount`.
- Success `200` returns Safe User and `unassignedTicketCount` when relevant.
- Errors: `404 USER_NOT_FOUND`, `409 EMAIL_ALREADY_EXISTS`, `409 SELF_DEACTIVATION_FORBIDDEN`, `409 LAST_ACTIVE_ADMIN_REQUIRED`, `409 USER_VERSION_CONFLICT`, validation, safe `500 USER_UPDATE_FAILED`.

### 9.4 `POST /api/admin/users/:id/initial-password`

```json
{ "initialPassword": "new-local-initial-password" }
```

Success atomically replaces the hash, sets `mustChangePassword = true`, clears `passwordChangedAt` if used to represent the pending initial state, revokes all target Sessions, and returns `200` with Safe User. Plaintext is never echoed. Errors: validation, not found, safe `500 INITIAL_PASSWORD_UPDATE_FAILED`.

There is no User delete endpoint.

## 10. Authorization and Resource-Disclosure Rules

| Resource/operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| Requester Ticket/Attachment write | Owned resource only | - | - |
| Public Comments | Owned Ticket | Any Ticket | Any Ticket |
| Resolution indication | Owned eligible Ticket | - | - |
| Staff Queue/Detail/actions | - | allowed | allowed |
| Internal Notes | forbidden | allowed | allowed |
| User Management | forbidden | forbidden | allowed |

- Requester resource queries include authenticated `requesterId` in the database predicate. Do not load then authorize in application code when a scoped query can avoid disclosure.
- Requester missing/cross-owner Ticket and Attachment responses are indistinguishable.
- A Requester request to Internal Notes returns `403` and no note count, IDs, excerpts, or timing.
- Authentication, role, active state, mandatory-change state, CSRF, and resource policy are evaluated independently and in that order.

## 11. Validation, Concurrency, and Idempotency

- JSON endpoints reject malformed JSON and unsupported properties with `400`.
- Existing `Idempotency-Key` Ticket creation behavior remains scoped to the authenticated Requester ID.
- Public Comment and Internal Note creation disables repeated UI submit while pending. No general idempotency key is required; a transport-uncertain retry may create a second append-only entry and the UI must ask the user to inspect the refreshed timeline before retrying.
- Claim uses an atomic conditional update.
- Ticket Owner, priority, and status updates compare `expectedUpdatedAt` in the database update predicate.
- User safety checks run inside a serializable transaction or equivalent locking strategy.
- Database uniqueness remains authoritative for normalized email and creation idempotency conflicts.

## 12. Safe Failure and Logging Contract

- Stable client codes are documented above; unexpected exceptions map to endpoint-specific safe `500` codes.
- Server logs may include a generated request/correlation ID, endpoint template, safe error class, authenticated User ID, and stack trace in protected local logs. They must never contain password values/hashes, cookies, raw tokens, CSRF tokens, Attachment paths, comment/note content, or full request bodies.
- Client errors use safe action-oriented text and preserve valid form values after retryable failures.
- `401` causes the client to clear in-memory auth/CSRF state and show Login. `403 PASSWORD_CHANGE_REQUIRED` routes to Change Password. Other `403` states retain the authenticated shell and show a role-safe forbidden state.

## 13. Environment and Secret Configuration

Server `.env.example` must document placeholders/defaults for:

```text
DATABASE_URL=
CLIENT_ORIGIN=http://localhost:5173
SESSION_COOKIE_SECURE=false
SESSION_TTL_SECONDS=28800
LOGIN_WINDOW_SECONDS=900
LOGIN_MAX_FAILURES=5
```

No static session secret is required for random opaque tokens, but cryptographically secure random generation is mandatory. Development initial credentials belong in documented seed instructions, not real personal values. Production secrets and credentials remain outside source control.
