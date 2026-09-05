# Lab 2 — Peer Review Record

**Author:** Tanadet Nuchaikaew — 67070501081 — GitHub: @Kawi-HBLI
**Peer reviewer:** Songwit Rueangsawat — 67070501060 — GitHub: @R1NNE0, Sitthichai Phirompan — 67070501074 — GitHub: @Bank848
**Partner I reviewed:** Thanawat Suntarawattana — 67070501022 — GitHub: @Maibokdaimhai

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer | Verdict |
|----|--------|----------|---------|
| [#12](https://github.com/Kawi-HBLI/TokTickIT/pull/12) | feature/1-spec-and-test-plan | @R1NNE0 | Approved on 2026-08-30; merged by @R1NNE0 into lab2-staging as `21e20fd` |
| [#20](https://github.com/Kawi-HBLI/TokTickIT/pull/20) | feature/2-database-schema-seed | @R1NNE0 | Approved on 2026-09-02; merged into lab2-staging as `51fa6ce` |
| [#21](https://github.com/Kawi-HBLI/TokTickIT/pull/21) | feature/3-requester-context | @R1NNE0 | Approved on 2026-09-04 (ICT); merged into lab2-staging as `19f8bfb` |
| [#22](https://github.com/Kawi-HBLI/TokTickIT/pull/22) | feature/4-create-ticket | @R1NNE0 | Approved on 2026-09-04; merged by @R1NNE0 into lab2-staging as `7d3f9b8` |
| [#23](https://github.com/Kawi-HBLI/TokTickIT/pull/23) | feature/5-my-tickets | @R1NNE0 | Approved on 2026-09-04; merged by @R1NNE0 into lab2-staging as `b8d5dad` |
|    | feature/6-ticket-detail-attachments | | |
|    | feature/7-e2e-release-docs | | |
|    | lab2-staging ➔ main | | |

### Reviewer comments I received and how I responded
- **PR #12:** [Review by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/12#pullrequestreview-5060922044) approved the specification, test traceability, and UI/API contracts. The reviewer recommended creating the remaining Issues on the project board and recording this review after merge.
- **My response:** [Reply](https://github.com/Kawi-HBLI/TokTickIT/pull/12#issuecomment-5468970735) confirmed that all seven Lab 2 Issues had been created with their implementation order and dependencies documented, and stated that this review would be recorded after merge.
- **Outcome:** The reviewer merged PR #12 on 2026-08-30 at 22:46 ICT. This entry records the review after merge; later PR verdicts remain blank until their reviews occur.
- **PR #20:** [Review by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/20#pullrequestreview-5069973864) approved the Lab 2 database foundation, including the corrected migration sequence, idempotent seed behavior, and the verified server test suite.
- **Outcome:** PR #20 was merged into `lab2-staging` as `51fa6ce` on 2026-09-02. The next feature branch was created from that merged staging state.
- **PR #21:** [Review by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/21) formally approved the Requester context at 01:40 ICT on 2026-09-04, covering header validation, selector/session behavior, test results, and documentation.
- **Outcome:** PR #21 was merged into `lab2-staging` at 14:13 ICT on 2026-09-04 as `19f8bfb`. Create Ticket starts from this merged state.
- **PR #22:** [Review by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/22) approved the Create Ticket implementation, including the authoritative ticket number generation, multipart upload handling, atomic validation, client dirty-form guards, and full test suite.
- **Outcome:** PR #22 was merged by @R1NNE0 into `lab2-staging` as `7d3f9b8` on 2026-09-04. My Tickets starts from this merged staging state.
- **PR #23:** [Review by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/23) requested resolving race conditions where stale queries overwrite newer results, clarifying API error codes (`INVALID_QUERY`, `TICKET_LIST_FAILED`), and preserving active search/filters when retrying categories.
- **My response:** Fixed query-state transitions to ignore obsolete results, updated server endpoints with exact `INVALID_QUERY` / `TICKET_LIST_FAILED` error envelopes and test assertions, and retained all other filters during category reload.
- **Outcome:** PR #23 was approved and merged by @R1NNE0 into `lab2-staging` as `b8d5dad` on 2026-09-04. Feature #18 starts from this merged staging state. Later PR verdicts remain blank until their reviews occur.

## Pull Requests I reviewed for my partner

| PR | Branch / Title | Verdict |
|----|----------------|---------|
| [Maibokdaimhai/TokTickIT #16](https://github.com/Maibokdaimhai/TokTickIT/pull/16) | `feature/lab2-spec-and-tests` — docs: add Sprint 2 engineering specification and test plan | Requested changes twice, then approved by @Kawi-HBLI on 2026-08-30; merged into `lab2-staging` as `da77a6c` |
| [Maibokdaimhai/TokTickIT #17](https://github.com/Maibokdaimhai/TokTickIT/pull/17) | `feature/lab2-requester-context` — feat: Development Requester Context & Database Seed | Requested changes twice, then approved by @Kawi-HBLI on 2026-08-31; merged into `lab2-staging` as `9b5e69e` |
| [Maibokdaimhai/TokTickIT #18](https://github.com/Maibokdaimhai/TokTickIT/pull/18) | `feature/lab2-ticket-creation` — feat: Create Ticket API, Form, and Validation | Requested changes twice, then approved by @Kawi-HBLI on 2026-09-04; merged into `lab2-staging` as `3ed1d03` |
| [Maibokdaimhai/TokTickIT #19](https://github.com/Maibokdaimhai/TokTickIT/pull/19) | `feature/lab2-my-tickets` — feat: My Tickets List, Search, Filters, and Pagination | Requested changes, then approved by @Kawi-HBLI on 2026-09-04; merged into `lab2-staging` as `ee7ee47` |
| [Maibokdaimhai/TokTickIT #20](https://github.com/Maibokdaimhai/TokTickIT/pull/20) | `feature/lab2-ticket-detail-and-attachments` — feat: Ticket Detail Screen & Soft Attachment Lifecycle | Requested changes, then approved by @Kawi-HBLI on 2026-09-04; merged into `lab2-staging` as `2534ce5` |

### Comments I made on my partner's PRs and how they responded

#### Partner PR #16 — Spec-DD review, 2026-08-30

- **First review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/16#pullrequestreview-5060765252):** I asked my partner to replace unsupported `Pass`/`100% Pass` claims with planned or pending statuses, resolve conflicting ticket-number rules, define initial attachment failure handling, complete the API schemas and ownership rules, and correct missing or incorrect AC/test mappings.
- **[Partner's first response](https://github.com/Maibokdaimhai/TokTickIT/pull/16#issuecomment-5468876320):** They reported changing the test statuses to `Planned`/`Pending (Not Run)`, choosing annual sequential `TKT-YYYY-XXXXXX` numbering, expanding the API contract, and adding sorting, empty/no-results, and accessibility coverage.
- **Second review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/16#pullrequestreview-5060937088):** I acknowledged those updates but asked how BR-16's atomic creation requirement would work when ticket creation accepts JSON and attachments use separate multipart requests. I requested an explicit creation sequence, failure/rollback behavior, and a planned rollback test.
- **[Partner's second response](https://github.com/Maibokdaimhai/TokTickIT/pull/16#issuecomment-5469018310):** They documented a two-step flow: create the ticket, then upload initial attachments. Their proposed compensation uses `DELETE /api/tickets/:id?requesterId=X` to remove the draft ticket and saved files after an upload failure. They also added planned test `API-11`, mapped to `BR-16` and `AC-15`.
- **Final review — [Approve](https://github.com/Maibokdaimhai/TokTickIT/pull/16#pullrequestreview-5060969913):** I approved the revised Spec-DD documents at 20:43 ICT, noting the updated requirements, API/UI contracts, AC traceability, and planned rollback coverage. My partner [acknowledged the approval](https://github.com/Maibokdaimhai/TokTickIT/pull/16#issuecomment-5469049129). The PR was merged at 20:45 ICT.

#### Partner PR #17 — Requester Context & Database Seed, 2026-08-31

- **First review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/17#pullrequestreview-5065504039):** Manual testing revealed that cancelling requester selection left stale state enabled if reopened during API errors, inactive saved requesters caused silent UI desync, and API tests left dirty test users in the database. I requested disabled submission on errors, active requester validation, database test cleanup, and regression tests.
- **[Partner's first response](https://github.com/Maibokdaimhai/TokTickIT/pull/17#issuecomment-5477242769):** They reset modal draft state on open, disabled the Continue button during error or empty states, added fallback to the first active requester, cleaned up test data in `afterAll`, and added regression tests.
- **Second review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/17#pullrequestreview-5065668760):** I noted that on page reload, cached inactive requesters were still loaded without validation unless the modal was manually opened. I asked for automatic validation on startup, clearing invalid cached state, and opening the modal automatically.
- **[Partner's second response](https://github.com/Maibokdaimhai/TokTickIT/pull/17#issuecomment-5478336519):** They updated `RequesterProvider` startup `useEffect` to validate cached credentials against `/api/requesters`, clearing invalid localStorage and prompting the selector modal immediately, supported by a startup regression test.
- **Final review — [Approve](https://github.com/Maibokdaimhai/TokTickIT/pull/17#pullrequestreview-5066528802):** Approved after verifying startup validation, cleanup, and 8/8 client + 4/4 server tests passing. Merged into `lab2-staging` as `9b5e69e`.

#### Partner PR #18 — Create Ticket API, Form, and Validation, 2026-09-02 to 2026-09-04

- **First review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/18#pullrequestreview-5088295384):** I flagged three defects: initial attachments were only collected in state but never submitted via API with no rollback on failure (violating BR-16/AC-15), ticket-number generation was vulnerable to concurrency collisions, and numeric IDs lacked integer validation (causing 500 errors on fractional IDs).
- **[Partner's first response](https://github.com/Maibokdaimhai/TokTickIT/pull/18#issuecomment-5537696481):** They implemented post-creation sequential attachment uploads with compensation rollback, wrapped ticket number generation in PostgreSQL advisory transaction locks (`pg_advisory_xact_lock`), and enforced strict integer ID validation with automated tests.
- **Second review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/18#pullrequestreview-5110815247):** I pointed out that when both upload and compensation rollback fail, the rollback error was swallowed while the UI claimed "The draft ticket was rolled back," risking duplicate ticket creation on retry. I requested distinguishing cleanup failure, retaining draft ticket details, and adding a dual-failure regression test.
- **[Partner's second response](https://github.com/Maibokdaimhai/TokTickIT/pull/18#issuecomment-5537958671):** They caught `rollbackErr` in the UI, rendered an explicit recovery banner with the retained draft ticket ID and number warning against duplicate submission, and added a dual-failure regression test in `CreateTicket.test.tsx`.
- **Final review — [Approve](https://github.com/Maibokdaimhai/TokTickIT/pull/18#pullrequestreview-5110949423):** Approved after verifying recovery banners, preserved form fields, and 15/15 client + 14/14 server tests passing. Merged into `lab2-staging` as `3ed1d03`.

#### Partner PR #19 — My Tickets List, Search, Filters, and Pagination, 2026-09-04

- **First review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/19#pullrequestreview-5111535812):** I identified race conditions where delayed responses from a previous requester identity could overwrite a newly selected requester's list, and observed that switching requesters from a higher page (e.g. page 2) did not reset to page 1, resulting in empty states.
- **[Partner's response](https://github.com/Maibokdaimhai/TokTickIT/pull/19#issuecomment-5538889302):** They integrated `AbortController` signal cancellation in `fetchMyTickets` and discarded stale out-of-order responses, added identity tracking to automatically reset pagination to page 1 upon changing requesters, and added regression tests for both cases.
- **Final review — [Approve](https://github.com/Maibokdaimhai/TokTickIT/pull/19#pullrequestreview-5111765833):** Approved after verifying cancelled in-flight requests, page reset behavior, and 23/23 client + 20/20 server tests passing. Merged into `lab2-staging` as `ee7ee47`.

#### Partner PR #20 — Ticket Detail Screen & Soft Attachment Lifecycle, 2026-09-04

- **First review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/20#pullrequestreview-5112544828):** An attachment with a Thai/UTF-8 filename (such as `หลักฐาน.pdf`) saved successfully with HTTP 201, but downloading it triggered HTTP 500 because unencoded Unicode characters were inserted directly into the `Content-Disposition` header. I requested RFC 6266 / RFC 5987 formatting with an ASCII fallback and regression tests.
- **[Partner's response](https://github.com/Maibokdaimhai/TokTickIT/pull/20#issuecomment-5540081068):** They implemented `formatContentDisposition` using ASCII fallback `filename="..."` and RFC 5987 `filename*=UTF-8''...`, added Latin-1 to UTF-8 multipart decoding, and added regression test `attachments.api.test.ts` for Thai filename upload/download.
- **Final review — [Approve](https://github.com/Maibokdaimhai/TokTickIT/pull/20#pullrequestreview-5112664138):** Approved after confirming clean Unicode filename downloads without Node HTTP parser crashes and 35 server + 29 client tests passing. Merged into `lab2-staging` as `2534ce5`.
