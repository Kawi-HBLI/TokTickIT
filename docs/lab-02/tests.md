# Lab 2 Test Plan and Results

## 1. Test Strategy

Lab 2 uses specification-driven Test DD and TDD. Tests are planned from the approved Functional Requirements, Business Rules, and Acceptance Criteria before implementation. For each feature Issue, the relevant automated tests are written first, confirmed to fail for the expected missing behavior, and then used to guide the smallest correct implementation.

Required levels:

- **Unit:** deterministic Ticket Number, input, Attachment, and query validation logic.
- **API/Integration:** Express endpoints, Prisma persistence, ownership conditions, pagination, safe errors, and Attachment lifecycle.
- **UI Component/Integration:** React screens, requester context, forms, screen states, interactions, and mocked API behavior.
- **UI Style and Accessibility:** required tokens/classes, editable/read-only states, labels, focus semantics, badges, and absence of out-of-scope controls.
- **Responsive and Visual:** Playwright screenshots and manual comparison with `ui-spec.md` at desktop, tablet, and mobile widths.
- **End-to-End:** complete Requester creation, listing, detail, ownership, switching, and Attachment journeys against the real application stack.

No required test may be skipped, disabled, commented out, or marked Pass without actual passing output. Unit, API, and UI tests belong to their feature Issues; they are not postponed to the final documentation Issue.

## 2. Test Environment and Data

- PostgreSQL runs through the documented Docker Compose setup.
- API tests use an isolated Lab 2 test database or isolated schema and reset their own records.
- Seed tests verify idempotency rather than relying on a one-time clean database.
- Test fixtures include at least Requester A, Requester B, one inactive Requester, all required Categories, and the required Related Systems.
- Ownership tests create known records for different Requesters and never infer ownership only from UI filtering.
- Attachment tests use small generated fixture files whose type and byte size are controlled by the test.
- Time-dependent tests use a fixed clock where possible.
- E2E tests start from a known seed/reset state and record the generated Ticket Number rather than assuming a fixed number.

## 3. Planned Automated Tests

### 3.1 Unit Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|
| DB-SCHEMA-01 | BR-07, BR-15, BR-17-BR-18 | Prisma models, relationships, constraints, ownership indexes, and Ticket Number source | Schema validates; required models/indexes exist; Ticket Number uses a PostgreSQL sequence and never row counting | `server/tests/lab-02/database-schema.test.ts` | Passed |
| DB-SEED-01 | BR-01-BR-03, AC-01 | Required Categories, Related Systems, active Requesters, inactive Requester, and repeatable seeding | Required values exist and running the upserts twice creates no duplicate natural keys | `server/tests/lab-02/seed.test.ts` | Passed |
| UNIT-01 | BR-07, AC-06 | Ticket Number formatting and concurrency-safe source abstraction | Returns `TKT-YYYY-NNNNN` with at least five padded digits and no duplicate source value | `server/tests/lab-02/ticket-number.test.ts` | Planned |
| UNIT-02 | BR-10-BR-14, AC-07 | Trimming and boundary validation for Summary, Description, IDs, and Priority | Exact boundaries pass; whitespace, out-of-range text, inactive references, and invalid enum values fail by field | `server/tests/lab-02/ticket-validation.test.ts` | Planned |
| UNIT-03 | BR-25-BR-27, AC-10 | Attachment extension, MIME, size, count, and safe filename rules | Permitted boundary files pass; mismatched/unsupported/oversized/count-six files fail safely | `server/tests/lab-02/attachment-validation.test.ts` | Planned |
| UNIT-04 | BR-19-BR-22, AC-13, AC-14 | Query parsing, allowed page sizes, sort fields, priority order, and defaults | Valid query is normalized; invalid values fail; stable defaults are applied | `server/tests/lab-02/ticket-query.test.ts` | Planned |

