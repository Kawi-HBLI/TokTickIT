# Lab 3 Test Plan (Test DD / TDD)

## 1. Purpose and test-first commitment

This began as the pre-implementation test plan for Lab 3.  It derives its tests from the Lab 3 Engineering Contract (FR, BR, and AC identifiers below) before feature code is written.  Each implementation Issue must first add the relevant failing test(s), make the smallest implementation that passes them, and retain the test as regression coverage.  The final integrated verification results are recorded in section 6.  A catalogue row is `Passed` only when its named test was covered by a current passing result; aggregate totals are not used to claim untraced coverage.

Lab 2 remains a regression baseline: its Ticket, attachment, category, related-system, validation, and responsive behaviour must still work, but authenticated identity replaces the development requester header/selector.  Tests must prove authorization at the API boundary; hiding a client control is insufficient.

## 2. Scope, risk, and environment

### Highest-risk invariants (must pass before merge)

1. A password is never stored or returned as plaintext; inactive or invalid accounts cannot authenticate; logout and direct navigation cannot retain access.
2. The server derives requester identity and author identity from authentication, never a client-supplied user ID.  A requester cannot discover another requester's Ticket, attachment, internal note, or account.
3. Only active IT Staff/Administrators can own Tickets or perform staff operations.  Only Administrators can manage users; the last active Administrator and self-deactivation safety rules hold under concurrent requests.
4. Status changes obey the approved transition matrix; requester “Problem Appears Resolved” is a distinct request, not an unauthorized `RESOLVED`/`CLOSED` mutation.
5. Existing Lab 2 records migrate without loss and the new seed is repeatable.

### Test data and isolation

- API suites use mocked persistence or dedicated PostgreSQL schemas as declared in each file; a mocked transaction is not evidence of live database concurrency. DB-L3-02 uniquely starts from populated final Lab 2 migrations and upgrades in place. Browser setup, teardown and the API process share the fixed local URL in `e2e/test-environment.ts` (`localhost:5433/toktickit`, schema `e2e_test`); they do not inherit the caller's `DATABASE_URL` for resets. Lab 3 and retained Lab 2 browser suites use separate Playwright configs.
- Seeded fixtures include active/inactive Requesters and IT Staff, one active Administrator, assigned/unassigned Tickets, Public Comments and Internal Notes. API tests supply additional role/status and administrator-count fixtures; browser tests create unique users through the real Admin API when needed. Password values are local-only test data and masked in captures; real credentials must not enter committed artifacts.
- Fault tests stub the persistence/storage boundary only after the authorization decision is exercised.  They assert safe error envelopes with no stack trace, hash, token, path, or foreign-object existence disclosure.
- Unit boundary tests use a controllable clock for expiry/lockout. The browser suite instead exercises the real five-attempt limiter with a unique local test email and expires an isolated fixture's persisted Sessions directly; it does not claim a browser fake clock. Password hashes are tested by verification, never exact hash equality.

## 3. Contract basis

This plan uses the approved `specification.md` identifiers **AC-01 through AC-30**.  The traceability table in section 5 is the authoritative one-to-many mapping; no AC is summarized, renumbered, or silently substituted here.  The contract decisions already fixed by that specification are reflected below: opaque server-side sessions in an `HttpOnly` cookie, per-session CSRF synchronizer tokens, scrypt password hashes, five-attempt/15-minute rate limiting, an eight-hour absolute session expiry, Administrator staff-ticket permission, the published status matrix, and exact comment/note limits.

## 4. Planned automated test catalogue

The original test-first catalogue was committed in PR #36 before implementation.
The final mapping below retains its requirement and AC identifiers, while making
the test-layer allocation explicit. A unit or component pass does not prove a
browser or database behavior; where a planned scenario spans layers, the
supporting paths and IDs are recorded rather than inferred from aggregate totals.
Statuses refer to the Issue #45 candidate based on integrated staging, not a
verification run on final `main`.

