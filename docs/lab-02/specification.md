# Lab 2 Sprint Engineering Specification

## 1. Sprint Goal

Deliver a responsive Requester-facing TokTickIT MVP that lets a selected Development Requester create an IT support ticket, find and inspect only their own tickets, and manage permitted attachments. The increment uses the Zen Green UI foundation and provides traceable automated and visual evidence for all approved behavior.

## 2. Stakeholder Request Interpretation

The IT department needs a usable Requester workflow before real authentication and IT Staff workflow are introduced. For Lab 2, a student selects one seeded Development Requester as the current testing context. That Requester can create tickets, search and browse My Tickets, open owned Ticket Details, and add, download, preview, or soft-remove permitted attachments. The application must preserve ownership boundaries, validate at both frontend and backend layers, store data in PostgreSQL, and remain usable on desktop, tablet, and mobile.

The Development Requester selector is a testing mechanism only. It does not provide authentication or security because the requester ID can be changed by the client. Real identity verification is deferred to Lab 3.

## 3. Scope

### Included

- Development Requester selection from active seeded Requesters, session-scoped selection, identity display, and Requester switching.
- Create Ticket with Category, Related System, Summary, Requested Priority, Description, and optional permitted attachments.
- Backend-generated immutable Ticket Number, backend-generated Ticket Date, initial `NEW` status, and timestamps.
- My Tickets with Requester ownership filtering, search, Category and Requested Priority filters, sorting, and server-side pagination.
- Read-only Requester Ticket Detail for an owned Ticket.
- Attachment metadata, upload, preview/download, and owner-initiated soft removal with a reason.
- Loading, empty, no-results, validation, submitting, success, and safe failure states.
- PostgreSQL/Prisma data increment and idempotent seed data.
- Zen Green reusable UI rules, responsive layouts, and accessibility behavior.
- Unit, API/integration, UI component/style, responsive, visual, and end-to-end tests.
- GitHub Issues, feature branches, staged Pull Requests, peer review, documentation, and release evidence.

### Excluded

- Real login/logout, passwords, password hashing, sessions, tokens, authenticated identities, and role-based authorization.
- IT Staff and Administrator dashboards, queues, ticket claiming, reassignment, and IT Priority changes.
- Ticket status changes beyond the initial `NEW` status.
- Public Comments, Internal Notes, Actions Taken, and event-history workflow.
- Resolving, closing, reopening, or cancelling tickets.
- Administration of users, roles, Requesters, Categories, or Related Systems.

## 4. Functional Requirements

- **FR-01 - Load Requesters:** The selector loads only active Development Requesters from PostgreSQL.
- **FR-02 - Select Requester:** A user must select a Development Requester before entering Requester-specific screens.
- **FR-03 - Switch Requester:** The current Requester is visible in the application shell and can be changed, causing Requester-specific data to reload.
- **FR-04 - Load Reference Data:** Create Ticket loads active Categories and Related Systems from the backend.
- **FR-05 - Create Ticket:** A selected Requester can submit valid Ticket information and optional permitted attachments.
- **FR-06 - Generate System Values:** The backend generates the official Ticket Number, Ticket Date, initial status, and timestamps.
- **FR-07 - Prevent Duplicate Submission:** The UI prevents repeated submission while a create request is processing.
- **FR-08 - List Owned Tickets:** My Tickets returns only Tickets owned by the selected Requester.
- **FR-09 - Search and Filter:** My Tickets supports search by Ticket Number or Summary and filters by Category and Requested Priority.
- **FR-10 - Sort and Paginate:** My Tickets supports approved sorting and server-side pagination.
- **FR-11 - View Ticket Detail:** A Requester can open a complete read-only view of an owned Ticket.
- **FR-12 - Add Attachment:** A Requester can add a permitted Attachment to an owned Ticket while fewer than five active Attachments exist.
- **FR-13 - Inspect Attachment:** A Requester can view metadata and preview or download an active owned Attachment.
- **FR-14 - Remove Attachment:** A Requester can confirm and soft-remove an active owned Attachment after entering a valid reason.
- **FR-15 - Preserve Removed Metadata:** Removed Attachment metadata remains visible, but its content cannot be previewed or downloaded.
- **FR-16 - Enforce Ownership:** Requester-owned Ticket and Attachment operations reject cross-Requester access without exposing protected data.
- **FR-17 - Handle UI States:** Each screen provides the loading, empty, no-results, validation, submitting, success, and failure states relevant to that screen.
- **FR-18 - Support Responsive Use:** Required workflows remain readable and operable at desktop, tablet, and mobile widths without horizontal page overflow.

