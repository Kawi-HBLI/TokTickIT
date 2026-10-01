# Lab 3 - Peer Review Record

**Author:** Tanadet Nuchaikaew - 67070501081 - GitHub: @Kawi-HBLI

**Peer reviewer:** Songwit Rueangsawat - 67070501060 - GitHub: @R1NNE0

**Partner I reviewed:** Thanawat Suntarawattana - 67070501022 - GitHub: @Maibokdaimhai

Dates below are UTC. This record covers completed Issues #28-#35 and the pending Issue #45 documentation/regression follow-up. Local verification in `tests.md` is not a peer-review verdict.

## Pull Requests I authored (reviewed by my partner)

| PR / Issue | Branch | Reviewer | Verdict |
|---|---|---|---|
| [#36](https://github.com/Kawi-HBLI/TokTickIT/pull/36) / #28 | `feature/lab3-engineering-contract` | @R1NNE0 | Requested changes, then approved on 2026-09-15; merged into `lab3-staging` as `7393b45`. |
| [#37](https://github.com/Kawi-HBLI/TokTickIT/pull/37) / #29 | `feature/lab3-authentication-foundation` | @R1NNE0 | Requested changes, then approved on 2026-09-16; merged into `lab3-staging` as `fef5531`. |
| [#38](https://github.com/Kawi-HBLI/TokTickIT/pull/38) / #30 | `feature/lab3-requester-authorization` | @R1NNE0 | Requested changes, then approved on 2026-09-18; merged into `lab3-staging` as `47d3e6a`. |
| [#40](https://github.com/Kawi-HBLI/TokTickIT/pull/40) / #32 | `feature/lab3-it-staff-queue` | @R1NNE0 | Requested changes, then approved on 2026-09-19; merged into `lab3-staging` as `a565344`. |
| [#41](https://github.com/Kawi-HBLI/TokTickIT/pull/41) / #31 | `feature/lab3-authorization-requester` | @R1NNE0 | Approved on 2026-09-19; merged into `lab3-staging` as `02649cf`. |
| [#42](https://github.com/Kawi-HBLI/TokTickIT/pull/42) / #33 | `feature/lab3-staff-ticket-operations` | @R1NNE0 | Requested changes, then approved on 2026-09-19; merged into `lab3-staging` as `d9844eb`. |
| [#43](https://github.com/Kawi-HBLI/TokTickIT/pull/43) / #34 | `feature/lab3-admin-users` | @R1NNE0 | Requested changes, then approved on 2026-09-19; merged into `lab3-staging` as `19c6a14`. |
| [#44](https://github.com/Kawi-HBLI/TokTickIT/pull/44) / #35 | `feature/lab3-final-verification` | @R1NNE0 | Requested changes, then approved on 2026-09-21; merged into `lab3-staging` on 2026-09-25 as `cf6b681`. |
| [#46](https://github.com/Kawi-HBLI/TokTickIT/pull/46) / #45 | `feature/lab3-final-evidence-docs` | @R1NNE0 | Pending formal review/re-review; open and not merged. Privately shared checklist feedback is recorded below, not as a submitted GitHub verdict. |

PR [#39](https://github.com/Kawi-HBLI/TokTickIT/pull/39) was closed without merge because it linked the wrong Issue; PR #40 replaced it for Issue #32.

### Reviewer comments I received and how I responded

#### Contract consistency - PR #36, 2026-09-15

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/36#pullrequestreview-5206557885) for the resolution-indication lifecycle, Lab 2-compatible resource IDs, separation of product completion from delivery evidence, and two documentation references.
- **My response:** I [aligned the lifecycle rule](https://github.com/Kawi-HBLI/TokTickIT/pull/36#issuecomment-5676499375), clarified opaque positive-integer resource IDs, separated the two Definition-of-Done sections, and corrected the references.
- **Outcome:** The re-review found no remaining blocking issue and [approved](https://github.com/Kawi-HBLI/TokTickIT/pull/36#pullrequestreview-5206963550) the PR.

#### Migration completeness - PR #37, 2026-09-16

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/37#pullrequestreview-5225310083) for missing workflow persistence, representative seed data, retained requester compatibility, and a populated Lab 2 to Lab 3 regression test.
- **My response:** I [added the missing fields and fixtures](https://github.com/Kawi-HBLI/TokTickIT/pull/37#issuecomment-5701088071), permitted the transitional header in CORS, limited legacy requester lookup to active requesters, and added preservation coverage without modifying the original migration checksum.
- **Outcome:** The reviewer confirmed the blockers were addressed and [approved](https://github.com/Kawi-HBLI/TokTickIT/pull/37#pullrequestreview-5225640868) the PR.

#### Complete authentication scope - PR #38, 2026-09-17 to 2026-09-18

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/38) because `Closes #30` covered Login UI, mandatory first-login Change Password, client Logout, and frontend tests that the initial session migration had not yet delivered.
- **My response:** I [completed the frontend lifecycle, guards, component/E2E tests, and PR description](https://github.com/Kawi-HBLI/TokTickIT/pull/38#issuecomment-5725774077) so `Closes #30` matched the delivered scope.
- **Outcome:** The reviewer approved the completed increment; the PR was merged into `lab3-staging` as `47d3e6a`.

#### Queue evidence and forbidden state - PR #40, 2026-09-19

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/40) for missing style, responsive, accessibility, and E2E coverage, and for rendering `403` as a retryable generic error. The review also noted PR-description and pagination-envelope mismatches.
- **My response:** I [added the required tests, a distinct access-denied state, and description/documentation corrections](https://github.com/Kawi-HBLI/TokTickIT/pull/40#issuecomment-5742055735).
- **Outcome:** The reviewer approved after re-review; the PR was merged into `lab3-staging` as `a565344`.

#### Requester authorization workflow - PR #41, 2026-09-19

- **Review:** [@R1NNE0 approved](https://github.com/Kawi-HBLI/TokTickIT/pull/41) the Issue #31 implementation after scope clarification, stating that its acceptance criteria were met and only non-blocking observations remained. There was no formal Request Changes verdict on this PR.
- **My response:** I [acknowledged the review](https://github.com/Kawi-HBLI/TokTickIT/pull/41#issuecomment-5742599026); no corrective commit is recorded for this approval.
- **Outcome:** The approved PR was merged into `lab3-staging` as `02649cf`.

#### Assignment and attachment actions - PR #42, 2026-09-19

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/42) because the owner-unassignment sentinel prevented the confirmation dialog from opening, while relative attachment URLs targeted the frontend server. The reviewer also requested regression coverage.
- **My response:** I [separated pending assignment from explicit unassignment, used credentialed attachment helpers, and added tests](https://github.com/Kawi-HBLI/TokTickIT/pull/42#issuecomment-5743374234).
- **Outcome:** The reviewer approved the corrections; the PR was merged into `lab3-staging` as `d9844eb`.

#### Administrator invariants - PR #43, 2026-09-19

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/43#pullrequestreview-5256782415) because initial-password and reset behaviour did not match the contract, role changes did not revoke sessions, owner tickets were not safely unassigned, and administrator safety/validation rules were incomplete.
- **My response:** I [reworked the contract implementation](https://github.com/Kawi-HBLI/TokTickIT/pull/43#issuecomment-5744405566): administrator-supplied validated initial passwords, reset-session revocation, atomic owner unassignment, last-admin protection, optimistic locking, and removal of out-of-scope department handling.
- **Outcome:** The follow-up review found the blockers resolved and [approved](https://github.com/Kawi-HBLI/TokTickIT/pull/43#pullrequestreview-5257042510) the PR.

#### Verification evidence - PR #44, 2026-09-20 to 2026-09-21

- **Review:** [@R1NNE0 requested changes](https://github.com/Kawi-HBLI/TokTickIT/pull/44#pullrequestreview-5261700980) because `tests.md` still reported planned tests although the PR reported verification, and the migration integration tests had been skipped.
- **My response:** I [ran the migration integration checks and updated the evidence](https://github.com/Kawi-HBLI/TokTickIT/pull/44#issuecomment-5763240344), while leaving `REG-L2-01` explicitly Partial because the Lab 2 E2E suite was not rerun in that PR.
- **Outcome:** The reviewer confirmed the evidence and executing migration checks, then [approved](https://github.com/Kawi-HBLI/TokTickIT/pull/44#pullrequestreview-5270521975) the PR.

#### Candidate visual checklist - PR #46, pending formal review

- **Feedback:** The reviewer privately requested completion of `tests.md` Section 7 with actual screenshot observations and evidence paths, rather than treating screenshot existence as a completed inspection. They also suggested recording this PR, excluding unintended local database overrides, and distinguishing current captures from older retained files. No formal GitHub review submission was recorded when this follow-up was prepared on 2026-10-01.
- **Correction:** I inspected the candidate screenshots, corrected the visual/keyboard gaps uncovered by that inspection, added long-account and mobile-dialog evidence, completed the nine candidate checks with supporting paths, and kept final-main, physical zoom, and screen-reader checks explicitly pending. The PR changed-file list does not include `docker-compose.override.yml`.
- **Outcome:** Local verification is recorded in `tests.md` Section 6.2. Formal re-review, approval and staging merge remain pending; this record does not claim they occurred.

## Pull Requests I reviewed for my partner

| PR | Branch / Title | Verdict |
|---|---|---|
| [Maibokdaimhai/TokTickIT #34](https://github.com/Maibokdaimhai/TokTickIT/pull/34) | `feature/lab3-spec-and-tests` - docs(lab-03): define Sprint 3 engineering contract and test plan | Requested changes, then approved by @Kawi-HBLI on 2026-09-13; merged into `lab3-staging` as `1f2ab29`. |
| [Maibokdaimhai/TokTickIT #35](https://github.com/Maibokdaimhai/TokTickIT/pull/35) | `refactor/lab3-backend-layers` - refactor(server): establish layered backend architecture for Lab 3 | Requested changes, then approved by @Kawi-HBLI on 2026-09-14; merged into `lab3-staging` as `352663d`. |
| [Maibokdaimhai/TokTickIT #36](https://github.com/Maibokdaimhai/TokTickIT/pull/36) | `feature/lab3-authentication` - Feature/lab3 authentication | Approved by @Kawi-HBLI on 2026-09-15; merged into `lab3-staging` as `4275095`. |
| [Maibokdaimhai/TokTickIT #37](https://github.com/Maibokdaimhai/TokTickIT/pull/37) | `feature/lab3-authorization-requester` - feat(authz): enforce requester ownership and role access | Requested changes, then approved by @Kawi-HBLI on 2026-09-16; merged into `lab3-staging` as `99470c2`. |
| [Maibokdaimhai/TokTickIT #38](https://github.com/Maibokdaimhai/TokTickIT/pull/38) | `feature/lab3-staff-queue` - feat(queue): implement IT staff ticket queue and eligible owners API | Requested changes, then approved by @Kawi-HBLI on 2026-09-17; merged into `lab3-staging` as `4885311`. |
| [Maibokdaimhai/TokTickIT #39](https://github.com/Maibokdaimhai/TokTickIT/pull/39) | `feature/lab3-staff-ticket-operations` - feat(staff): implement ticket operations and communication | Requested changes, then approved by @Kawi-HBLI on 2026-09-18; merged into `lab3-staging` as `3dad8db`. |
| [Maibokdaimhai/TokTickIT #40](https://github.com/Maibokdaimhai/TokTickIT/pull/40) | `feature/lab3-admin-users` - feat(admin): implement administrator user management | Approved by @Kawi-HBLI on 2026-09-18; merged into `lab3-staging` as `54bf902`. |
| [Maibokdaimhai/TokTickIT #41](https://github.com/Maibokdaimhai/TokTickIT/pull/41) | `test/lab3-e2e-and-evidence` - test(lab-03): add E2E workflows and responsive evidence | Approved by @Kawi-HBLI on 2026-09-19; merged into `lab3-staging` as `f5afcce`. |
| [Maibokdaimhai/TokTickIT #42](https://github.com/Maibokdaimhai/TokTickIT/pull/42) | `docs/lab3-final-evidence-release` - docs(lab-03): finalize evidence and Sprint 3 release documentation | Approved by @Kawi-HBLI on 2026-09-20; merged into `lab3-staging` as `d70b65f`. |
| [Maibokdaimhai/TokTickIT #43](https://github.com/Maibokdaimhai/TokTickIT/pull/43) | `lab3-staging` - release(lab-03): integrate Sprint 3 into main | Approved by @Kawi-HBLI on 2026-09-20; merged into `main` as `6fd2488`. |

### Comments I made on my partner's PRs and how they responded

#### Contract gaps - partner PR #34, 2026-09-12 to 2026-09-13

- **My review:** I [requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/34#pullrequestreview-5187133120) to document required seed accounts and representative records, define the staff eligible-owner source, and define staff/admin attachment access.
- **Partner's response:** They [added seed verification, `GET /api/staff/eligible-owners`, and read-only staff/admin attachment rules](https://github.com/Maibokdaimhai/TokTickIT/pull/34#issuecomment-5647351720).
- **Outcome:** I [approved](https://github.com/Maibokdaimhai/TokTickIT/pull/34#pullrequestreview-5190674513) after checking that the revised contracts and planned coverage matched.

#### Attachment error handling - partner PR #35, 2026-09-14

- **My review:** I [requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/35#pullrequestreview-5193588868) so unexpected errors retained safe server diagnostics and download headers were not committed before a file stream opened.
- **Partner's response:** They [preserved diagnostic cause information and handled stream-open/read failures before attachment headers](https://github.com/Maibokdaimhai/TokTickIT/pull/35#issuecomment-5658605339), with regression coverage.
- **Outcome:** I [approved](https://github.com/Maibokdaimhai/TokTickIT/pull/35#pullrequestreview-5193727121) after the correction.

#### Scope-aware authentication review - partner PR #36, 2026-09-15

- **My review:** I [approved the authentication increment](https://github.com/Maibokdaimhai/TokTickIT/pull/36#pullrequestreview-5206517969) for its tracked Issue #27 scope, noting that server-derived requester ownership and endpoint authorization belonged to Issue #28. There was no Request Changes verdict on this PR.
- **Partner's response:** The partner acknowledged the approval; no corrective change was requested in this review.
- **Outcome:** The PR was merged into `lab3-staging` as `4275095`.

#### Requester resource privacy - partner PR #37, 2026-09-16

- **My review:** I [requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/37#pullrequestreview-5221287688) because differing 404 messages could distinguish another requester's ticket from a nonexistent ticket.
- **Partner's response:** They [returned one identical `NOT_FOUND` response](https://github.com/Maibokdaimhai/TokTickIT/pull/37#issuecomment-5696932751) for upload, download, metadata, and removal, and added full-response comparisons.
- **Outcome:** I approved after re-review; the PR was merged into `lab3-staging` as `99470c2`.

#### Out-of-range queue pagination - partner PR #38, 2026-09-17

- **My review:** I [requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/38) because a page with `tickets: []` and `pagination.totalItems > 0` was shown as an empty result with no pagination controls, leaving no route back to a valid page.
- **Partner's response:** They [kept a recovery message and page controls visible, then added a UI regression test](https://github.com/Maibokdaimhai/TokTickIT/pull/38#issuecomment-5711018638).
- **Outcome:** I approved after re-review; the PR was merged into `lab3-staging` as `4885311`.

#### Protected-route synchronization - partner PR #39, 2026-09-18

- **My review:** I [requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/39) because an unauthenticated protected-route redirect updated the browser URL but left React's pathname stale, producing incorrect post-login routing.
- **Partner's response:** They [synchronized history and pathname for redirects and added role-based routing regression tests](https://github.com/Maibokdaimhai/TokTickIT/pull/39#issuecomment-5726310811).
- **Outcome:** I approved after re-review; the PR was merged into `lab3-staging` as `3dad8db`.

#### Administrator user management - partner PR #40, 2026-09-18

- **My review:** I [approved](https://github.com/Maibokdaimhai/TokTickIT/pull/40) the administrator-only routes, last-active-admin protection, session revocation, owner unassignment, responsive UI, and reported server/client/build verification. There was no Request Changes verdict on this PR.
- **Partner's response:** The partner acknowledged the approval; no corrective change was requested in this review.
- **Outcome:** The PR was merged into `lab3-staging` as `54bf902`.

#### E2E and visual evidence - partner PR #41, 2026-09-19

- **My review:** I [approved](https://github.com/Maibokdaimhai/TokTickIT/pull/41) after checking the reported E2E, API, client, and build results, database safety/cleanup, mobile layout, and 43 responsive screenshots. There was no Request Changes verdict on this PR.
- **Partner's response:** The partner acknowledged the approval; no corrective change was requested in this review.
- **Outcome:** The PR was merged into `lab3-staging` as `f5afcce`.

#### Final documentation and evidence - partner PR #42, 2026-09-20

- **My review:** I [approved](https://github.com/Maibokdaimhai/TokTickIT/pull/42) the final Lab 3 documentation, traceability, AI-use reflection, E2E record, and screenshot inventory, with final-main verification correctly left pending. There was no Request Changes verdict on this PR.
- **Partner's response:** The partner acknowledged the approval; no corrective change was requested in this review.
- **Outcome:** The PR was merged into `lab3-staging` as `d70b65f`.

#### Release integration - partner PR #43, 2026-09-20

- **My review:** I [approved](https://github.com/Maibokdaimhai/TokTickIT/pull/43) integration of the previously reviewed `lab3-staging` history into `main`, with no merge conflict or unrelated change reported. There was no Request Changes verdict on this PR.
- **Partner's response:** The partner acknowledged the approval; no corrective change was requested in this review.
- **Outcome:** The PR was merged into `main` as `6fd2488`.
