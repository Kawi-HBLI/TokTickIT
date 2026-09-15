# Lab 3 Test Plan (Test DD / TDD)

## 1. Purpose and test-first commitment

This is the pre-implementation test plan for Lab 3.  It derives its tests from the Lab 3 Engineering Contract (FR, BR, and AC identifiers below) before feature code is written.  Each implementation Issue must first add the relevant failing test(s), make the smallest implementation that passes them, and retain the test as regression coverage.  `Planned` means deliberately not yet executed; it must never be changed to `Passed` without recorded command output from the final integrated branch.

Lab 2 remains a regression baseline: its Ticket, attachment, category, related-system, validation, and responsive behaviour must still work, but authenticated identity replaces the development requester header/selector.  Tests must prove authorization at the API boundary; hiding a client control is insufficient.

## 2. Scope, risk, and environment

### Highest-risk invariants (must pass before merge)

1. A password is never stored or returned as plaintext; inactive or invalid accounts cannot authenticate; logout and direct navigation cannot retain access.
2. The server derives requester identity and author identity from authentication, never a client-supplied user ID.  A requester cannot discover another requester's Ticket, attachment, internal note, or account.
3. Only active IT Staff/Administrators can own Tickets or perform staff operations.  Only Administrators can manage users; the last active Administrator and self-deactivation safety rules hold under concurrent requests.
4. Status changes obey the approved transition matrix; requester “Problem Appears Resolved” is a distinct request, not an unauthorized `RESOLVED`/`CLOSED` mutation.
5. Existing Lab 2 records migrate without loss and the new seed is repeatable.

### Test data and isolation

- API tests use an isolated PostgreSQL schema/database and reset fixture data per suite. The migration suite uniquely starts from the final Lab 2 migration state and upgrades it in place as specified by DB-L3-02. E2E continues the current `global-setup.ts` pattern (fresh `e2e_test` schema, migrations, then seed) and must use a Lab 3 Playwright config/test directory rather than silently changing Lab 2 coverage.
- Fixtures include active Requesters A/B/C/D, inactive Requester, active IT Staff A/B/C, inactive IT Staff, two active Administrators (needed for last-admin tests), Tickets owned by A and B, assigned/unassigned Tickets, every Ticket status/priority, active/removed attachments, one public comment, and one internal note.  Passwords are development-only fixtures and must not appear in screenshots, assertions, or API response snapshots.
- Fault tests stub the persistence/storage boundary only after the authorization decision is exercised.  They assert safe error envelopes with no stack trace, hash, token, path, or foreign-object existence disclosure.
- Time-sensitive expiry/lockout tests use a controllable clock; password hashes are tested by verification, never exact hash equality.

## 3. Contract basis

This plan uses the approved `specification.md` identifiers **AC-01 through AC-30**.  The traceability table in section 5 is the authoritative one-to-many mapping; no AC is summarized, renumbered, or silently substituted here.  The contract decisions already fixed by that specification are reflected below: opaque server-side sessions in an `HttpOnly` cookie, per-session CSRF synchronizer tokens, scrypt password hashes, five-attempt/15-minute rate limiting, an eight-hour absolute session expiry, Administrator staff-ticket permission, the published status matrix, and exact comment/note limits.

## 4. Planned automated tests

All rows below are **Planned**.  Exact filenames are intended final paths; a moved test requires this document and traceability table to be updated in the same PR.