## 5. Business Rules

### Requester Context

- **BR-01:** Lab 2 uses a Development Requester selector for testing only; it is not authentication.
- **BR-02:** `GET /api/requesters` is available before a Requester is selected and returns active Requesters only.
- **BR-03:** The selected Requester ID is stored in `sessionStorage`, so it survives page navigation and refresh in the same browser tab but is cleared when the tab session ends.
- **BR-04:** Requester-owned Ticket and Attachment endpoints use `x-requester-id` as the single Requester context. A `requesterId` supplied in a create/update request body is not accepted as an alternative identity source.
- **BR-05:** A missing, malformed, unknown, or inactive Requester context is rejected safely. An inactive Requester cannot enter the application or create, list, view, or manage Tickets.
- **BR-06:** Changing Requester clears Requester-specific cached results and reloads the destination screen. If Create Ticket contains unsaved changes, the UI asks for confirmation before discarding them.

### Ticket Creation and Validation

- **BR-07:** The backend generates an immutable, globally unique Ticket Number in the format `TKT-YYYY-NNNNN`, for example `TKT-2026-00001`. The numeric sequence is concurrency-safe and is padded to at least five digits; it does not reset each year.
- **BR-08:** A new Ticket starts with `currentStatus = NEW`; `itPriority` and `ticketOwner` are `null` in Lab 2.
- **BR-09:** Ticket Date, `createdAt`, and `updatedAt` are generated by the backend. Client-supplied values for these fields are ignored or rejected.
- **BR-10:** Summary is required, trimmed, and must contain 5-100 characters after trimming.
- **BR-11:** Description is required, trimmed, and must contain 10-2,000 characters after trimming.
- **BR-12:** Category and Related System are required and must reference active records.
- **BR-13:** Requested Priority is required and must be one of `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`. The UI defaults to `MEDIUM`, but the backend still validates the submitted value.
- **BR-14:** Frontend validation improves feedback but never replaces backend validation. Backend validation is authoritative.
- **BR-15:** While Ticket creation is processing, the Submit button is disabled and shows a busy state. The frontend generates one UUID `Idempotency-Key` per logical submission and reuses it when retrying that same submission. The backend stores a unique `(requesterId, idempotencyKey)` pair: repeating the same key and payload returns the original Ticket without creating another, while reusing the key with a different payload returns `409 Conflict`.
- **BR-16:** A validation failure or unexpected API failure does not clear valid text/select values. Invalid fields show field-level messages, and a safe form-level message is shown for non-field failures.

### Ownership, Listing, and Detail

- **BR-17:** Every Ticket belongs to exactly one Requester. List, detail, and Attachment queries always include the selected Requester's ID in the backend database condition.
- **BR-18:** A cross-Requester Ticket or Attachment lookup returns `404 Not Found`, the same as a missing resource, so the response does not disclose whether another Requester's resource exists.
- **BR-19:** Search is trimmed and case-insensitive and matches partial Ticket Number or Summary text.
- **BR-20:** Category and Requested Priority filters may be combined with search. Clearing filters restores the unfiltered first page.
- **BR-21:** Approved sort fields are `createdAt`, `updatedAt`, and `requestedPriority`. The default is `updatedAt desc`, followed by `ticketNumber desc` as a stable secondary sort. Priority order is `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` when descending.
- **BR-22:** Pagination is one-based. Allowed page sizes are 10, 20, and 50, with a default of 10. Invalid query parameters return `400 Bad Request`. A requested page beyond the last page returns an empty `data` array with accurate pagination metadata.
- **BR-23:** An owned Requester with no Tickets sees an empty state. A search/filter combination with no matches sees a separate no-results state and a Clear Filters action.
- **BR-24:** Ticket Detail is read-only in Lab 2 except for permitted Attachment actions.

