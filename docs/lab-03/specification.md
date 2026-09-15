# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with secure, session-based authentication and deliver role-aware Requester, IT Staff, and Administrator workflows. The increment preserves all existing Ticket and Attachment data and Requester behavior while adding first-login password change, backend authorization, a responsive Staff Ticket Queue, protected Staff Ticket operations, append-only communication, and minimalist user administration with traceable test and review evidence.

## 2. Stakeholder Request Interpretation

TokTickIT must now identify real users instead of trusting a client-selected Requester ID. Requesters continue their Lab 2 work under their authenticated identity. IT Staff receive a shared operational queue and may manage assignment, IT Priority, status, Public Comments, and Internal Notes. Administrators manage accounts and may perform the explicitly permitted ticket operations in the authorization matrix. Security decisions are enforced by the server, not by hidden navigation or disabled controls.

## 3. Scope

### Included

- Email/password login, current-user retrieval, logout, server-side sessions, CSRF protection, and mandatory first-login password change.
- Exactly one role per user: `REQUESTER`, `IT_STAFF`, or `ADMINISTRATOR`.
- Role-aware application shell, navigation, routes, controls, and backend authorization.
- Migration of Lab 2 `RequesterUser` records into the shared User model without changing their IDs or existing Ticket ownership.
- Authenticated continuation of Create Ticket, My Tickets, Requester Ticket Detail, and Attachment lifecycle behavior.
- Requester Public Comments and a non-status-changing Problem Appears Resolved indication.
- IT Staff Ticket Queue with search, filters, sorting, pagination, ownership, status, and priority information.
- Staff Ticket Detail with claim/reassignment, IT Priority, status transitions, Public Comments, Internal Notes, and existing Attachments.
- Minimal Administrator User Management: list, search, role filter, create, edit, activate/deactivate, and set a new initial password.
- Idempotent Lab 3 seed data, migration/regression checks, responsive Zen Green UI, WCAG 2.2 AA-oriented behavior, and complete automated/visual evidence.
- GitHub Issues, feature branches, staged Pull Requests, peer review, final integration, and one-PDF submission evidence.

### Excluded

- Self-registration, Requester-created accounts, email invitations, password-reset email, MFA, social login, and SSO.
- Actions Taken, SLA calculations, escalation rules, notification services, and advanced analytics.
- Multiple roles per user, departments/organizations, profile photos, role/account history, and multi-tenant administration.
- User deletion, bulk operations, import/export, account unlocking, approval workflows, and advanced account recovery.
- Mandatory Admin-list pagination, multi-column sorting, and multiple simultaneous Admin filters.
- Production/cloud infrastructure changes.

## 4. Functional Requirements

### Authentication and application access

- **FR-01 - Login:** An active user can authenticate with a normalized email address and valid password.
- **FR-02 - Safe Authentication Failure:** Invalid credentials and unavailable accounts receive safe responses without exposing password or internal account data.
- **FR-03 - Current User:** An authenticated client can retrieve the minimum current-user identity, role, activation state, password-change state, and CSRF token required by the application.
- **FR-04 - Mandatory Password Change:** A user with `mustChangePassword = true` can access only current-user, change-password, and logout operations until a valid new password is saved.
- **FR-05 - Logout:** Logout invalidates the server session, clears the session cookie, and prevents subsequent direct access.
- **FR-06 - Role Shell:** The authenticated shell displays the current user's name and role and exposes only permitted destinations and actions.

### Requester continuation

- **FR-07 - Remove Development Identity:** The Development Requester selector, Change Requester action, `sessionStorage` requester state, `x-requester-id`, and public Requester-list endpoint are removed.
- **FR-08 - Authenticated Ticket Creation:** A Requester creates a Ticket owned by the authenticated User; client-supplied Requester identity is ignored or rejected.
- **FR-09 - Authenticated Requester Reads:** My Tickets, Ticket Detail, and Attachment operations return only resources owned by the authenticated Requester.
- **FR-10 - Requester Public Comments:** A Requester can create and retrieve Public Comments on an owned Ticket.
- **FR-11 - Resolution Indication:** A Requester can indicate that an owned, eligible Ticket appears resolved without changing its formal status.
- **FR-12 - Lab 2 Regression:** Existing Ticket numbering, idempotent creation, querying, validation, safe `404`, and Attachment lifecycle behavior remain valid after authentication migration.