### 4.1 Unit and schema tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| DB-L3-01 | BR auth/data, AC-08 | Prisma schema exposes `User`, one valid role, active/must-change-password fields, hashed credential only, requester/owner foreign keys, comment/note authors, timestamps, status/priority enums and required indexes. | `server/tests/lab-03/database-schema.test.ts` | Planned |
| DB-L3-02 | BR-48-BR-49, AC-08 | Build the database only through the final Lab 2 migration; insert representative legacy Tickets, Requesters, a non-null legacy owner string, active/removed Attachments plus a real storage file, and an idempotency receipt; snapshot row counts, IDs, Ticket Numbers, relations, sequence position, and readable content; then apply only Lab 3 migrations. All snapshots remain valid, Requester maps to User, Owner nullability is safe, and running seed twice creates no duplicate natural keys or reset of a previously changed seeded password. | `server/tests/lab-03/database.integration.test.ts` | Planned |
| UNIT-AUTH-01 | BR-04-BR-07, AC-01-AC-04, AC-26 | Password policy accepts exact valid bounds and rejects whitespace-only, email-equal, reused, or out-of-range values; `scrypt` verifier accepts the correct hash and rejects an incorrect password. | `server/tests/lab-03/auth-validation.test.ts` | Planned |
| UNIT-AUTH-02 | BR-08-BR-14, AC-01, AC-03-AC-05 | Expiry, logout invalidation, must-change gate, session/CSRF recovery and rotation, valid-versus-absent logout CSRF behavior, and login-attempt/rate-limit normalization yield deterministic safe decisions. | `server/tests/lab-03/auth-session.test.ts` | Planned |
| UNIT-AUTHZ-01 | BR-15-BR-19, AC-06, AC-07, AC-19, AC-21, AC-27 | Central role/active-account/resource policy permits only matrix-approved combinations; unknown/inactive role always denies and Requester ownership failures do not disclose data. | `server/tests/lab-03/authorization.test.ts` | Planned |
| UNIT-WORKFLOW-01 | BR-26-BR-29, AC-11, AC-17 | Each approved source/target/role transition passes; every unlisted transition, Requester terminal mutation, stale version, and invalid enum fails before persistence. | `server/tests/lab-03/ticket-workflow.test.ts` | Planned |
| UNIT-WORKFLOW-02 | BR-20-BR-25, BR-42-BR-45, AC-12, AC-14-AC-16 | Queue query parser applies documented defaults, allowed sort/page/filter values and stable tie-break; owner/priority rules accept only active staff/Admin assignees and approved values. | `server/tests/lab-03/staff-queue-query.test.ts` | Planned |
| UNIT-DISCUSSION-01 | BR-30-BR-34, AC-10, AC-18-AC-20 | Trimmed body boundaries, whitespace-only/maximum-length rejection, audience rules, append-only behavior, and safe plain-text rendering validation pass/fail as specified. | `server/tests/lab-03/discussion-validation.test.ts` | Planned |
| UNIT-USER-01 | BR-35-BR-41, AC-21-AC-26 | Database-authoritative normalized-email uniqueness, one valid role, update validation, password-reset gate, session revocation, owner unassignment after deactivation or downgrade to Requester, self-deactivation, and last-active-admin guard behave deterministically. | `server/tests/lab-03/user-validation.test.ts` | Planned |