### Attachments

- **BR-25:** Allowed file types are JPG/JPEG, PNG, WEBP, and PDF. The server validates the MIME type and normalized filename extension against the allowlist.
- **BR-26:** Maximum size is 5,242,880 bytes (5 MiB) per file, and a Ticket may have at most five active Attachments. Soft-removed Attachments do not count toward the active limit.
- **BR-27:** Original filenames are retained only as display metadata after removing path components and control characters. Stored filenames use generated UUIDs and are never exposed as server paths.
- **BR-28:** All selected files are validated before Ticket creation. An invalid file prevents submission and no Ticket is created.
- **BR-29:** If an unexpected storage failure occurs after the Ticket has been created, the Ticket remains valid. Successfully stored Attachments remain, incomplete file/metadata records are cleaned up, and the response/UI identifies failed filenames so the Requester can retry from Ticket Detail.
- **BR-30:** Soft removal requires explicit confirmation and a trimmed reason of 5-200 characters. The owner and removal timestamp are recorded. Removing an already removed Attachment returns `409 Conflict` without changing its original audit metadata.
- **BR-31:** Removed Attachment metadata remains visible with its original name, size, type, upload date, removal date, and reason. Stored filename/path is never returned.
- **BR-32:** Active owned files may be previewed or downloaded. Removed files return `410 Gone`; missing or cross-Requester files return `404 Not Found`.

### Failure and Evolution

- **BR-33:** Client-facing errors never contain stack traces, database details, filesystem paths, or raw internal exception messages.
- **BR-34:** Loading failures provide a Retry action where retrying is meaningful. Existing form values remain available after retryable failures.
- **BR-35:** Lab 3 may replace `x-requester-id` and `sessionStorage` with authenticated identity without changing Ticket ownership relationships.

## 6. UI Specification Summary

- **Theme:** Zen Green uses Primary Green `#006B3C`, Secondary Green `#0B7A46`, Pale Green `#EAF6EF`, background `#F5F7F6`, white surfaces, and dark charcoal-green text.
- **Application Shell:** Displays TokTickIT identity, My Tickets, Create Ticket, the current Development Requester, Change Requester, and a clear active-page indicator.
- **Requester Selector:** Provides initial, loading, ready, empty, and safe failure states and explicitly says it is not a login screen.
- **Create Ticket:** Distinguishes editable fields from backend-generated/read-only fields and provides validation, submitting, success-with-Ticket-Number, partial attachment warning, and failure-with-values-preserved states.
- **My Tickets:** Uses a table on desktop and compact cards on smaller screens, with search, filters, sort, pagination, clear filters, loading, empty, no-results, and failure states.
- **Ticket Detail:** Shows read-only Ticket data separately from active, uploading, invalid, removed, and unavailable Attachment states.
- **Responsive:** Desktop is `>= 992px`, tablet is `768-991px`, and mobile is `< 768px`. No layout may introduce horizontal page scrolling, clipped labels, overlapping messages, or hidden actions.
- **Accessibility:** Labels, visible keyboard focus, semantic headings, error associations, live status messages, non-color indicators, and accessible names for all controls are required.

Full presentation and interaction rules are defined in `docs/lab-02/ui-spec.md`.

## 7. Data Changes

### Models