### IT Staff operations

- **FR-13 - Staff Queue:** IT Staff and Administrators can retrieve a paginated queue with approved search, filters, sorting, and metadata.
- **FR-14 - Staff Detail:** Permitted staff roles can retrieve a complete operational Ticket Detail view without Requester ownership restriction.
- **FR-15 - Claim Ticket:** A permitted staff user can atomically claim an unassigned Ticket.
- **FR-16 - Assign or Reassign:** A permitted staff user can assign or reassign a Ticket to an active IT Staff or Administrator.
- **FR-17 - IT Priority:** A permitted staff user can update IT Priority without changing Requested Priority.
- **FR-18 - Status Workflow:** A permitted staff user can perform only transitions listed in the approved transition matrix.
- **FR-19 - Staff Public Comments:** Permitted staff roles can create and retrieve Public Comments.
- **FR-20 - Internal Notes:** Only IT Staff and Administrators can create and retrieve append-only Internal Notes.
- **FR-21 - Staff Attachment Access:** Staff Ticket Detail can inspect existing Attachment metadata and active content while retaining removal and safe-error rules.

### Administrator user management

- **FR-22 - List Users:** An Administrator can list users and search by name/email with an optional single role filter.
- **FR-23 - Create User:** An Administrator can create an active or inactive User with name, unique email, one permitted role, and initial password.
- **FR-24 - Edit User:** An Administrator can edit a User's name, email, role, and activation state.
- **FR-25 - Set Initial Password:** An Administrator can set a new initial password that invalidates the user's sessions and requires a change at next login.
- **FR-26 - Administrator Safety:** The system prevents self-deactivation and prevents loss of the last active Administrator.
- **FR-27 - Deactivation:** Accounts are deactivated rather than deleted, with assigned Tickets atomically unassigned.

### Quality and evidence

- **FR-28 - State Feedback:** Required screens provide meaningful loading, saving, validation, success, empty, no-results, forbidden, not-found, conflict, rate-limit, and safe-failure feedback.
- **FR-29 - Responsive and Accessible UI:** Required workflows remain operable on desktop, tablet, mobile, keyboard, screen reader, and 400% reflow-oriented layouts.
- **FR-30 - Traceability:** Every Acceptance Criterion maps to at least one planned automated, visual, or documented manual test and final evidence from the integrated branch.

## 5. Business Rules

### Identity, credentials, and sessions