### 3.2 API and Integration Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|
| DB-INTEGRATION-01 | BR-01-BR-03, BR-07, BR-15, BR-17-BR-18 | Fresh migration chain, real seed repeatability, persisted Ticket Number boundaries through bigint maximum, 20 concurrent inserts, idempotency uniqueness, and restricted Requester deletion | Migrations apply to an empty isolated schema; seed preserves identities; full digits and unique numbers persist; database constraints reject invalid writes | `server/tests/lab-02/database.integration.test.ts` | Passed |
| API-REF-01 | FR-01, BR-02, AC-01 | Active Development Requester endpoint and repeatable seed | `200`; four or more active Requesters returned; inactive Requester absent; running seed twice creates no duplicates | `server/tests/lab-02/requesters-reference.api.test.ts` | Passed |
| API-REF-02 | FR-04, AC-04 | Empty and unexpected reference-data failure behavior | Empty array or safe `500` contract returned without internal details | `server/tests/lab-02/requesters-reference.api.test.ts` | Passed |
| API-REF-03 | FR-04, BR-12 | Active Categories and Related Systems | `200`; required seeded active values returned in documented order; inactive values absent | `server/tests/lab-02/requesters-reference.api.test.ts` | Planned |
| API-CTX-01 | BR-04, BR-05, AC-05 | Missing, malformed, unknown, and inactive `x-requester-id` | Each Requester-owned endpoint rejects the context safely and returns no Ticket data | `server/tests/lab-02/requester-context.api.test.ts` | Passed for shared Requester boundary; endpoint reuse verified with each later Ticket feature |
| API-CREATE-01 | FR-05, FR-06, AC-06 | Valid Ticket creation for header Requester | `201`; exactly one persisted Ticket with matching owner, backend Ticket Number/date, and `NEW` status | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-CREATE-02 | BR-10-BR-14, AC-07 | Missing, whitespace, boundary, invalid reference, and invalid Priority payloads | `400` field errors; no Ticket persisted | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-CREATE-03 | FR-07, BR-15, AC-08 | Duplicate/concurrent submission protection | Same key/payload returns the original Ticket and one row exists; same key/different payload returns `409` | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-CREATE-04 | BR-16, BR-33, AC-09 | Unexpected database failure | Safe `500`; no stack/database detail returned; inconsistent partial Ticket absent | `server/tests/lab-02/create-ticket.api.test.ts` | Planned |
| API-ATT-01 | BR-25-BR-28, AC-10 | Invalid file during creation/upload | Unsupported, mismatched, oversized, or count-six operation is rejected and invalid data is not persisted | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-ATT-02 | BR-29, AC-11 | Unexpected file-storage failure after Ticket creation | Ticket remains; incomplete file/metadata cleaned; failed filename warning returned | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-LIST-01 | FR-08, BR-17, AC-12 | Ownership-scoped My Tickets for Requester A and B | `200`; each response contains only the selected Requester's Tickets | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-LIST-02 | FR-09, BR-19, BR-20, AC-13 | Case-insensitive search and combined Category/Priority filters | Only matching owned Tickets returned; clearing parameters restores unfiltered results | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-LIST-03 | FR-10, BR-21, BR-22, AC-14 | Default/explicit stable sort, page metadata, boundaries, and invalid query values | Correct order and metadata; page beyond end is empty; invalid query returns `400` | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-LIST-04 | BR-23, AC-15 | No owned Tickets versus no matching results | Both return valid empty data/metadata that the UI can distinguish from applied query state | `server/tests/lab-02/my-tickets.api.test.ts` | Planned |
| API-DETAIL-01 | FR-11, BR-24, AC-16 | Owned Ticket Detail and Attachment metadata | `200`; complete read-only Ticket with active and removed metadata; no stored path exposed | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-DETAIL-02 | FR-16, BR-18, AC-17 | Missing and cross-Requester Ticket Detail | Both return `404` with the same safe error shape and no Ticket data | `server/tests/lab-02/ticket-detail.api.test.ts` | Planned |
| API-ATT-03 | FR-12, AC-18 | Add valid Attachment to owned Ticket below limit | `201`; metadata and file saved; active count increases; preview/download available | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-ATT-04 | BR-26, AC-19 | Upload when five active Attachments exist | Operation rejected; existing records/files unchanged | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-ATT-05 | FR-13, BR-27, BR-32, AC-20 | Active preview/download and safe filename | Correct bytes/type/disposition returned; original safe filename used; server path absent | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-ATT-06 | FR-14, BR-30, AC-21 | Soft removal with valid/invalid reason | Valid reason stores timestamp/requester/reason; missing, short, or long reason is rejected | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-ATT-07 | FR-15, BR-31, BR-32, AC-22 | Removed metadata, blocked content, and repeated removal | Metadata remains; content returns `410`; repeat returns `409`; original audit data unchanged | `server/tests/lab-02/attachments.api.test.ts` | Planned |
| API-ATT-08 | FR-16, BR-18, AC-23 | Cross-Requester Attachment metadata/upload/preview/download/removal | Every operation returns the same safe `404` behavior as missing Attachment | `server/tests/lab-02/attachments.api.test.ts` | Planned |