### 4.2 API and integration tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| API-AUTH-01 | FR-01, FR-03, AC-01 | Valid active credentials create the opaque session cookie; `GET current-user` returns only safe identity/role/password-change/CSRF data, never hash/secret. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-AUTH-02 | FR-02, BR-07-BR-08, AC-02, AC-03 | Invalid email/password returns generic `401`; correct inactive account returns `403`; fifth failure/rate limit returns `429`/Retry-After; no Session is created or account is enumerated. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-AUTH-03 | FR-04-FR-05, BR-09-BR-13, AC-04, AC-05 | Must-change user is restricted to me/change/logout; hard refresh and independent tabs recover usable CSRF through current-user; valid password change rotates/revokes Session; missing/bad CSRF fails unsafe requests; valid-session Logout requires CSRF while absent/expired Logout returns `204`; protected API then returns `401`. | `server/tests/lab-03/auth.api.test.ts` | Planned |
| API-AUTHZ-01 | FR-06, BR-15-BR-19, AC-06, AC-27 | No credential returns `401`; each authenticated role receives allowed response or `403` for every Ticket, queue, note, and user-management route; safe errors have no secret/detail leakage. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-AUTHZ-02 | FR-07-FR-09, BR-03, BR-18, AC-07, AC-09, AC-27 | Requester-supplied requester/author IDs are ignored/rejected; legacy header/selector paths reject; cross-requester Ticket, attachment, preview/download/remove and comment access has the same safe `404` shape as missing object. | `server/tests/lab-03/authorization.api.test.ts` | Planned |
| API-REQ-01 | FR-08-FR-09, FR-12, AC-07, AC-09 | Authenticated Requester creates Ticket with server identity; My Tickets/detail/search/filter/sort/page show only own records and Lab 2 number/idempotency/validation semantics survive. | `server/tests/lab-03/requester-regression.api.test.ts` | Planned |
| API-REQ-02 | FR-09, FR-12, AC-09, AC-27 | Owner-only upload/list/preview/download/soft-remove retain Lab 2 type/count/reason/content-removal rules; staff access follows matrix; foreign objects disclose nothing. | `server/tests/lab-03/requester-regression.api.test.ts` | Planned |
| API-QUEUE-01 | FR-13, BR-42-BR-45, AC-12 | IT Staff/Administrator receives queue with documented default order, all combinable filters, search, pagination metadata, owner/status/priority and stable sorting. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-QUEUE-02 | FR-13, FR-28, BR-45, BR-47, AC-12, AC-13, AC-27 | Invalid query returns `400 INVALID_QUERY`; no results is valid empty data; forbidden and unexpected persistence failure have distinct safe/retryable UI/API states. | `server/tests/lab-03/staff-queue.api.test.ts` | Planned |
| API-DETAIL-01 | FR-14, FR-18-FR-21, AC-16, AC-18, AC-19 | Authorized staff sees Ticket, assignment, both priorities, status, Attachment metadata/content, Public Comments and Internal Notes within matrix permissions. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-OPS-01 | FR-15-FR-17, BR-20-BR-25, AC-14-AC-16 | Claim unassigned, assign/reassign active eligible owner, and update IT priority persist correctly; requester/inactive/non-staff owner and competing claims fail safely without partial update. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-OPS-02 | FR-11, FR-18, BR-26-BR-29, AC-11, AC-17 | Every matrix transition with fresh `updatedAt` persists; stale/invalid/forbidden transition changes nothing; required confirmation is represented in request contract; resolution indication is eligible-only, idempotent, and not a status mutation; formal entry into `RESOLVED`, `CLOSED`, `CANCELLED`, or `REOPENED` clears any active indication; a concurrent indication/status race leaves no indication on an ineligible status and returns one safe conflict. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Planned |
| API-DISC-01 | FR-10, FR-19, BR-30-BR-33, AC-10, AC-18 | Authorized roles create/list 1-2,000-character trimmed plain-text Public Comments; backend records author/time; requester sees only public entries; empty/overlong/script-like body fails/safely renders. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-DISC-02 | FR-20, BR-16, BR-30-BR-34, AC-19, AC-20, AC-27 | Staff/Admin create/list 1-4,000-character append-only Internal Notes; Requester gets no content/existence signal; update/delete routes reject/are absent. | `server/tests/lab-03/comments-notes.api.test.ts` | Planned |
| API-USER-01 | FR-22-FR-24, BR-35-BR-38, BR-46, AC-21-AC-23 | Administrator can search/filter/list, create and update valid users; duplicate normalized email/invalid role validation causes no partial user; initial password is hashed and never returned. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-USER-02 | FR-26-FR-27, BR-25, BR-39-BR-41, AC-23-AC-25 | Non-admin is forbidden; self-deactivation and deactivating/changing last active Administrator return conflict; concurrent attempts preserve one active Administrator; deactivation or downgrade to Requester atomically unassigns owned Tickets and revokes Sessions as required. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |
| API-USER-03 | FR-25, BR-37-BR-38, AC-26 | Admin reset sets a replacement hash/must-change gate, revokes sessions atomically, and does not expose password/hash in responses/log-safe errors. | `server/tests/lab-03/users-admin.api.test.ts` | Planned |