- **BR-01:** Only an active User with valid credentials may authenticate.
- **BR-02:** A User requiring a password change cannot enter normal application routes until a valid new password is saved.
- **BR-03:** Requester ownership is determined only by the authenticated server session, never by `requesterId`, `x-requester-id`, local storage, or session storage supplied by the client.
- **BR-04:** Emails are trimmed and normalized to lowercase for authentication and uniqueness. Case-insensitive duplicates are rejected with `409 Conflict`.
- **BR-05:** Passwords are 12-72 Unicode characters, must not equal the normalized email, and are never logged, returned, or stored in plaintext. Confirmation matching is a client concern; the backend receives one new password value.
- **BR-06:** Passwords are hashed asynchronously with Node.js `scrypt`, a unique random 16-byte salt, `N=16384`, `r=8`, `p=1`, and a 64-byte derived key. The stored value includes an algorithm/version marker and parameters so settings can evolve.
- **BR-07:** Login uses a generic `401 INVALID_CREDENTIALS` for unknown email or wrong password. If the supplied password is correct but the account is inactive, it returns `403 ACCOUNT_INACTIVE`; this does not disclose an account to a caller who lacks its password.
- **BR-08:** Five failed login attempts for the same normalized email plus client IP within 15 minutes return `429 LOGIN_RATE_LIMITED` with `Retry-After`; success clears that key. The implementation must bound and expire limiter state.
- **BR-09:** A successful login creates a random 32-byte opaque token. Only its SHA-256 hash is stored in a `Session` row. The raw token is placed in an `HttpOnly` cookie named `toktickit_session`.
- **BR-10:** The session cookie uses `Path=/`, `SameSite=Lax`, and `Secure` outside local HTTP development. It has an eight-hour absolute expiry and is rotated after login and password change.
- **BR-11:** Logout invalidates the matching Session row before clearing the cookie. An absent or already-invalid session still produces an idempotent successful logout response.
- **BR-12:** Authentication middleware reloads the User's active state, role, and password-change flag on every protected request. Deactivation, role changes, and password reset therefore take effect immediately.
- **BR-13:** Unsafe authenticated requests require an `X-CSRF-Token` value matching the session's synchronizer token. The random CSRF token is stored in the server-side Session because the client must recover it through `GET /api/auth/me` after a reload; it is never a bearer authentication credential and is never logged. Login additionally requires an approved `Origin` header. CORS allows only the configured client origin and credentials, and every browser API/Attachment request uses `credentials: "include"` through the centralized client wrapper.
- **BR-14:** Authentication responses and logs never contain password hashes, raw session tokens, CSRF hashes, stack traces, SQL details, or secrets.

### Roles and authorization

- **BR-15:** Each User has exactly one permitted role.
- **BR-16:** Public Comments are visible to the owning Requester, IT Staff, and Administrator. Internal Notes are visible only to IT Staff and Administrator.
- **BR-17:** A hidden or disabled frontend control is feedback only; every protected operation is authorized by backend middleware and resource conditions.
- **BR-18:** Missing authentication returns `401`; authenticated but disallowed role access returns `403`; Requester access to a missing or another Requester's protected resource returns the same safe `404` envelope.
- **BR-19:** Administrators are permitted to use Staff Queue and Staff Ticket operations because the required data model allows an Administrator to be a Ticket Owner and permits Administrator priority/comment/note access. User Management remains an Administrator-only navigation area.

### Ticket ownership, priority, and status

- **BR-20:** A Ticket has zero or one primary Owner. An Owner must be an active `IT_STAFF` or `ADMINISTRATOR` User.
- **BR-21:** A new Ticket is unassigned, starts at `NEW`, and copies Requested Priority into IT Priority in the same transaction.
- **BR-22:** Requested Priority is immutable after Requester submission. Only IT Staff or Administrator can change IT Priority.
- **BR-23:** Claim succeeds only when the Ticket is unassigned. Competing claims are atomic; one succeeds and later claims receive `409 TICKET_ALREADY_ASSIGNED`.
- **BR-24:** Reassignment to an inactive, missing, or Requester account is rejected. Reassignment requires confirmation in the UI.
- **BR-25:** Deactivating a User or changing an owning User to `REQUESTER` atomically unassigns all Tickets currently owned by that User so the active-staff-owner invariant remains true.
- **BR-26:** Status changes use the Ticket's `updatedAt` as an optimistic concurrency version. A stale update returns `409 TICKET_VERSION_CONFLICT` and the client reloads current values.
- **BR-27:** Formal transition to `RESOLVED`, `CLOSED`, `REOPENED`, or `CANCELLED` requires explicit UI confirmation and a fresh version.
- **BR-28:** A Requester's Problem Appears Resolved action is allowed only while status is `NEW`, `OPEN`, `IN_PROGRESS`, or `WAITING_FOR_REQUESTER`; it records backend author/time, is idempotent while present, and never changes status. Eligibility is checked and written atomically against the current Ticket version so a concurrent formal status change cannot leave an indication on an ineligible status; a stale loser returns `409 TICKET_VERSION_CONFLICT` and reloads.
- **BR-29:** Any formal transition into `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED` clears the active resolution-indication fields atomically with the status update. Retaining a full indication history or providing an audit-history screen is outside Lab 3.