### 3.3 UI Component, Style, and Accessibility Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|
| UI-REQ-01 | FR-01, AC-01 | Selector loading and active Requester rendering | Loading controls disabled; only active Requesters shown; testing-only text visible | `client/tests/lab-02/RequesterSelector.test.tsx` | Passed |
| UI-REQ-02 | FR-02, AC-02 | Route guard with no selected Requester | Requester-specific screen withheld and selector shown | `client/tests/lab-02/RequesterSelector.test.tsx` | Passed |
| UI-REQ-03 | FR-03, BR-06, AC-03 | Selection storage, shell identity, switching, and dirty-form confirmation | New identity stored/displayed; old data cleared; unsaved change confirmation works | `client/tests/lab-02/RequesterSelector.test.tsx` | Partial: storage, shell, switch, and Cancel passed; dirty-form confirmation is completed with Create Ticket |
| UI-REQ-04 | AC-04 | Empty Requester list and API failure | Correct distinct message; Continue disabled; Retry available only for failure | `client/tests/lab-02/RequesterSelector.test.tsx` | Passed |
| UI-CREATE-01 | FR-04-FR-06, AC-06 | Reference data, read-only values, valid submit, and success | DB reference options shown; generated fields non-editable; response Ticket Number/date displayed | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-CREATE-02 | BR-10-BR-14, AC-07 | Required, whitespace, and boundary field validation | Inline associated messages; API not called while invalid | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-CREATE-03 | FR-07, AC-08 | Busy and duplicate-submit behavior | Submit disabled with busy text; repeated activation creates one request | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-CREATE-04 | BR-16, BR-34, AC-09 | API/reference failure with retained values and Retry | Safe message shown; typed/selected values remain; retry works | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-CREATE-05 | BR-29, AC-11 | Ticket success with partial Attachment warning | Ticket Number remains visible; failed filenames and retry-from-detail action shown | `client/tests/lab-02/CreateTicket.test.tsx` | Planned |
| UI-LIST-01 | FR-08, AC-12 | Requester-owned list and switching behavior | A's rows/cards disappear after switching to B; B's result loads | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-LIST-02 | FR-09, AC-13 | Search, combined filters, clear filters, and page reset | Correct query sent; Clear restores controls; page returns to 1 | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-LIST-03 | FR-10, AC-14 | Sort, page size, pagination controls, loading, and invalid-query failure | Correct query/metadata rendered; boundaries disabled; safe error shown | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-LIST-04 | BR-23, AC-15 | Empty versus no-results states | Distinct messages and Create Ticket/Clear Filters actions | `client/tests/lab-02/MyTickets.test.tsx` | Planned |
| UI-DETAIL-01 | FR-11, AC-16 | Owned read-only Ticket Detail | Required values and Attachment metadata rendered with read-only treatment | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-DETAIL-02 | AC-17 | Not-found/ownership and unexpected failure states | Same safe not-found UI for protected/missing; unexpected failure offers Retry/Back | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |
| UI-ATT-01 | BR-25-BR-28, AC-10 | File selection type/size/count validation | Invalid filename identified; submit/upload blocked; valid selections retained | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-ATT-02 | FR-12, AC-18 | Valid upload state and success | Busy state blocks duplicate; filename/count update announced | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-ATT-03 | AC-19 | Five-active limit | Add control disabled with explanatory text | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-ATT-04 | FR-13, AC-20 | Active metadata and preview/download actions | Accessible controls shown for active file and safe original name rendered | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-ATT-05 | FR-14, AC-21 | Confirmation dialog, reason validation, focus, and success | Invalid reason blocked; valid removal updates item; focus returns correctly | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-ATT-06 | FR-15, AC-22 | Removed Attachment presentation | Audit metadata/Removed badge shown; content/removal controls unavailable | `client/tests/lab-02/AttachmentSection.test.tsx` | Planned |
| UI-STYLE-01 | AC-24 | Required Zen Green classes/tokens, editable/read-only styles, badges, and responsive representations | Approved tokens/classes and desktop-table/mobile-card elements present | `client/tests/lab-02/ZenGreenStyles.test.tsx` | Planned |
| UI-A11Y-01 | AC-25 | Labels, accessible names, focus semantics, live messages, and non-color indicators | Required semantic attributes/names exist and axe-style checks report no serious violations | `client/tests/lab-02/Accessibility.test.tsx` | Planned |
| UI-SCOPE-01 | Scope Excluded | Absence of later-lab controls | No Comments, Internal Notes, Actions Taken, status-change, or IT Staff controls rendered | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Planned |