- **RequesterUser:** `id`, `name`, `email` (unique), `department`, `isActive`, `createdAt`, `updatedAt`.
- **Category:** existing fields plus `isActive` and `updatedAt`.
- **RelatedSystem:** `id`, `name` (unique), `description`, `isActive`, `createdAt`, `updatedAt`.
- **Ticket:** `id`, `ticketNumber` (unique), `requesterId`, `idempotencyKey`, `categoryId`, `relatedSystemId`, `summary`, `description`, `requestedPriority`, `itPriority` (nullable), `currentStatus` (default `NEW`), `ticketOwner` (nullable), `createdAt`, `updatedAt`.
- **Attachment:** `id`, `ticketId`, `originalName`, `storedName` (unique), `mimeType`, `sizeBytes`, `isRemoved` (default `false`), `removalReason` (nullable), `removedAt` (nullable), `removedByRequesterId` (nullable), `createdAt`.

### Relationships and Constraints

- One Requester owns many Tickets; every Ticket belongs to one Requester.
- One Category and one Related System may each be referenced by many Tickets.
- One Ticket has many Attachments.
- Ticket Number, Requester email, Category name, Related System name, and Attachment stored name are unique. The pair `(requesterId, idempotencyKey)` is also unique.
- Foreign keys prevent orphaned Tickets. Deleting reference or Requester records is restricted; records are deactivated instead.
- Deleting a Ticket is outside Lab 2; Attachment history is therefore retained with the Ticket.

### Indexes

- `Ticket(requesterId, updatedAt)` supports the default My Tickets query.
- `Ticket(requesterId, idempotencyKey)` uniquely enforces duplicate-submission protection.
- `Ticket(requesterId, categoryId)` and `Ticket(requesterId, requestedPriority)` support ownership-scoped filters.
- `Attachment(ticketId, isRemoved)` supports active-count and detail queries.

### Database Decision Rationale

My Tickets always begins with ownership filtering, so indexes start with `requesterId` rather than indexing display fields alone. Ticket Number generation must use a PostgreSQL sequence or equivalent transactional counter rather than `count + 1`, because concurrent requests must not receive the same number.

### Seed Data

The seed is idempotent and includes:

- Four active Categories: Account and Access, Hardware, Software, and Network.
- At least six active Related Systems, including Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, and Corporate Laptop.
- At least four active Development Requesters.
- At least one inactive Development Requester that does not appear in the selector.

## 8. API Contract Summary

- `GET /api/requesters` - list active Development Requesters; no Requester context required.
- `GET /api/categories` - list active Categories.
- `GET /api/related-systems` - list active Related Systems.
- `POST /api/tickets` - create a validated Ticket for `x-requester-id`; body `requesterId` is not an identity source.
- `GET /api/tickets` - ownership-scoped search, filters, sorting, and pagination.
- `GET /api/tickets/:id` - retrieve one owned Ticket and Attachment metadata.
- `GET /api/tickets/:id/attachments` - retrieve owned Ticket Attachment metadata.
- `POST /api/tickets/:id/attachments` - add one or more permitted Attachments to an owned Ticket.
- `GET /api/attachments/:id/preview` - preview active owned image/PDF content inline.
- `GET /api/attachments/:id/download` - download active owned content.
- `DELETE /api/attachments/:id` - soft-remove an active owned Attachment with a reason.

Exact parameters, payloads, pagination metadata, validation errors, and status codes belong in `docs/lab-02/api-spec.md`. That document must be reconciled with this approved contract before implementation begins.

## 9. Acceptance Criteria