#### Approved status-transition matrix

Only `IT_STAFF` and `ADMINISTRATOR` may perform these formal transitions.

| From | Permitted next states | Confirmation |
|---|---|---|
| `NEW` | `OPEN`, `IN_PROGRESS`, `CANCELLED` | `CANCELLED` only |
| `OPEN` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` | `RESOLVED`, `CANCELLED` |
| `IN_PROGRESS` | `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` | `RESOLVED`, `CANCELLED` |
| `WAITING_FOR_REQUESTER` | `IN_PROGRESS`, `RESOLVED`, `CANCELLED` | `RESOLVED`, `CANCELLED` |
| `RESOLVED` | `CLOSED`, `REOPENED` | both |
| `CLOSED` | `REOPENED` | yes |
| `REOPENED` | `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CANCELLED` | `RESOLVED`, `CANCELLED` |
| `CANCELLED` | none | not applicable |

Same-state updates and every transition absent from the table return `409 INVALID_STATUS_TRANSITION`.

### Comments, notes, and rendering

- **BR-30:** Public Comments and Internal Notes are append-only in Lab 3; no update or delete endpoint exists.
- **BR-31:** Public Comment content is trimmed and must contain 1-2,000 characters. Internal Note content is trimmed and must contain 1-4,000 characters.
- **BR-32:** Author and creation time always come from the authenticated backend context and server clock.
- **BR-33:** Content is stored and returned as plain text. React text rendering is used; raw HTML insertion is forbidden. Newlines may be displayed with CSS `white-space`, not HTML conversion.
- **BR-34:** Public and internal inputs, timelines, labels, and submit actions must remain visually and semantically distinct.

### Administrator safety and validation

- **BR-35:** Only an Administrator can list, create, or edit Users or set an initial password.
- **BR-36:** User names are trimmed and contain 2-100 characters. Email length is at most 254 characters and must pass the documented format validation.
- **BR-37:** Creation and password reset accept one initial password satisfying BR-05 and set `mustChangePassword = true`.
- **BR-38:** Changing a User's role or initial password invalidates all of that User's existing Sessions in the same transaction.
- **BR-39:** An Administrator cannot deactivate their own account.
- **BR-40:** The last active Administrator cannot be deactivated or changed to another role. The check and update occur in one serializable transaction or equivalent database lock.
- **BR-41:** Users are never deleted in Lab 3. Existing relations and author attribution remain intact after deactivation.

### Querying, validation, and regression

- **BR-42:** Staff Queue search is trimmed, case-insensitive, and matches partial Ticket Number, Summary, Requester name, Requester email, or Category name.
- **BR-43:** Queue filters are `status`, `requestedPriority`, `itPriority`, `categoryId`, and one `owner` value (`unassigned`, `me`, or a User ID). Filters may be combined.
- **BR-44:** Queue sort fields are `updatedAt`, `createdAt`, `requestedPriority`, `itPriority`, and `status`; direction is `asc` or `desc`. Default order is `updatedAt desc`, then `ticketNumber desc`.
- **BR-45:** Staff Queue pagination is one-based with page sizes 10, 20, or 50 and default 20. An out-of-range page returns an empty list with accurate metadata; malformed or unsupported query parameters return `400 INVALID_QUERY`.
- **BR-46:** The Administrator list is not paginated in Lab 3. Search matches normalized partial name or email; an optional single valid Role filter may be combined with search.
- **BR-47:** Frontend validation improves feedback but never replaces backend validation. Unexpected failures use safe, stable error codes and do not expose implementation details.
- **BR-48:** Existing Ticket IDs, Ticket Numbers, idempotency keys/receipts, ownership, Categories, Related Systems, Attachments, and attachment storage names must not change during migration.
- **BR-49:** Seed behavior is idempotent and never overwrites a password that a seeded User has changed. For this local course repository, newly created seeded Users and migrated Lab 2 Requesters receive the documented non-secret initial password `ChangeMe-2026!` and `mustChangePassword = true`. This credential must be labelled local-only in README and must never be reused as a real personal password.
- **BR-50:** No protected response is cached by shared intermediaries; authentication and user-management responses include `Cache-Control: no-store`.

## 6. Authorization Matrix

`Own` means the authenticated Requester owns the Ticket. A checkmark is a backend permission, not merely a visible control.

| Operation | Requester | IT Staff | Administrator |
|---|---:|---:|---:|
| Login/change own initial password/logout/current user | ✓ | ✓ | ✓ |
| Create Ticket | ✓ | - | - |
| List/view Requester Tickets | Own | - | - |
| Manage Requester Attachments | Own | - | - |
| Post/read Public Comments | Own | ✓ | ✓ |
| Indicate Problem Appears Resolved | Own | - | - |
| View Staff Queue/Staff Ticket Detail | - | ✓ | ✓ |
| Claim/assign/reassign Owner | - | ✓ | ✓ |
| Update IT Priority/formal status | - | ✓ | ✓ |
| Read active Attachment content from Staff Detail | - | ✓ | ✓ |
| Post/read Internal Notes | - | ✓ | ✓ |
| List/create/edit/deactivate Users | - | - | ✓ |
| Set another User's initial password | - | - | ✓ |

## 7. UI Specification Summary

- The Development Requester shell is replaced by an authentication bootstrap, Login, mandatory Change Password, and role-aware shell.
- Requester screens preserve Lab 2 layouts while deriving identity from the session and adding Public Comments and resolution indication to Ticket Detail.
- Staff Queue uses a readable desktop table and smaller-screen cards rather than a mega-grid. Staff Detail exposes only operational fields as editable.
- User Management remains one responsive list-plus-create/edit experience with explicit safety feedback.
- Zen Green tokens, form conventions, badges, button hierarchy, field-level validation, and non-color status indicators remain consistent with Lab 2.
- Desktop is `>= 992px`, tablet is `768-991px`, and mobile is `< 768px`; no required workflow has horizontal page scrolling.
- Semantic HTML, keyboard access, visible focus, minimum 24-by-24 CSS-pixel targets, associated errors, live status messages, modal focus containment/restoration, and WCAG 2.2 AA contrast/reflow expectations apply.

Exact structures, modes, copy, responsive behavior, accessibility rules, and screenshot paths are defined in `docs/lab-03/ui-spec.md`.

## 8. Data Changes

### Models

- Rename/evolve `RequesterUser` to **User** in place: retain `id`, `name`, `email`, timestamps, and existing relations; make legacy `department` nullable; add database-unique lowercase `normalizedEmail`, `role`, `passwordHash`, `isActive`, `mustChangePassword`, `passwordChangedAt`, and `updatedAt`.
- Add **Session**: `id`, `tokenHash` unique, retrievable random `csrfToken`, `userId`, `expiresAt`, `createdAt`, and `lastSeenAt` if implemented. Raw bearer session tokens are never stored; CSRF tokens are not bearer credentials and are stored only so an authenticated session can recover its matching token after reload.
- Extend **Ticket**: replace free-text `ticketOwner` with nullable `ownerId` relation; backfill `itPriority = requestedPriority`; expand `TicketStatus`; add `requesterResolutionIndicatedAt` and `requesterResolutionIndicatedById`.
- Add **PublicComment**: `id`, `ticketId`, `authorId`, `content`, `createdAt`.
- Add **InternalNote**: `id`, `ticketId`, `authorId`, `content`, `createdAt`.
- Rename/evolve Attachment remover relation from Requester-specific naming to shared `removedByUserId` while preserving existing values.

### Constraints and indexes

- `User.normalizedEmail` is lowercase and database-unique; the database constraint is authoritative even when concurrent requests pass application preflight checks.
- Session token hash is unique; indexes cover `(userId, expiresAt)` and `expiresAt` cleanup.
- Ticket indexes support `(ownerId, updatedAt)`, `(currentStatus, updatedAt)`, `(itPriority, updatedAt)`, and existing Requester query paths.
- Comment/Note indexes use `(ticketId, createdAt)`; author foreign keys use restricted deletion.
- Ticket Owner references User with `SET NULL`; Requester/author relations are retained because Users are deactivated rather than deleted.

### Forward migration strategy

1. Preflight normalized email collisions and existing non-null legacy `ticketOwner` strings.
2. Rename the Requester table/model in place so IDs and Ticket/Attachment foreign keys do not change.
3. Add User role/credential/state columns; mark existing users as `REQUESTER`; assign local initial password hashes and `mustChangePassword = true`.
4. Preserve unmatched legacy owner text in a temporary/legacy column for evidence; do not guess a User mapping. Add nullable `ownerId`.
5. Rename the Attachment remover foreign key/column without changing values.
6. Expand status values and add Ticket workflow fields, Session, PublicComment, and InternalNote additively.
7. Backfill `itPriority` from Requested Priority, then make it required for new and migrated Tickets.
8. Remove unsafe credential defaults after backfill. Never reset the database or recreate the status enum destructively.
9. Verify before/after row counts, IDs, Ticket Numbers, sequence position, ownership, idempotency receipts, Attachments, and foreign-key integrity.

### Seed requirements

- At least four active and one inactive Requester.
- At least three active and one inactive IT Staff.
- At least one active Administrator.
- Realistic Tickets across Requesters, statuses, requested/IT priorities, and assigned/unassigned ownership.
- Safe example Public Comments and Internal Notes.
- Repeatable upserts using stable development identities and the BR-49 local-only initial credential. The create path writes its hash; the update path must not reset `passwordHash`, `mustChangePassword`, or `passwordChangedAt`.

## 9. API Contract Summary

- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`, `POST /api/auth/logout`.
- Requester: existing `/api/tickets` and `/api/attachments` resources use the authenticated identity; add Public Comments and resolution indication under the owned Ticket.
- Staff: `/api/staff/tickets`, `/api/staff/tickets/:id`, assignee retrieval, claim, owner, priority, status, and Internal Notes.
- Admin: `/api/admin/users`, `/api/admin/users/:id`, and `/api/admin/users/:id/initial-password`.
- Existing `/api` naming and camelCase JSON are retained to minimize Lab 2 regression risk. Exact methods, request/response shapes, status codes, cookies, CSRF behavior, and error codes are in `docs/lab-03/api-spec.md`.