### 4.3 Client component, style, and accessibility tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| UI-AUTH-01 | AC-01-AC-03, AC-06 | Login labels, validation, busy/disabled submit, invalid/inactive/rate-limit safe messages, retained email, and successful role shell are accessible. | `client/tests/lab-03/Login.test.tsx` | Planned |
| UI-AUTH-02 | AC-01, AC-04, AC-05 | Central API and Attachment requests always include credentials; hard refresh restores current user and CSRF without persistent token storage; mandatory Change Password blocks navigation and handles success/failure; Logout clears client auth state. | `client/tests/lab-03/ChangePassword.test.tsx` | Planned |
| UI-GUARD-01 | AC-04-AC-06, AC-21, AC-27 | Unauthenticated, must-change, and wrong-role routes render safe login/forbidden state, never protected data; shell shows current name/role and only permitted navigation. | `client/tests/lab-03/AuthGuards.test.tsx` | Planned |
| UI-REQ-01 | AC-07, AC-09-AC-11 | Create/My Tickets/detail use current identity with no selector/change requester control; public comments and resolution indication provide validation, busy/success/failure states. | `client/tests/lab-03/RequesterTicketDetail.test.tsx` | Planned |
| UI-QUEUE-01 | AC-12, AC-13 | Queue renders loading, empty, no-results, failure/retry, search/filter/sort/page controls and correct desktop table/small-screen cards without stale result replacement. | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Planned |
| UI-DETAIL-01 | AC-14-AC-17 | Staff detail exposes authorized assignment/priority/status controls, confirmation/error/busy/conflict states, and refreshes Ticket data after success. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-DISC-01 | AC-10, AC-18-AC-20 | Public Comment and Internal Note are visibly and semantically distinguished; Requester cannot render or submit Internal Note; author/time and escaped text render safely. | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Planned |
| UI-USER-01 | AC-21-AC-26 | Admin list/search/filter, create/edit, initial-password flow, duplicate/conflict/safe failure, activation and self/last-admin constraints are understandable and usable. | `client/tests/lab-03/UserManagement.test.tsx` | Planned |
| UI-STYLE-01 | AC-13, AC-20, AC-28 | Zen Green tokens, non-colour status/priority labels, required/error treatment, focus-visible treatment, responsive table/card hooks, and public/internal differentiation remain present. | `client/tests/lab-03/ZenGreenLab3Styles.test.tsx` | Planned |
| UI-A11Y-01 | AC-20, AC-28 | Inputs have labels/errors/descriptions; dialogs trap/restore focus; live status/failures announce; keyboard actions have names; axe reports no serious violations in Lab 3 components. | `client/tests/lab-03/Accessibility.test.tsx` | Planned |

### 4.4 E2E, responsive, visual, and regression tests