### 4.1 Unit and schema tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| DB-L3-01 | BR auth/data, AC-08 | Prisma schema exposes `User`, one valid role, active/must-change-password fields, hashed credential only, requester/owner foreign keys, comment/note authors, timestamps, status/priority enums and required indexes. | `server/tests/lab-03/database-schema.test.ts` | Passed |
| DB-L3-02 | BR-48-BR-49, AC-08 | Build the database only through the final Lab 2 migration; insert representative legacy Tickets, Requesters, a non-null legacy owner string, active/removed Attachments plus a real storage file, and an idempotency receipt; snapshot row counts, IDs, Ticket Numbers, relations, sequence position, and readable content; then apply only Lab 3 migrations. All snapshots remain valid, Requester maps to User, Owner nullability is safe, and running seed twice creates no duplicate natural keys or reset of a previously changed seeded password. | `server/tests/lab-03/database.integration.test.ts` | Passed |
| UNIT-AUTH-01 | BR-04-BR-07, AC-01-AC-04, AC-26 | Password policy accepts exact valid bounds and rejects whitespace-only, email-equal, reused, or out-of-range values; `scrypt` verifier accepts the correct hash and rejects an incorrect password. | `server/tests/lab-03/auth-validation.test.ts` | Passed |
| UNIT-AUTH-02 | BR-08-BR-14, AC-01, AC-03-AC-05 | Exact expiry boundary, CSRF comparison, normalized fifth-failure limit, and reset of the fifteen-minute failure window. Session rotation/gating/logout are verified by API-AUTH-03 and E2E-AUTH-01/E2E-SEC-01, not this four-test unit file. | `server/tests/lab-03/auth-session.test.ts` | Passed |
| UNIT-AUTHZ-01 | BR-15-BR-19, AC-06, AC-07, AC-19, AC-21, AC-27 | Requester middleware uses authenticated identity, ignores a spoofed header, rejects non-Requester/no-session access and requires CSRF for writes. The broader role/ownership matrix is covered by API-AUTHZ-01/02 and E2E-SEC-01, not this four-test file alone. | `server/tests/lab-03/requester-authorization.test.ts` | Passed |
| UNIT-WORKFLOW-01 | BR-26-BR-29, AC-11, AC-17 | Each approved source/target/role transition passes; every unlisted transition, Requester terminal mutation, stale version, and invalid enum fails before persistence. | `server/tests/lab-03/ticket-workflow.test.ts` | Passed |
| UNIT-WORKFLOW-02 | BR-20-BR-25, BR-42-BR-45, AC-12, AC-14-AC-16 | Queue query parser applies defaults, approved fields, filters, owner forms and page bounds. Stable ordering and eligible owner/priority mutations are verified separately by API-QUEUE-01 and API-OPS-01. | `server/tests/lab-03/staff-queue-query.test.ts` | Passed |
| UNIT-DISCUSSION-01 | BR-30-BR-34, AC-10, AC-18-AC-20 | Public Comment/Internal Note validators trim, enforce their respective 1-2,000/1-4,000 bounds and reject empty/non-string values. Audience and append-only rules belong to API-DISC-01/02; escaped rendering belongs to UI-DISC-01. | `server/tests/lab-03/discussion-validation.test.ts` | Passed |
| UNIT-USER-01 | BR-35-BR-41, AC-21-AC-26 | Email syntax/normalization, initial-password boundaries/email inequality, and secret-free Safe User representation. Persistence, role changes, reset/revocation and administrator safeguards are verified by API-USER-01/02/03 and E2E-ADMIN-01. | `server/tests/lab-03/user-validation.test.ts` | Passed |