## 10. Acceptance Criteria

- **AC-01:** Given an active User with valid credentials, when Login succeeds, then an opaque server Session is established and only safe identity, role, password-change state, and CSRF data are returned.
- **AC-02:** Given an unknown email or invalid password, when Login is attempted, then `401 INVALID_CREDENTIALS` is returned with no account or credential detail.
- **AC-03:** Given a correct password for an inactive User or a rate-limited login key, when Login is attempted, then the approved safe inactive or `429` response is returned and no Session is created.
- **AC-04:** Given `mustChangePassword = true`, when the User authenticates or requests a normal protected operation, then only current-user, change-password, and logout remain available until a valid password change succeeds.
- **AC-05:** Given a valid authenticated Session, when Logout completes or the account is deactivated, then the Session cannot access protected APIs or direct UI routes.
- **AC-06:** Given each role, when the application shell loads, then it shows the authenticated name/role and only permitted navigation; direct unauthorized API access is still rejected by the backend.
- **AC-07:** Given an authenticated Requester, when a client supplies another Requester ID through a header, body, query, or stored browser state, then the backend ignores/rejects it and never returns or mutates the other Requester's data.
- **AC-08:** Given the migrated Lab 2 database, when migrations and seed run, then existing Ticket/Attachment identifiers, ownership, numbers, receipts, and files remain valid and seed reruns create no duplicates.
- **AC-09:** Given an authenticated Requester, when Create Ticket, My Tickets, Ticket Detail, or an Attachment operation is used, then Lab 2 behavior continues under the authenticated identity.
- **AC-10:** Given an owned Ticket, when a Requester adds a valid Public Comment, then trimmed plain text is stored once with backend author/time and becomes visible to permitted roles.
- **AC-11:** Given an eligible owned Ticket and fresh version, when the Requester selects Problem Appears Resolved, then the backend records the indication without changing formal status; ineligible, stale/concurrently changed, or cross-owner actions are rejected safely without leaving an indication on an ineligible status. A formal transition into `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED` clears any active indication atomically.
- **AC-12:** Given IT Staff or Administrator, when Staff Queue is queried, then search, combined filters, approved stable sorting, and one-based pagination return accurate data/metadata; invalid queries return `400`.
- **AC-13:** Given loading, no Tickets, no matching filters, forbidden access, or an API failure, when Staff Queue renders, then the matching distinct state and recovery action is shown responsively.
- **AC-14:** Given an unassigned Ticket, when two permitted users claim it concurrently, then exactly one becomes Owner and the other receives a safe conflict.
- **AC-15:** Given a Ticket and active permitted assignee, when assignment/reassignment succeeds, then the new Owner is persisted; invalid/inactive/Requester assignees are rejected without a partial update.
- **AC-16:** Given a Ticket, when a permitted user changes IT Priority, then Requested Priority remains unchanged and the new IT Priority appears in queue/detail.
- **AC-17:** Given a Ticket status/version, when a permitted transition is requested, then only the transition matrix succeeds; invalid or stale transitions return conflict and no partial change occurs.
- **AC-18:** Given a Staff Ticket Detail, when a permitted user views Attachments or creates a Public Comment, then existing Lab 2 Attachment rules and shared comment visibility remain intact.
- **AC-19:** Given IT Staff or Administrator, when an Internal Note is created/retrieved, then trimmed plain text with backend author/time is returned; a Requester request receives no note content.
- **AC-20:** Given Public Comment and Internal Note controls, when Staff Detail renders or keyboard focus moves through it, then they are visually, textually, and semantically distinct.
- **AC-21:** Given an Administrator, when the User list is loaded/searched/role-filtered, then Name, Email, Role, Status, and Edit are displayed accurately; non-Administrators receive `403`.
- **AC-22:** Given valid User data, when an Administrator creates a User, then exactly one account with one role and a hashed initial password is created; duplicate email or invalid input is rejected safely.
- **AC-23:** Given an existing User, when an Administrator edits name, email, role, or activation, then valid changes apply atomically, affected Sessions are invalidated where required, and changing an owning User to `REQUESTER` unassigns their Tickets in the same transaction.
- **AC-24:** Given an Administrator attempts self-deactivation or attempts to deactivate/change the role of the last active Administrator, then `409` is returned and account state remains unchanged.
- **AC-25:** Given a User owns Tickets, when an Administrator deactivates that User or changes their role to `REQUESTER`, then Sessions are invalidated as required and owned Tickets become unassigned in the same transaction.
- **AC-26:** Given a new initial password, when an Administrator sets it, then existing Sessions are invalidated, the hash changes, plaintext is absent from storage/responses/logs, and the next login is gated by mandatory password change.
- **AC-27:** Given any protected endpoint, when access is unauthenticated, forbidden, invalid, missing, conflicting, rate-limited, or unexpectedly fails, then the documented status/envelope is returned without secrets or protected-resource existence leakage.
- **AC-28:** Given desktop, tablet, mobile, keyboard, screen reader, or 400% reflow checks, when all major Lab 3 screens are exercised, then required controls remain readable/operable with no clipping, overlap, hidden action, or horizontal page overflow.
- **AC-29:** Given the final integrated branch, when documented server, client, migration/regression, security, accessibility, and E2E commands run, then all required tests pass with no required tests skipped or disabled and every AC has traceable evidence.
- **AC-30:** Given course delivery review, when the Lab 3 increment is submitted, then Issues, branch/PR history, peer approvals, comment responses, documentation, screenshots, and the nine-part PDF evidence are complete and point to final `main`.