- **AC-01:** Given the selector loads successfully, when it is displayed, then only active Requesters from PostgreSQL are selectable and the screen states that it is not authentication.
- **AC-02:** Given no Requester is selected, when a Requester-specific route is opened, then the selector is shown instead of protected screen data.
- **AC-03:** Given Requester A is selected, when the user changes to Requester B, then the shell displays B and Requester-specific data is reloaded without A's data.
- **AC-04:** Given Requester loading fails or no active Requesters exist, when the selector is displayed, then it shows the correct safe failure or empty state and does not allow Continue.
- **AC-05:** Given an unknown or inactive Requester context, when a Requester-owned endpoint is called, then the request is rejected safely and no Ticket data is returned.
- **AC-06:** Given valid Ticket values, when Submit is activated, then exactly one Ticket is saved for the selected Requester with a backend-generated Ticket Number, backend Ticket Date, and status `NEW`.
- **AC-07:** Given invalid or whitespace-only field values, when the form is submitted, then field-level messages appear and no Ticket is created.
- **AC-08:** Given Ticket creation is processing or the same logical request is retried, when the same `Idempotency-Key` and payload reach the backend more than once, then the Submit action remains disabled in the UI and exactly one Ticket exists; reusing that key with a different payload returns `409 Conflict`.
- **AC-09:** Given Ticket creation fails unexpectedly, when the safe error is shown, then valid form values remain available for correction or retry.
- **AC-10:** Given any selected file is unsupported, oversized, or would exceed five active Attachments, when validation runs, then the invalid file is identified and the invalid operation is not stored.
- **AC-11:** Given Ticket creation succeeds but an unexpected Attachment storage operation fails, then the Ticket Number remains available, incomplete Attachment records/files are cleaned up, failed filenames are reported, and retry is available from Ticket Detail.
- **AC-12:** Given Requester A is selected, when My Tickets loads, then every returned Ticket belongs to A; after switching to B, A's Tickets are absent.
- **AC-13:** Given search and filters, when they are applied or cleared, then results match the documented case-insensitive rules and pagination returns to page 1.
- **AC-14:** Given an approved sort and valid page parameters, when My Tickets loads, then results and pagination metadata follow the documented stable order; invalid parameters return a safe validation error.
- **AC-15:** Given an owned Requester with no Tickets or a filter with no matches, when My Tickets loads, then the correct distinct empty or no-results state is shown.
- **AC-16:** Given an owned Ticket ID, when Ticket Detail opens, then complete Ticket information and active/removed Attachment metadata are displayed read-only.
- **AC-17:** Given a missing or differently owned Ticket ID, when detail is requested, then `404 Not Found` is returned and no protected Ticket data is exposed.
- **AC-18:** Given an owned Ticket with fewer than five active Attachments, when a valid file is uploaded, then its metadata is saved and it becomes available for preview/download.
- **AC-19:** Given five active Attachments, when another upload is attempted, then it is rejected and existing Attachments remain unchanged.
- **AC-20:** Given an active owned Attachment, when preview or download is requested, then the correct content and safe original filename are returned.
- **AC-21:** Given an active owned Attachment, when removal is confirmed with a valid reason, then removal metadata is saved and the item is displayed as removed.
- **AC-22:** Given a removed Attachment, when preview/download or repeated removal is attempted, then content access is blocked and original removal audit data remains unchanged.
- **AC-23:** Given a missing or differently owned Attachment, when metadata, upload, preview, download, or removal is requested, then `404 Not Found` is returned without ownership disclosure.
- **AC-24:** Given desktop, tablet, and mobile viewports, when each required screen is used, then there is no horizontal page overflow, clipping, overlap, hidden action, or unreadable filename.
- **AC-25:** Given keyboard or assistive-technology use, when navigating required workflows, then controls have accessible names, focus remains visible and logical, errors are associated with fields, and status changes are announced without relying on color alone.

## 10. Definition of Done

### Product Completion