### 4.2 API and integration tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| API-AUTH-01 | FR-01, FR-03, AC-01 | Valid active credentials create the opaque session cookie; `GET current-user` returns only safe identity/role/password-change/CSRF data, never hash/secret. | `server/tests/lab-03/auth.api.test.ts` | Passed |
| API-AUTH-02 | FR-02, BR-07-BR-08, AC-02, AC-03 | API suite checks generic invalid credentials and Origin rejection; UNIT-AUTH-02 checks limiter boundaries; the real browser scenario checks inactive-account feedback and `401` -> `429`/Retry-After on the fifth failure. | `server/tests/lab-03/auth.api.test.ts`, `auth-session.test.ts`, and `e2e/lab-03/authentication.spec.ts` | Passed |
| API-AUTH-03 | FR-04-FR-05, BR-09-BR-13, AC-04, AC-05 | API tests recover safe current-user data, require CSRF-bearing logout, and verify password-change transaction/session rotation. First-login gating, refresh, second-tab mutation, expired-session `204` logout and revoked-session rejection are verified by E2E-AUTH-01/E2E-SEC-01. | `server/tests/lab-03/auth.api.test.ts`; `e2e/lab-03/authentication.spec.ts`, `authorization-boundaries.spec.ts` | Passed |
| API-AUTHZ-01 | FR-06, BR-15-BR-19, AC-06, AC-27 | The cited API suites exercise unauthenticated `401`, selected role-denied `403` and permitted requester/staff/admin operations; E2E-SEC-01 adds browser/API role checks. This result is not a claim that every role-route pair was exhaustively enumerated. | `server/tests/lab-03/requester-authorization.api.test.ts`, `staff-queue.api.test.ts`, `staff-ticket-detail.api.test.ts`, `comments-notes.api.test.ts`, `users-admin.api.test.ts`; `e2e/lab-03/authorization-boundaries.spec.ts` | Passed |
| API-AUTHZ-02 | FR-07-FR-09, BR-03, BR-18, AC-07, AC-09, AC-27 | Authenticated requester identity ignores a spoofed legacy header, the development Requester list/CORS header is removed, and cross-owner Ticket, comment, resolution, attachment download/removal return safe `404`. Browser REG-L2-01 additionally tests foreign attachment list/preview and missing-object responses. | `server/tests/lab-03/requester-authorization.test.ts`, `requester-authorization.api.test.ts`; `e2e/lab-02/requester-ownership.spec.ts` | Passed |
| API-REQ-01 | FR-08-FR-09, FR-12, AC-07, AC-09 | Lab 3 API tests cover owned list/detail search/filter/page and discussion/resolution operations. Authenticated creation, ticket number, idempotency and validation are covered by retained Lab 2 API tests plus REG-L2-01, rather than this nine-test Lab 3 API file alone. | `server/tests/lab-03/requester-regression.api.test.ts`, `server/tests/lab-02/create-ticket.api.test.ts`, `my-tickets.api.test.ts`; `e2e/lab-02/requester-ticket-flow.spec.ts` | Passed |
| API-REQ-02 | FR-09, FR-12, AC-09, AC-27 | Retained Attachment API tests and authenticated browser regression cover upload/list/preview/download/removal, type/count/reason limits and foreign-owner denial. The Lab 3 requester-regression API file itself primarily tests list/detail/comments/resolution. | `server/tests/lab-02/attachments.api.test.ts`, `server/tests/lab-03/requester-authorization.api.test.ts`; `e2e/lab-02/requester-ownership.spec.ts`, `requester-ticket-flow.spec.ts` | Passed |
| API-QUEUE-01 | FR-13, BR-42-BR-45, AC-12 | IT Staff/Administrator access, default envelope/order, one combined filter query and pagination mapping pass in API tests; query parser unit tests and E2E-STAFF-01 exercise other allowed values and live UI controls. This is not an exhaustive filter cross-product. | `server/tests/lab-03/staff-queue.api.test.ts`, `staff-queue-query.test.ts`; `e2e/lab-03/staff-queue.spec.ts` | Passed |
| API-QUEUE-02 | FR-13, FR-28, BR-45, BR-47, AC-12, AC-13, AC-27 | API tests cover unauthorized/forbidden and malformed-query responses. Client tests cover empty, no-results, Retry and distinct forbidden recovery; VIS-01/02/03 captures no-results and a deliberately aborted network-failure state. An unexpected database-failure API branch is not asserted by this five-test queue API file. | `server/tests/lab-03/staff-queue.api.test.ts`; `client/tests/lab-03/StaffTicketQueue.test.tsx`; `e2e/lab-03/responsive-visual.spec.ts` | Passed |
| API-DETAIL-01 | FR-14, FR-18-FR-21, AC-16, AC-18, AC-19 | Authorized staff sees Ticket, assignment, both priorities, status, Attachment metadata/content, Public Comments and Internal Notes within matrix permissions. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Passed |
| API-OPS-01 | FR-15-FR-17, BR-20-BR-25, AC-14-AC-16 | Claim unassigned, assign/reassign active eligible owner, and update IT priority persist correctly; requester/inactive/non-staff owner and competing claims fail safely without partial update. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Passed |
| API-OPS-02 | FR-11, FR-18, BR-26-BR-29, AC-11, AC-17 | Every matrix transition with fresh `updatedAt` persists; stale/invalid/forbidden transition changes nothing; required confirmation is represented in request contract; resolution indication is eligible-only, idempotent, and not a status mutation; formal entry into `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED` clears any active indication; a concurrent indication/status race leaves no indication on an ineligible status and returns one safe conflict. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Passed |
| API-DISC-01 | FR-10, FR-19, BR-30-BR-33, AC-10, AC-18 | Staff creation/list with author data passes API tests; requester trim/order/CSRF/empty cases are in API-REQ-01, and 1-2,000-character bounds in UNIT-DISCUSSION-01. Text is rendered as text by React, not rejected solely for containing markup-like characters. | `server/tests/lab-03/comments-notes.api.test.ts`, `requester-regression.api.test.ts`, `discussion-validation.test.ts`; `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Passed |
| API-DISC-02 | FR-20, BR-16, BR-30-BR-34, AC-19, AC-20, AC-27 | API tests cover staff create/list, invalid note lengths and Requester `403` for both routes; author/time and append-only table design are represented in the contract/schema. This result does not claim an update/delete endpoint test. | `server/tests/lab-03/comments-notes.api.test.ts`, `discussion-validation.test.ts`, `database-schema.test.ts` | Passed |
| API-USER-01 | FR-22-FR-24, BR-35-BR-38, BR-46, AC-21-AC-23 | Administrator can search/filter/list, create and update valid users; duplicate normalized email/invalid role validation causes no partial user; initial password is hashed and never returned. | `server/tests/lab-03/users-admin.api.test.ts` | Passed |
| API-USER-02 | FR-26-FR-27, BR-25, BR-39-BR-41, AC-23-AC-25 | Mock-backed API tests check forbidden access, self/last-admin conflicts, version checks, session revocation and owned-Ticket unassignment. E2E-ADMIN-01 exercises a real last-admin demotion conflict and deactivation revocation. The serializable/advisory-lock safeguard is implemented, but this result is not a live parallel-request database stress test. | `server/tests/lab-03/users-admin.api.test.ts`; `e2e/lab-03/user-administration.spec.ts` | Passed |
| API-USER-03 | FR-25, BR-37-BR-38, AC-26 | Admin reset sets a replacement hash/must-change gate, revokes sessions atomically, and does not expose password/hash in responses/log-safe errors. | `server/tests/lab-03/users-admin.api.test.ts` | Passed |

### 4.3 Client component, style, and accessibility tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| UI-AUTH-01 | AC-01-AC-03, AC-06 | Login field validation, safe invalid-credential message, retained email/cleared password and server-provided rate-limit disabling. Inactive-account behavior is E2E-AUTH-01; role-shell routing is UI-GUARD-01. | `client/tests/lab-03/Login.test.tsx` | Passed |
| UI-AUTH-02 | AC-01, AC-04, AC-05 | Mandatory password gate, mismatch validation, CSRF-bearing password change and safe logout failure; the API-client tests verify credentialed reads/writes and current-user/CSRF recovery. Actual refresh, second-tab mutation, attachment preview/download and logout are covered by E2E-AUTH-01 and REG-L2-01. | `client/tests/lab-03/ChangePassword.test.tsx`, `RequesterAuth.test.tsx`, and `requester-auth.api.test.tsx` | Passed |
| UI-GUARD-01 | AC-04-AC-06, AC-21, AC-27 | Unauthenticated, must-change, and wrong-role routes render safe login/forbidden state, never protected data; shell shows current name/role and only permitted navigation. | `client/tests/lab-03/AuthGuards.test.tsx` | Passed |
| UI-REQ-01 | AC-07, AC-09-AC-11 | The Lab 3 detail component tests cover public comments, Internal Note exclusion and resolution success/conflict. Retained Create/My Tickets component tests and authenticated REG-L2-01 cover the other requester screens without the development selector. | `client/tests/lab-03/RequesterTicketDetail.test.tsx`, `client/tests/lab-02/CreateTicket.test.tsx`, `MyTickets.test.tsx`; `e2e/lab-02/` | Passed |
| UI-QUEUE-01 | AC-12, AC-13 | Queue metadata/badges, empty/no-results, Retry and distinct forbidden recovery states. Actual search/filter/sort/page-size controls are exercised by E2E-STAFF-01 and API-QUEUE-01; computed table/card behavior is VIS-01/02/03. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Passed |
| UI-DETAIL-01 | AC-14-AC-17 | Staff detail exposes authorized assignment/priority/status controls, confirmation/error/busy/conflict states, and refreshes Ticket data after success. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Passed |
| UI-DISC-01 | AC-10, AC-18-AC-20 | Staff detail tests exercise separate Public Comment/Internal Note composers and postings; Requester detail tests prove Internal Notes do not enter its DOM/accessibility tree. VIS-01/02/03 captures their distinct labelled surfaces. | `client/tests/lab-03/StaffTicketDetail.test.tsx`, `RequesterTicketDetail.test.tsx`; `e2e/lab-03/responsive-visual.spec.ts` | Passed |
| UI-USER-01 | AC-21-AC-26 | Admin list/search/role filter, create validation/initial password, version-bearing edit, reset, self-deactivation control and forbidden state. Duplicate/version/last-admin rejection is verified by API-USER-01/02 and E2E-ADMIN-01, not inferred from these seven component tests. | `client/tests/lab-03/UserManagement.test.tsx` | Passed |
| UI-STYLE-01 | AC-13, AC-20, AC-28 | Component tests assert queue state/style hooks and text-bearing badges. Browser VIS-01/02/03 checks no overflow, table/card mode and admin dialog field geometry; E2E-A11Y-01 scans selected views for tagged axe violations and checks 320 CSS-pixel reflow. Complete visual sign-off remains section 7. | `client/tests/lab-03/ZenGreenLab3Styles.test.tsx`; `e2e/lab-03/responsive-visual.spec.ts`, `accessibility.spec.ts` | Passed |
| UI-A11Y-01 | AC-20, AC-28 | Queue input labels, polite live region, semantic table headers/action names and alert roles. Axe scans and actual keyboard focus trapping/restoration belong to E2E-A11Y-01, not this semantic component test file. | `client/tests/lab-03/Accessibility.test.tsx` | Passed |

### 4.4 E2E, responsive, visual, and regression tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| E2E-AUTH-01 | AC-01-AC-06 | Real valid/invalid/inactive/rate-limited login, first-password change, refresh, second-tab CSRF-bearing comment, expiry, idempotent expired logout and back/direct-route safety. Revoked-cookie replay is in E2E-SEC-01; credentialed attachment actions are in REG-L2-01. | `e2e/lab-03/authentication.spec.ts`; supporting `authorization-boundaries.spec.ts` and `e2e/lab-02/requester-ticket-flow.spec.ts` | Passed |
| E2E-REQ-01 | AC-07, AC-09-AC-11, AC-18-AC-19 | Requester creates/views a Ticket, posts Public Comment, indicates resolution and cannot render Internal Notes or open a foreign Ticket. Search/priority filtering and the full owned Attachment lifecycle are retained in REG-L2-01. | `e2e/lab-03/requester-ticket-flow.spec.ts`; supporting `e2e/lab-02/requester-ticket-flow.spec.ts` and `requester-ownership.spec.ts` | Passed |
| E2E-STAFF-01 | AC-12-AC-20 | Queue search, combined status/owner filters, sorting, page-size/boundary controls and responsive detail navigation; separate staff operations scenario claims/reassigns, changes priority/status and posts comments/notes. Exhaustive paging/filter combinations remain API-QUEUE-01 and UI-QUEUE-01 evidence. | `e2e/lab-03/staff-queue.spec.ts` and `staff-ticket-flow.spec.ts` | Passed |
| E2E-ADMIN-01 | AC-21-AC-26 | Administrator searches/filters, creates, edits, deactivates and resets an eligible User; the reset leads to mandatory first-login change and deactivation revokes access. Self-deactivation is disabled in the UI, a real last-admin demotion returns `409`, and Requester direct URL/API access is denied. | `e2e/lab-03/user-administration.spec.ts` | Passed |
| E2E-SEC-01 | AC-05-AC-07, AC-19, AC-21, AC-27 | Real browser/API role checks, full foreign/missing Ticket response equivalence, Internal Note denial, CSRF rejection and replayed logout cookie rejection. Foreign Attachment list/preview/download/removal denial is exercised through authenticated contexts in REG-L2-01. | `e2e/lab-03/authorization-boundaries.spec.ts` and `e2e/lab-02/requester-ownership.spec.ts` | Passed |
| VIS-01 | AC-13, AC-20, AC-28 | Desktop `1440x900` screenshot set: Login, password change, Requester detail/comment, Queue table/states, Staff Detail/public-v-internal notes, User Management. | `e2e/lab-03/responsive-visual.spec.ts` | Passed |
| VIS-02 | AC-13, AC-20, AC-28 | Tablet `834x1112` captures the same 15 states; automated assertions cover no document overflow, table/card representation and dialog field geometry. Final-main manual image inspection remains separate. | `e2e/lab-03/responsive-visual.spec.ts` | Passed |
| VIS-03 | AC-13, AC-20, AC-28 | Mobile `390x844` captures the same 15 states with automated no-horizontal-scroll, visible action and 44px/full-width dialog-field checks. Touch comfort and complete visual sign-off remain manual. | `e2e/lab-03/responsive-visual.spec.ts` | Passed |
| E2E-A11Y-01 | AC-20, AC-28 | `@axe-core/playwright` WCAG A/AA-tagged scans on seven core views, real Tab/Shift+Tab/Enter/Escape dialog and mobile-menu focus checks, 320 CSS-pixel reflow, 100-character name/199-character email wrapping, sampled mobile target geometry, and viewport-contained validation/conflict dialog controls. A screen-reader run and physical 400% zoom are not claimed. | `e2e/lab-03/accessibility.spec.ts` | Passed |
| REG-L2-01 | AC-08, AC-09, AC-18, AC-29 | Retained Lab 1/Lab 2 server/client suites and ten authenticated Requester browser scenarios pass: creation/search/filter, preview/download/remove/audit, foreign-object denial, failure/retry/draft retention, validation, axe/keyboard dialogs and three-breakpoint captures. | `server/tests/lab-0[12]/`, `client/tests/lab-0[12]/`, and `e2e/lab-02/` via `playwright.lab2-regression.config.ts` | Passed |

### 4.5 Documented manual delivery test

| ID | Requirement / AC | Test and expected result | Intended evidence | Status |
|---|---|---|---|---|
| MANUAL-DELIVERY-01 | FR-30, AC-30 | On final `main`, a reviewer checks Issues #28-#35, sequential branch/PR history, formal approvals, replies to review comments, completed documentation, regenerated screenshot checklist, and all nine PDF report parts. Every link points to final evidence and no required item is missing. | `docs/lab-03/reviewer.md`, GitHub Issue/PR links, `artifacts/lab-03/screenshots/`, and final PDF checklist | Planned |

## 5. Acceptance-criterion traceability

| AC | Planned evidence |
|---|---|
| AC-01 | UNIT-AUTH-01/02; API-AUTH-01; UI-AUTH-01; E2E-AUTH-01 |
| AC-02 | API-AUTH-02; UI-AUTH-01; E2E-AUTH-01 |
| AC-03 | API-AUTH-02; E2E-AUTH-01 |
| AC-04 | UNIT-AUTH-02; API-AUTH-03; UI-AUTH-02; UI-GUARD-01; E2E-AUTH-01 |
| AC-05 | UNIT-AUTH-02; API-AUTH-03; UI-AUTH-02; UI-GUARD-01; E2E-AUTH-01; E2E-SEC-01 |
| AC-06 | UNIT-AUTHZ-01; API-AUTHZ-01; UI-GUARD-01; E2E-SEC-01 |
| AC-07 | API-AUTHZ-02; API-REQ-01; UI-REQ-01; E2E-REQ-01; E2E-SEC-01 |
| AC-08 | DB-L3-01/02; REG-L2-01 |
| AC-09 | API-AUTHZ-02; API-REQ-01/02; UI-REQ-01; E2E-REQ-01; REG-L2-01 |
| AC-10 | UNIT-DISCUSSION-01; API-DISC-01; UI-REQ-01; E2E-REQ-01 |
| AC-11 | UNIT-WORKFLOW-01; API-OPS-02; UI-REQ-01; E2E-REQ-01 |
| AC-12 | UNIT-WORKFLOW-02; API-QUEUE-01/02; UI-QUEUE-01; E2E-STAFF-01 |
| AC-13 | API-QUEUE-02; UI-QUEUE-01; VIS-01/02/03 |
| AC-14 | API-OPS-01; E2E-STAFF-01 |
| AC-15 | UNIT-WORKFLOW-02; API-OPS-01; UI-DETAIL-01; E2E-STAFF-01 |
| AC-16 | API-DETAIL-01; API-OPS-01; UI-DETAIL-01; E2E-STAFF-01 |
| AC-17 | UNIT-WORKFLOW-01; API-OPS-02; UI-DETAIL-01; E2E-STAFF-01 |
| AC-18 | API-DETAIL-01; API-DISC-01; API-REQ-02; UI-DISC-01; E2E-STAFF-01; REG-L2-01 |
| AC-19 | UNIT-DISCUSSION-01; API-DETAIL-01; API-DISC-02; UI-DISC-01; E2E-STAFF-01; E2E-SEC-01 |
| AC-20 | API-DISC-02; UI-DISC-01; UI-A11Y-01; VIS-01/02/03 |
| AC-21 | API-USER-01; UI-USER-01; E2E-ADMIN-01; E2E-SEC-01 |
| AC-22 | UNIT-USER-01; API-USER-01; UI-USER-01; E2E-ADMIN-01 |
| AC-23 | UNIT-USER-01; API-USER-01; UI-USER-01; E2E-ADMIN-01 |
| AC-24 | UNIT-USER-01; API-USER-02; UI-USER-01; E2E-ADMIN-01 |
| AC-25 | API-USER-02; E2E-ADMIN-01 |
| AC-26 | UNIT-AUTH-01; API-USER-03; UI-USER-01; E2E-ADMIN-01 |
| AC-27 | API-AUTHZ-01/02; API-QUEUE-02; API-DISC-02; API-REQ-02; E2E-SEC-01 |
| AC-28 | UI-STYLE-01; UI-A11Y-01; VIS-01/02/03; E2E-A11Y-01 |
| AC-29 | DB-L3-01/02; REG-L2-01; E2E-AUTH-01; E2E-REQ-01; E2E-STAFF-01; E2E-ADMIN-01; E2E-SEC-01; E2E-A11Y-01 |
| AC-30 | MANUAL-DELIVERY-01 |

## 6. Candidate verification records

### 6.1 Issue #45 candidate verification (2026-09-30, Asia/Bangkok)

The commands below were executed from the repository root on
`feature/lab3-final-evidence-docs`, based on staging commit
`cf6b681880fe9ef4503cc7470baab7b6d49ff3ac`. That SHA identifies the
**base**, not this Issue #45 change. The initial candidate was committed as
`553c1094d7847f9a094c22ce0a489f593b63f76f`; subsequent visual
corrections were verified on the feature-branch working tree and committed as
`0877807552ea3abe40605460dad95765526e5861`. These are local candidate
results, not CI results or verification of the eventual release merge on
final `main`.

| Scope | Command | Observed result |
|---|---|---|
| All server tests, including populated Lab 2 to Lab 3 migration | `npm --prefix server test` | Passed: 31 files, 251 tests, 0 skipped. The two populated migration tests executed. |
| All client tests | `npm --prefix client test` | Passed: 19 files, 101 tests. React `act(...)` and expected negative-path console warnings were emitted; no test failed. |
| Server build | `npm --prefix server run build` | Passed (`tsc`, exit 0). |
| Client build after final CSS fix | `npm --prefix client run build` | Passed (`tsc && vite build`, exit 0). |
| Lab 3 browser, accessibility and visual suite | `npm run test:e2e:lab3` | Passed: 19/19 after the latest visual and CSS corrections, including real authenticated role flows, axe WCAG A/AA scans, keyboard dialogs, 320 CSS-pixel reflow and three viewport capture scenarios. |
| Retained Lab 2 Requester browser regression | `npm run test:e2e:regression` | Passed: 10/10 after the latest CSS correction, with authenticated sessions and real attachment lifecycle, isolation, failure/validation, accessibility and three-breakpoint visual states. |

The two browser commands ran **sequentially** in Chromium's desktop project.
Their visual specs explicitly iterate Desktop `1440x900`, Tablet `834x1112`
and Mobile `390x844`; the 320 CSS-pixel reflow check is a separate test. Both
use the fixed local `e2e_test` schema, migration/seed setup and dedicated
upload directory. The browser suite does not claim a real screen-reader run or
physical 400% browser zoom; these remain manual final-delivery checks.

The 45 exact screenshot paths listed in `ui-spec.md` exist under the five
Lab 3 areas (three states x three viewports per area). The retained Requester
regression directory contains 42 additional PNGs: 36 generated regression
captures and six older `my-tickets-*` / `create-ticket-*` captures under
`artifacts/lab-03/screenshots/requester-regression/`. Pre-existing captures
in the five main areas are additional files, not part of the 45-path claim.
No file in `artifacts/lab-02/screenshots/` was changed. A selection of the
new images was manually inspected; that is not a claim that every final-main
capture has been visually signed off. The 45 new state names have no committed
same-state visual baselines, so pixel-diff regression is **inconclusive**;
these captures prove the named state was rendered, not unchanged pixels.

Visual inspection after the initial commit found that Requester conversation
and resolution captures could show the same state across viewports, and that
full-page captures of modal dialogs showed an undimmed region below the
viewport. The capture test now creates a fresh Ticket per viewport and uses
viewport-sized modal screenshots. Further CSS adjustments keep the Change
Password logout control on one line and give Staff Queue filters enough room
without stretching the search field vertically. After the final correction,
client tests and build passed, Lab 3 E2E passed 19/19, and retained Lab 2
browser regression passed 10/10. The 45 required PNGs were regenerated;
the corrected Requester, queue, authentication, and modal states were
manually inspected. These are candidate-branch captures, not final-main
sign-off.

After the peer-reviewed staging and release merges, rerun the documented
commands on `main`, check all 45 required captures and the complete visual
checklist, record the final commit/CI links and finish the nine-part PDF.

### 6.2 PR #46 visual-checklist follow-up (2026-10-01, Asia/Bangkok)

Executed on `feature/lab3-final-evidence-docs`, working tree based on
`0877807552ea3abe40605460dad95765526e5861`. These results cover the local
follow-up changes, not a staging/release merge, CI run, or peer approval.

| Scope | Command | Observed result |
|---|---|---|
| Client regression | `npm --prefix client test` | Passed: 20 files, 103 tests. Existing React `act(...)` and expected negative-path warnings remain; no failures. |
| Client build | `npm --prefix client run build` | Passed: `tsc && vite build`, exit 0. |
| Lab 3 browser/accessibility/visual suite | `npm run test:e2e:lab3` | Passed: 21/21, including two new candidate-checklist scenarios and all 45 required captures. |
| Retained Requester browser regression | `npm run test:e2e:regression` | Passed: 10/10, run sequentially after Lab 3 against the same isolated test schema; 36 current regression captures regenerated. |

The screenshot audit found a missing mobile navigation disclosure, raw
Requester status enums, an uncontained Administrator layout, long-account
overflow, and lost dialog focus after a rejected submission. These were
corrected, with real browser assertions for menu state and keyboard recovery,
long-text bounds, error focus and mobile target size. A further visual check
caught clipped dialog actions after an email conflict; the dialog now keeps
its header/actions inside the viewport while the form body scrolls internally.
The final browser run asserts this geometry in both validation and conflict
states. Core error/warning/success and priority colours were aligned with
`ui-spec.md` before the final capture run.

Requester discard/removal dialog captures also use viewport-sized screenshots
with explicit frame-bound assertions; full-page stitching had omitted the
mobile removal dialog and produced partial dimming on long pages. The
corrected captures show the actual dialog and its dimmed viewport, not a
stitched full-page approximation of a fixed overlay.

No server code, schema, or dependency changed in this follow-up. Server test
and build results remain the dated Section 6.1 evidence and are not claimed
as rerun on 2026-10-01. The archived Lab 2 screenshots remain unchanged.

## 7. Responsive and visual checklist

### 7.1 Completed candidate inspection

Inspected on **2026-10-01 (Asia/Bangkok)** against the PR #46 candidate
working tree in Section 6.2. All 45 standardized screenshots were opened and
checked at Desktop `1440x900`, Tablet `834x1112`, and Mobile `390x844`.
The seven supplemental candidate captures and the referenced Requester
regression states were also inspected. Checked items below mean candidate
verification using the image observations and behavioral evidence recorded
here; they do **not** mean final-main sign-off or a complete assistive-technology
audit. Long pages and dialog bodies may scroll vertically; horizontal page
overflow or unreachable actions are not accepted.

- [x] Desktop/tablet/mobile show no horizontal page scrolling. See V7-01.
- [x] Login/change-password labels, errors, busy controls, success and safe failure states are readable and keyboard usable. See V7-02.
- [x] Queue is a readable desktop table and becomes a usable small-screen representation; search/filter/sort/page actions remain reachable. See V7-03.
- [x] Staff detail keeps owner, priorities, status, attachment actions, Public Comment, and Internal Note distinct; no control overlaps or disappears. See V7-04.
- [x] User-management list/form remains readable with long name/email and exposes validation/conflict safely. See V7-05.
- [x] All required labels, asterisks, field-level errors, focus indicators, badges, buttons, attachment names, and dialog controls are visible and non-overlapping. See V7-06.
- [x] Status, priority, active/inactive, and Public/Internal meaning have text/icon treatment and do not rely on colour alone. See V7-07.
- [x] Touch targets are practical on mobile; Tab/Shift+Tab and Escape have logical modal/focus behaviour. See V7-08.
- [x] Zen Green values and error/warning/success styling conform to `ui-spec.md`; screenshots are readable without extreme zoom. See V7-09.

All paths below are relative to `artifacts/lab-03/screenshots/`.
`{viewport}` means each of `desktop`, `tablet`, and `mobile`, not one sample.

| Check | Screenshot evidence | Observed result and supporting behavior |
|---|---|---|
| V7-01 | The complete 45-path set in `ui-spec.md` Section 10; `candidate-checks/long-user-{viewport}.png` | Page contents remain contained at all three widths; desktop tables and small-screen cards are readable. VIS-01/02/03 assert document overflow and desktop table overflow; E2E-A11Y-01 separately verifies 320 CSS-pixel reflow. |
| V7-02 | `authentication/01-login-ready-{viewport}.png`, `02-login-validation-or-safe-failure-{viewport}.png`, `03-change-password-{viewport}.png` | Labels, validation text, focus ring, password controls and logout are legible. UI-AUTH-01/02 and E2E-AUTH-01 cover busy, safe failure, success/redirect and first-login behavior; screenshots are not used to infer transient behavior. |
| V7-03 | `staff-queue/01-queue-results-{viewport}.png`, `02-queue-filter-no-results-{viewport}.png`, `03-queue-loading-or-failure-{viewport}.png` | Desktop headers/data remain readable; tablet/mobile cards retain status, both priorities and owner. Search, all filters, sort, page size, pagination, Clear filters and Retry remain visible/reachable. API-QUEUE-01/02, UI-QUEUE-01 and E2E-STAFF-01 cover their behavior and distinct forbidden recovery. |
| V7-04 | `staff-ticket-detail/01-detail-assignment-priority-status-{viewport}.png`, `02-detail-public-and-internal-notes-{viewport}.png`, `03-detail-conflict-or-validation-{viewport}.png`; `requester-regression/detail-{viewport}.png` | Owner, Requested/IT Priority and status are separate. Public and warning-tinted Internal composers have distinct headings/audience text and submit controls. Validation does not erase the unaffected Internal draft. The staff captures show an empty attachment state; populated filename/actions are additionally shown in the Requester regression. UI-DETAIL-01 separately tests staff preview/download controls and credentialed attachment helpers. |
| V7-05 | `user-management/01-users-list-{viewport}.png`, `02-create-or-edit-user-{viewport}.png`, `03-deactivation-safety-or-forbidden-{viewport}.png`; `candidate-checks/long-user-{viewport}.png`, `user-validation-mobile.png`, `user-conflict-mobile.png` | A real 100-character name and 199-character email wrap within table cells/cards. Create/edit labels and account safety text are readable. Required-field errors and real duplicate-email conflict retain the draft and focus the relevant field; dialog heading, close and footer actions stay inside the mobile viewport. E2E-A11Y-01 measures text and control bounds. |
| V7-06 | Authentication/admin/detail validation captures above; `requester-regression/validation-{viewport}.png`, `detail-{viewport}.png`, `removal-dialog-{viewport}.png` | Labels/asterisks, adjacent error text, focus indicators, badges and attachment names remain distinct. Attachment preview/download/removal controls are identifiable. Administrator dialog headers/actions remain visible while an over-height body scrolls; E2E-A11Y-01 and REG-L2-01 verify keyboard access and restoration. |
| V7-07 | `requester/01-my-tickets-authenticated-{viewport}.png`, `02-ticket-detail-public-comment-{viewport}.png`, `03-problem-appears-resolved-{viewport}.png`; queue/detail/user list captures above | Status labels use readable words rather than underscored enums. Priorities, Active/Inactive, and Public/Internal have explicit text. Before/after resolution captures are distinct: the action becomes a timestamped indication while formal status stays New. Requester captures contain only Public Comments; API/DOM exclusion is separately tested by API-DISC-02, UI-REQ-01 and E2E-SEC-01. |
| V7-08 | `candidate-checks/navigation-closed-mobile.png`, `navigation-open-mobile.png`, `user-validation-mobile.png`, `user-conflict-mobile.png`; `requester-regression/discard-dialog-mobile.png`, `removal-dialog-mobile.png` | Mobile navigation has a labelled disclosure and visible keyboard focus. E2E-A11Y-01 verifies `aria-expanded`/controlled navigation, Enter/Tab/Escape, the 767/768px boundary, focus after navigation and dirty-dialog cancellation, modal Tab/Shift+Tab/Escape, and sampled mobile controls at least 24x24 CSS px. VIS-01/02/03 verify 44px dialog inputs. No physical-device touch audit is claimed. |
| V7-09 | Authentication, queue, detail, resolution and admin error captures above | Primary/dark/secondary/pale green match the declared Zen tokens; error, warning, success and priority treatments remain readable and textual. The duplicate-email test verifies computed error foreground/background; axe scans cover the sampled core views. No extreme zoom was needed to inspect these images. Pixel-diff regression remains inconclusive without same-state baselines. |

### 7.2 Current evidence versus retained captures

- **Required current set:** exactly the 45 standardized paths in `ui-spec.md`
  Section 10 across `authentication/`, `requester/`, `staff-queue/`,
  `staff-ticket-detail/`, and `user-management/`, regenerated on 2026-10-01.
- **Supplemental current checklist evidence:** seven PNGs in
  [candidate-checks/](../../artifacts/lab-03/screenshots/candidate-checks/):
  `long-user-{viewport}.png`, `navigation-closed-mobile.png`,
  `navigation-open-mobile.png`, `user-validation-mobile.png`, and
  `user-conflict-mobile.png`.
- **Supplemental current Requester regression:** 36 PNGs in
  [requester-regression/](../../artifacts/lab-03/screenshots/requester-regression/):
  `empty-list`, `list`, `no-results`, `validation`, `discard-dialog`,
  `submitting`, `success`, `detail`, `removal-dialog`, `removed`,
  `five-file-limit`, and `safe-404`, each with all three viewport suffixes.
- **Historical only:** the 15 older non-standardized PNGs in the five main
  areas, plus six `requester-regression/my-tickets-*` and `create-ticket-*`
  PNGs. These are retained for history, are not the current required evidence,
  and are not counted as regenerated in Section 6.2.
- **Archived Lab 2 baseline:** `artifacts/lab-02/screenshots/` is unchanged;
  authenticated regression evidence is stored under Lab 3 instead.

### 7.3 Pending subsequent release checks

- [ ] After the approved staging/release merges, rerun the documented suites
  and inspect the standardized evidence on final `main`; record its SHA and
  CI/release links. Candidate checks above must not be relabelled as this run.
- [ ] Perform and record actual 400% browser zoom inspection. The passing
  320 CSS-pixel reflow test is complementary evidence, not that manual run.
- [ ] Perform and record a real screen-reader walkthrough for labels, errors,
  live feedback, navigation and dialogs; automated axe/keyboard checks do
  not substitute for this walkthrough.
- [ ] Complete MANUAL-DELIVERY-01, including formal peer approval and the
  nine-part PDF delivery evidence.

## 8. Deliberately not tested as Lab 3 features

No tests are planned for self-registration, invitation/email reset, MFA/SSO/social login, Actions Taken, SLA/escalation/notifications, dashboard/KPI beyond the approved queue UI, multi-role users, user deletion, bulk/import/export, profile/history, account unlock/approval, or cloud deployment: these are excluded Lab 3 scope.  Browser tests cannot prove production secret management or brute-force resilience under real attack load; configuration review and deployment controls remain necessary if the system leaves local-course scope.

## 9. Approved contract decisions used by this plan

1. Authentication uses an eight-hour opaque server Session in an `HttpOnly`
   cookie, per-Session synchronizer CSRF token, five-failure/15-minute Login
   limiter, and versioned Node.js `scrypt` hashes with a 12-72 character policy.
2. Administrator has Staff Ticket authority. Formal transition confirmations,
   status paths, and the separate idempotent Problem Appears Resolved behavior
   follow `specification.md`.
3. `RequesterUser` is renamed/evolved in place. Existing IDs and Requester
   ownership remain unchanged; unmatched free-text legacy Owner values are
   preserved as evidence and are not guessed into User relations.
4. Public Comments allow 1-2,000 trimmed plain-text characters and Internal
   Notes allow 1-4,000. React renders text without raw HTML.