## 11. Product Definition of Done

Product completion is the software-quality gate for the increment. Course delivery is a separate evidence and workflow gate; delivery evidence does not replace implementation, test, security, or usability requirements.

### Product completion

- [ ] All approved FRs, BRs, authorization entries, status transitions, and ACs are implemented.
- [ ] The forward migration applies to a copy of Lab 2 data without reset or loss, and recorded before/after invariants match.
- [ ] Passwords, bearer session tokens, and secrets are absent from client bundles, responses, logs, fixtures containing real data, and committed configuration; CSRF tokens appear only in the authenticated Login/current-user response and client memory, never logs or persistent browser storage.
- [ ] Backend authorization is tested directly for every protected operation and role/ownership boundary.
- [ ] All required server, client, migration/regression, security, accessibility, responsive, and E2E tests pass from documented commands.
- [ ] Every AC maps to passing evidence and no required test is skipped, disabled, flaky, or replaced by an unrelated assertion.
- [ ] Login, password change, Requester regression, Staff Queue, Staff Detail, and User Management conform to the approved API/UI contracts.
- [ ] Safe success, validation, empty/no-results, unauthorized/forbidden, not-found, conflict, rate-limit, and unexpected-failure cases are demonstrated where applicable.
- [ ] Desktop, tablet, and mobile screenshots are regenerated from the integrated build and pass the completed visual checklist.
- [ ] README setup, migration, seed, credentials, test, and usage instructions are current.