| ID | Requirement / AC | Test and expected result | Intended path | Status |
|---|---|---|---|---|
| E2E-AUTH-01 | AC-01-AC-06 | Login valid/invalid/inactive/rate-limited, first-login password change, hard refresh/multiple-tab CSRF recovery, credentialed Attachment fetch, valid and expired-session Logout, browser back/direct protected URL, and expired/revoked Session routes behave safely. | `e2e/lab-03/authentication.spec.ts` | Planned |
| E2E-REQ-01 | AC-07, AC-09-AC-11, AC-18-AC-19 | Requester logs in, creates/filters/views own Ticket, performs Attachment lifecycle, adds Public Comment and Problem Appears Resolved; cannot see Internal Note or another Requester's Ticket. | `e2e/lab-03/requester-ticket-flow.spec.ts` | Planned |
| E2E-STAFF-01 | AC-12-AC-20 | Staff signs in, searches/filters/pages Queue, opens Detail, claims/reassigns, changes IT Priority/status through allowed transition, adds Public Comment/Internal Note, and sees resulting data. | `e2e/lab-03/staff-ticket-flow.spec.ts` | Planned |
| E2E-ADMIN-01 | AC-21-AC-26 | Administrator creates/searches/edits/deactivates eligible User, resets password, validates first Login, and is blocked from self/last-admin deactivation; Requester direct URL/API is denied. | `e2e/lab-03/user-administration.spec.ts` | Planned |
| E2E-SEC-01 | AC-05-AC-07, AC-19, AC-21, AC-27 | Real browser/API requests prove role checks, logout, direct URLs, CSRF rejection, and copied foreign Ticket/Attachment/Note URLs do not expose protected content. | `e2e/lab-03/authorization-boundaries.spec.ts` | Planned |
| VIS-01 | AC-13, AC-20, AC-28 | Desktop `1440x900` screenshot set: Login, password change, Requester detail/comment, Queue table/states, Staff Detail/public-v-internal notes, User Management. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-02 | AC-13, AC-20, AC-28 | Tablet `834x1112` same critical screens/states; no overflow, clipping, lost action, or unreadable table/card. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| VIS-03 | AC-13, AC-20, AC-28 | Mobile `390x844` same critical screens/states; no horizontal scroll, touch-friendly controls, readable Attachment/User text, and usable dialogs. | `e2e/lab-03/responsive-visual.spec.ts` | Planned |
| E2E-A11Y-01 | AC-20, AC-28 | `@axe-core/playwright` scan plus keyboard Tab/Shift+Tab/Enter/Escape checks on Login, Change Password, Queue, Staff Detail, and User Management. | `e2e/lab-03/accessibility.spec.ts` | Planned |
| REG-L2-01 | AC-08, AC-09, AC-18, AC-29 | Existing Lab 1/Lab 2 server/client suites and adapted Lab 2 E2E flows pass after migration without Development Requester selector/header dependency. | existing `server/tests/lab-0[12]/`, `client/tests/lab-0[12]/`, and adapted `e2e/lab-02/` | Planned |

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

## 6. Commands and final evidence

Run from repository root after dependencies, Docker PostgreSQL, migrations, and test environment configuration are ready:

```powershell
npm --prefix server test
npm --prefix client test
npm --prefix server run build
npm --prefix client run build
npx playwright test --config playwright.lab-03.config.ts
```

`playwright.lab-03.config.ts` is an intended Lab 3 config: it must target `e2e/lab-03`, preserve the isolated-schema setup/teardown, and run desktop/tablet/mobile projects.  If the project instead extends the root config, its command and config path must be recorded here before implementation begins.  Final evidence records command, commit SHA, pass/fail counts, migration/seed output, browser projects, screenshot paths under `artifacts/lab-03/screenshots/`, and no skipped/disabled required test.

## 7. Responsive and visual checklist

Complete manually against final `main`, alongside `VIS-01` to `VIS-03`; store readable screenshots by `authentication/`, `requester/`, `staff-queue/`, `staff-ticket-detail/`, and `user-management/` under `artifacts/lab-03/screenshots/`.

- [ ] Desktop/tablet/mobile show no horizontal page scrolling.
- [ ] Login/change-password labels, errors, busy controls, success and safe failure states are readable and keyboard usable.
- [ ] Queue is a readable desktop table and becomes a usable small-screen representation; search/filter/sort/page actions remain reachable.
- [ ] Staff detail keeps owner, priorities, status, attachment actions, Public Comment, and Internal Note distinct; no control overlaps or disappears.
- [ ] User-management list/form remains readable with long name/email and exposes validation/conflict safely.
- [ ] All required labels, asterisks, field-level errors, focus indicators, badges, buttons, attachment names, and dialog controls are visible and non-overlapping.
- [ ] Status, priority, active/inactive, and Public/Internal meaning have text/icon treatment and do not rely on colour alone.
- [ ] Touch targets are practical on mobile; Tab/Shift+Tab and Escape have logical modal/focus behaviour.
- [ ] Zen Green values and error/warning/success styling conform to `ui-spec.md`; screenshots are readable without extreme zoom.

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