- [ ] All approved FRs, BRs, and ACs are implemented without unapproved Lab 3 or IT Staff scope.
- [ ] Prisma schema, migration, indexes, constraints, and idempotent seed match this specification.
- [ ] API and UI behavior match the approved specification, `api-spec.md`, and `ui-spec.md`.
- [ ] Every AC maps to at least one planned test or required visual check in `tests.md`.
- [ ] Unit, API/integration, UI, style, responsive, and E2E tests pass from documented commands.
- [ ] No required test is skipped, disabled, commented out, or accepted while flaky.
- [ ] Ownership, validation, boundary, loading, empty, no-results, success, and failure cases are demonstrated.
- [ ] Desktop, tablet, and mobile screenshots pass the completed visual checklist.
- [ ] README setup, migration, seed, run, upload-storage, and test instructions are current.
- [ ] Final verification passes on `lab2-staging` and again on final `main`.

### Course Delivery

- [ ] Every implementation Issue uses one feature branch and a PR into `lab2-staging`.
- [ ] Every PR links its Issue, receives formal peer approval, and is merged by the reviewer rather than the author.
- [ ] Review comments receive written responses; requested changes use the same branch and `Fixing` workflow.
- [ ] Merged staging Issues are manually closed and moved to Done when GitHub does not auto-close them.
- [ ] `reviewer.md`, `ai-use.md`, final test evidence, screenshot artifacts, and README are complete.
- [ ] The release PR from `lab2-staging` to `main` is reviewed and merged by the peer reviewer.
- [ ] Exactly one concise PDF is submitted using headings `Answer Part 1` through `Answer Part 9` in order.

## 11. Assumptions and Decisions

1. Attachments are stored locally under `server/uploads/` for Lab 2. The directory is excluded from Git except for any required placeholder file.
2. UUID-based stored filenames prevent collisions and path traversal; original filenames are display-only metadata.
3. `sessionStorage` provides a temporary tab-scoped Requester selection and makes the future Lab 3 authentication boundary explicit.
4. Ownership failures use `404` consistently to avoid confirming another Requester's resource exists.
5. My Tickets pagination, search, filters, and sorting are server-side so large lists do not require loading every Ticket into the browser.
6. Ticket Number generation uses a concurrency-safe database mechanism and never relies on counting existing rows.

## 12. Issue Decomposition and Implementation Order

The sprint is divided by dependency and reviewable product increment. Each implementation Issue uses one feature branch and is completed sequentially after the previous Issue is approved and merged into `lab2-staging`. A GitHub Issue number is shown when that Issue has been created; later entries remain planned until their turn begins.

| Order | Planned Issue | Planned Branch | Depends On | Reason for Separation |
|---|---|---|---|---|
| 1 | #11 - Define Lab 2 sprint specification and test plan | `feature/1-spec-and-test-plan` | None | The engineering contract and planned evidence must be reviewed before implementation decisions become code. |
| 2 | Create Lab 2 database schema and seed data | `feature/2-database-schema-seed` | #11 | APIs require approved models, relationships, constraints, migration, and repeatable reference data. |
| 3 | Implement Development Requester context | `feature/3-requester-context` | Order 2 | Requester selection and ownership context must exist before Requester-owned Ticket workflows. |
| 4 | Implement Create Ticket workflow | `feature/4-create-ticket` | Order 3 | Ticket creation depends on Requester context and reference data and forms the first complete Ticket increment. |
| 5 | Implement My Tickets workflow | `feature/5-my-tickets` | Order 4 | Listing, search, filters, sorting, and pagination require persisted Tickets and ownership behavior. |
| 6 | Implement Ticket Detail and Attachment lifecycle | `feature/6-ticket-detail-attachments` | Order 5 | Detail and Attachment actions depend on owned Ticket retrieval and completed Ticket data. |
| 7 | Complete E2E, responsive verification, and release documentation | `feature/7-e2e-release-docs` | Orders 1-6 | Final cross-feature tests, screenshots, documentation, and release evidence are meaningful only after all increments are integrated. Unit, API, and UI tests are still written with their feature Issues rather than postponed to this Issue. |

Issue bodies must repeat their own scope, dependencies, acceptance criteria, planned test files, and Definition of Done. Actual GitHub Issue and PR links are recorded in `reviewer.md` as work progresses.