### 3.4 End-to-End, Responsive, and Visual Tests

| Test ID | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final Status |
|---|---|---|---|---|---|
| E2E-01 | AC-02, AC-06, AC-18, AC-20, AC-21 | Main Requester lifecycle | Select Requester -> create Ticket -> find in My Tickets -> open detail -> upload/download -> soft-remove | `e2e/lab-02/requester-ticket-flow.spec.ts` | Planned |
| E2E-02 | AC-03, AC-12, AC-17, AC-23 | Multi-Requester switching and direct access protection | A's data disappears for B; direct Ticket/Attachment URLs/API access do not expose A's data | `e2e/lab-02/requester-ownership.spec.ts` | Planned |
| E2E-03 | AC-04, AC-09, AC-10, AC-15 | Selector/create/list failure and boundary evidence | Empty/failure/no-results/invalid-file/form-retention states behave as specified | `e2e/lab-02/requester-failure-states.spec.ts` | Planned |
| VIS-01 | AC-24 | Desktop screenshots at `1440x900` | Required screens/states captured with no visual checklist failure | `e2e/lab-02/responsive-visual.spec.ts` | Planned |
| VIS-02 | AC-24 | Tablet screenshots at `834x1112` | Required screens/cards captured with no page overflow or hidden action | `e2e/lab-02/responsive-visual.spec.ts` | Planned |
| VIS-03 | AC-24 | Mobile screenshots at `390x844` | Stacked screens/cards captured with readable labels/files and touch-friendly actions | `e2e/lab-02/responsive-visual.spec.ts` | Planned |
| E2E-A11Y-01 | AC-25 | Keyboard path and automated accessibility scan on required screens | Logical focus, operable controls/dialogs, visible focus, and no serious automated violations | `e2e/lab-02/accessibility.spec.ts` | Planned |

## 4. Acceptance-Criterion Traceability

| Acceptance Criterion | Planned Evidence |
|---|---|
| AC-01 | API-REF-01, UI-REQ-01 |
| AC-02 | UI-REQ-02, E2E-01 |
| AC-03 | UI-REQ-03, E2E-02 |
| AC-04 | API-REF-02, UI-REQ-04, E2E-03 |
| AC-05 | API-CTX-01 |
| AC-06 | UNIT-01, API-CREATE-01, UI-CREATE-01, E2E-01 |
| AC-07 | UNIT-02, API-CREATE-02, UI-CREATE-02 |
| AC-08 | API-CREATE-03, UI-CREATE-03 |
| AC-09 | API-CREATE-04, UI-CREATE-04, E2E-03 |
| AC-10 | UNIT-03, API-ATT-01, UI-ATT-01, E2E-03 |
| AC-11 | API-ATT-02, UI-CREATE-05 |
| AC-12 | API-LIST-01, UI-LIST-01, E2E-02 |
| AC-13 | UNIT-04, API-LIST-02, UI-LIST-02 |
| AC-14 | UNIT-04, API-LIST-03, UI-LIST-03 |
| AC-15 | API-LIST-04, UI-LIST-04, E2E-03 |
| AC-16 | API-DETAIL-01, UI-DETAIL-01 |
| AC-17 | API-DETAIL-02, UI-DETAIL-02, E2E-02 |
| AC-18 | API-ATT-03, UI-ATT-02, E2E-01 |
| AC-19 | API-ATT-04, UI-ATT-03 |
| AC-20 | API-ATT-05, UI-ATT-04, E2E-01 |
| AC-21 | API-ATT-06, UI-ATT-05, E2E-01 |
| AC-22 | API-ATT-07, UI-ATT-06 |
| AC-23 | API-ATT-08, E2E-02 |
| AC-24 | UI-STYLE-01, VIS-01, VIS-02, VIS-03 |
| AC-25 | UI-A11Y-01, E2E-A11Y-01 |