### Course delivery

- [ ] Issues follow `Backlog -> Specified -> Started -> PR Review -> Fixing -> Done` and are completed sequentially unless explicitly approved otherwise.
- [ ] Each Issue is implemented on its named feature branch and enters `lab3-staging` through a peer-reviewed PR linked with `Closes #<ID>`.
- [ ] The author does not merge their own PR; the peer records a formal Approve review and all comments receive responses.
- [ ] `reviewer.md`, `tests.md`, `ai-use.md`, API/UI specifications, screenshots, and final evidence are updated through the required review workflow.
- [ ] Integration verification passes on `lab3-staging`, followed by one peer-reviewed release PR to `main`.
- [ ] The final concise PDF uses `Answer Part 1` through `Answer Part 9` in exact order with working links and readable evidence.

## 12. Assumptions and Decisions

- Server-side opaque sessions are chosen over JWTs to provide immediate logout, deactivation, role-change, and password-reset invalidation with a small course-scale data model.
- Node.js `scrypt` is chosen to avoid an additional native password package while retaining a versioned, salted password hash. A five-run sequential benchmark on the Windows development runtime on 2026-09-13 averaged 21.0 ms per hash (20.3-21.9 ms) with the approved parameters, which is acceptable for the local course workload; authentication tests must still use controlled fixtures rather than timing assertions.
- Offset pagination is retained because the queue must support numbered pages and the course dataset is small.
- The existing custom client routing may be extracted and extended; adopting React Router is not required and must not be introduced without a demonstrated reduction in risk.
- Public Comments and Internal Notes use separate tables and routes to reduce accidental Internal Note disclosure.
- Administrator ticket access is explicitly permitted by the authorization matrix to reconcile the handout's Administrator visibility/ownership/priority rules with one-role-per-user accounts.
- Deactivation or downgrade to Requester atomically unassigns owned Tickets instead of blocking the operation, because a Ticket Owner must remain active staff and deletion/history screens are out of scope.
- Legacy free-text `ticketOwner` data is preserved for migration evidence but is never guessed into a User relation.
- Production deployment, distributed rate limiting, session cleanup scheduling, full audit history, and credential delivery are outside Lab 3. The local lab documents seeded credentials only.