Every AC has planned evidence. Final file paths must be updated if implementation places a test elsewhere; the table must never point to a nonexistent final path.

## 5. Responsive and Visual Checklist

Complete this checklist against the final `lab2-staging` build and repeat the automated run on final `main`.

- [ ] Desktop Create Ticket, My Tickets, and Ticket Detail use the approved centered/multi-column layouts.
- [ ] Tablet forms use two columns where practical and Ticket cards/reduced layout avoid page overflow.
- [ ] Mobile fields stack, controls remain touch-friendly, and Ticket cards replace the wide table.
- [ ] No viewport has horizontal page scrolling.
- [ ] No label, error, button, pagination control, badge, or filename is clipped or overlaps another element.
- [ ] Editable and read-only fields remain visually distinct.
- [ ] Required asterisks and field-level errors appear beside the correct controls.
- [ ] Primary, secondary, tertiary, destructive, disabled, and busy buttons follow the approved hierarchy.
- [ ] Priority, New, Unassigned, and Removed badges include readable text and consistent styling.
- [ ] Loading, empty, no-results, validation, submitting, success, warning, and failure states match `ui-spec.md`.
- [ ] Keyboard focus is visible and follows logical order.
- [ ] Information and actions do not rely on color alone.
- [ ] Screenshots are readable without extreme zoom and stored under `artifacts/lab-02/screenshots/`.

## 6. Test Commands

Commands will be kept synchronized with final package scripts:

```powershell
# From the repository root
npm --prefix server test
npm --prefix client test

# After Playwright is configured at the repository root
npx playwright test
```

Database migration/seed and any test-database setup commands must be documented in README before final verification.

## 7. Final Results

### Feature #13 verification — 2026-08-31 (ICT)

On `feature/2-database-schema-seed`, the ticket-number regression tests first
failed against the original formatter: `100000` became `10000`, and subsequent
inserts collided. After the forward migration
`20260831040000_preserve_ticket_number_digits`:

- Server tests: **20 passed in 5 files**, including 8 PostgreSQL integration tests.
- TypeScript build and Prisma validation passed; all 3 migrations were applied
  on the existing development database, with no Prisma schema drift.
- The integration suite applied all migrations to an empty temporary schema,
  seeded twice without duplicates or changed identities, and verified boundary
  values, concurrent inserts, and database constraints.
- Existing development Category IDs/names, Ticket count, and sequence position
  were unchanged after migration/testing. No temporary test schemas remained.
- [PR #20](https://github.com/Kawi-HBLI/TokTickIT/pull/20) records the published
  commit SHA and review status for this verification.

These results cover the database feature only. Later API/UI/E2E work and the
final integrated Lab 2 verification below are still pending.

### Final integrated Lab 2 results

To be completed using copied final output from the actual commands:

| Suite | Command | Expected Final Evidence | Status |
|---|---|---|---|
| Server unit/API | `npm --prefix server test` | All Lab 1 and Lab 2 server tests pass | Not Run |
| Client UI/style | `npm --prefix client test` | All Lab 1 and Lab 2 client tests pass | Not Run |
| E2E/responsive | `npx playwright test` | All required flows and viewport projects pass | Not Run |
| Visual checklist | Manual inspection of generated screenshots | Every checklist item completed with paths recorded | Not Run |

Do not change a status to Pass until the command has run successfully on the named branch. Record the date, branch, commit SHA, test counts, and any relevant screenshot path with final results.

## 8. Known Limitations and Deferred Tests

The following are excluded scope, not missing Lab 2 tests:

- Real authentication, password, session/token, and role authorization tests are deferred to Lab 3.
- IT Staff queue, assignment, IT Priority change, and later Ticket-status transition tests are deferred.
- Public Comments, Internal Notes, Actions Taken, resolution, closing, reopening, and cancellation tests are deferred.

Any planned Lab 2 test that cannot be implemented must remain visible as a gap and cannot be relabeled as a deferred later-lab feature without updating the approved specification.
