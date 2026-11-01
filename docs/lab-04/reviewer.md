# Lab 4 - Peer Review Record

**Author:** Tanadet Nuchaikaew - 67070501081 - GitHub: @Kawi-HBLI
**Peer reviewer:** Songwit Rueangsawat - 67070501060 - GitHub: @R1NNE0
**Partner I reviewed:** Thanawat Suntarawattana - 67070501022 - GitHub: @Maibokdaimhai

Last checked against GitHub on 2026-10-31. Dates below are UTC. This record follows the Lab 2 format: authored PRs, received feedback and responses, then partner PRs and the feedback I gave. Test figures describe the historical review or execution named in each entry; this documentation update does not claim new test executions.

## Pull Requests I authored (reviewed by my partner)

| PR / Work package | Branch | Verdict |
|----|--------|---------|
| [#52 - Issue #48: contract and test plan](https://github.com/Kawi-HBLI/TokTickIT/pull/52) | `feature/lab4-engineering-contract` | Approved on 2026-10-27; merged into `lab4-staging` as `70d865d` on 2026-10-27 |
| [#53 - Issue #49: Actions Taken and workflow](https://github.com/Kawi-HBLI/TokTickIT/pull/53) | `feature/lab4-actions-workflow` | Approved on 2026-10-28; merged into `lab4-staging` as `46d54ae` on 2026-10-28 |
| [#54 - Issue #50: role dashboards](https://github.com/Kawi-HBLI/TokTickIT/pull/54) | `feature/lab4-dashboards` | Approved on 2026-10-28; merged into `lab4-staging` as `d5c2e2a` on 2026-10-29 |
| [#55 - Issue #51: regression and delivery evidence](https://github.com/Kawi-HBLI/TokTickIT/pull/55) | `feature/lab4-final-verification` | Approved on 2026-10-29; merged into `lab4-staging` as `1196812` on 2026-10-29 |
| [#56 - release to main](https://github.com/Kawi-HBLI/TokTickIT/pull/56) | `lab4-staging` | Approved on 2026-10-29; merged into `main` as `50f4ac5` on 2026-10-30 |
| [#57 - mobile E2E and review-record follow-up](https://github.com/Kawi-HBLI/TokTickIT/pull/57) | `feature/lab4-mobile-a11y-readiness` | Ready for review; @R1NNE0 requested; no formal verdict or merge yet |

Issues [#48](https://github.com/Kawi-HBLI/TokTickIT/issues/48), [#49](https://github.com/Kawi-HBLI/TokTickIT/issues/49), [#50](https://github.com/Kawi-HBLI/TokTickIT/issues/50), and [#51](https://github.com/Kawi-HBLI/TokTickIT/issues/51) are closed. PR #57 is a follow-up to the completed Lab 4 milestone and remains pending peer approval.

### Reviewer comments I received and how I responded

#### PR #52 - Engineering contract and test plan

- **Review:** [Approval by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/52#pullrequestreview-5667313453) covered the engineering contract and suggested clarifying inverse Prisma relations, testing an empty cancellation reason in the UI, and covering Cancelled Tickets and action edits. These were non-blocking suggestions.
- **My response:** [Acknowledged the review](https://github.com/Kawi-HBLI/TokTickIT/pull/52#issuecomment-6442371988). The feature implementation followed in PR #53.
- **Outcome:** Approved and merged into `lab4-staging` as `70d865d` on 2026-10-27.

#### PR #53 - Actions Taken and gated Ticket workflow

- **Review:** [Approval by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/53#pullrequestreview-5683407822) covered the Action lifecycle, resolution gate, Ticket row locking, append-only history, authorization, and conflict recovery. The reviewer suggested documenting the implemented `snapshot JSONB` history, adding a database idempotency uniqueness constraint, and avoiding no-op history entries.
- **My response:** [Confirmed readiness to merge](https://github.com/Kawi-HBLI/TokTickIT/pull/53#issuecomment-6470351845). The snapshot contract was aligned in PR #55. The uniqueness and no-op ideas were non-blocking suggestions; this record does not mark them as implemented.
- **Verification limit and outcome:** The reviewer inspected source and test coverage without independently running tests because the review database could not be safely verified. PR #53 was approved and merged as `46d54ae` on 2026-10-28.

#### PR #54 - Role dashboards and filtered navigation

- **Review:** [Approval by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/54#pullrequestreview-5689743543) covered metrics, UTC date boundaries, authorization, requester isolation, navigation, responsive behavior, and test coverage. The suggestions were to optimize the Requester activity query and align FR-17 with the five-ticket preview.
- **My response:** [Acknowledged the review](https://github.com/Kawi-HBLI/TokTickIT/pull/54#issuecomment-6487376239). PR #55 aligned the preview contract: five workload/unassigned Tickets and ten recent Actions. Query optimization remained optional.
- **Verification limit and outcome:** The review used source and test-code analysis without independently executing tests or builds. PR #54 was approved and merged as `d5c2e2a` on 2026-10-29.

#### PR #55 - Final regression, recovery, and delivery evidence

- **Review:** [Approval by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/55#pullrequestreview-5701386137) covered regression, concurrency, dashboard performance, PostgreSQL recovery, accessibility, and saved evidence. The reviewer suggested checking the specific 422 error code and final database Ticket status in `TEST-CONC-02`.
- **My response:** [Acknowledged the review](https://github.com/Kawi-HBLI/TokTickIT/pull/55#issuecomment-6502693871). The stronger concurrency assertions were a non-blocking suggestion, not a condition of approval.
- **Verification limit and outcome:** The reviewer inspected source, test definitions, and saved artifacts without independently rerunning tests or benchmarks. PR #55 was approved and merged as `1196812` on 2026-10-29, completing Issue #51. The checkpoint recovery used disposable `toktickit_recov_src_*` / `toktickit_recov_dst_*` databases, not a fixed recovery target.

#### PR #56 - Release from staging into main

- **Review:** [Release approval by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/56#pullrequestreview-5705450376) confirmed that PRs #52-#55 had been reviewed and the release reused their verification records. The review allowed reuse while the release tree remained unchanged.
- **My response:** [Acknowledged the release review](https://github.com/Kawi-HBLI/TokTickIT/pull/56#issuecomment-6514900116).
- **Outcome:** Approved on 2026-10-29 and merged into `main` as `50f4ac5` on 2026-10-30. The later main verification found one mobile readiness assertion, tracked separately in PR #57.

#### PR #57 - Mobile accessibility test and review-record follow-up

- **Finding and change:** Final verification on `main` (`50f4ac5`) passed 13/14 Lab 4 E2E executions. The mobile audit waited for a CSS-hidden desktop table although loaded cards were visible. Commit `73fd8cb` waits for exactly one visible table/cards container before the existing axe assertions.
- **Author verification:** Focused `TEST-E2E-06` passed 2/2 using the identical test-file contents before commit. The original full Lab 4 configuration passed 14/14 after commit `73fd8cb`, using a separate temporary native PostgreSQL 15.19 cluster. These are local results on the fix branch, not results on a merged main commit or automated CI.
- **Documentation follow-up:** Updated this record to the Lab 2 structure at the author's request, replacing stale planned statuses with linked GitHub review history for both sides.
- **Current status:** Ready for review with @R1NNE0 requested. No formal review or merge has occurred at this snapshot. The peer must approve and merge; the author does not merge their own PR.

## Pull Requests I reviewed for my partner

| PR | Branch | Verdict |
|----|--------|---------|
| [Maibokdaimhai/TokTickIT #45](https://github.com/Maibokdaimhai/TokTickIT/pull/45) | `feature/lab4-lab3-tech-debt` | Approved on 2026-10-11; merged into `lab4-staging` as `20581ae` on 2026-10-11 |
| [Maibokdaimhai/TokTickIT #46](https://github.com/Maibokdaimhai/TokTickIT/pull/46) | `feature/lab4-spec-and-tests` | Approved on 2026-10-27; merged into `lab4-staging` as `ecf4c47` on 2026-10-27 |
| [Maibokdaimhai/TokTickIT #54](https://github.com/Maibokdaimhai/TokTickIT/pull/54) | `feature/lab4-actions-foundation` | Approved on 2026-10-27; merged into `lab4-staging` as `ce32e77` on 2026-10-27 |
| [Maibokdaimhai/TokTickIT #55](https://github.com/Maibokdaimhai/TokTickIT/pull/55) | `feature/lab4-actions-ui` | Approved on 2026-10-27; merged into `lab4-staging` as `f8238e9` on 2026-10-27 |
| [Maibokdaimhai/TokTickIT #56](https://github.com/Maibokdaimhai/TokTickIT/pull/56) | `feature/lab4-ticket-workflow` | Approved on 2026-10-28; merged into `lab4-staging` as `90c4c01` on 2026-10-28 |
| [Maibokdaimhai/TokTickIT #57](https://github.com/Maibokdaimhai/TokTickIT/pull/57) | `feature/lab4-dashboards` | Approved on 2026-10-28; merged into `lab4-staging` as `5d13a76` on 2026-10-28 |
| [Maibokdaimhai/TokTickIT #58](https://github.com/Maibokdaimhai/TokTickIT/pull/58) | `test/lab4-regression-and-evidence` | Approved on 2026-10-28; merged into `lab4-staging` as `9d067ec` on 2026-10-28 |
| [Maibokdaimhai/TokTickIT #59](https://github.com/Maibokdaimhai/TokTickIT/pull/59) | `docs/lab4-final-evidence-release` | Approved on 2026-10-30; merged into `lab4-staging` as `b110377` on 2026-10-30 |
| [Maibokdaimhai/TokTickIT #60](https://github.com/Maibokdaimhai/TokTickIT/pull/60) | `lab4-staging` | Approved on 2026-10-30; merged into `main` as `51d0d7a` on 2026-10-30 |
| [Maibokdaimhai/TokTickIT #61](https://github.com/Maibokdaimhai/TokTickIT/pull/61) | `codex/lab4-final-main-evidence` | Approved on 2026-10-30; merged into `main` as `351cfa7` on 2026-10-30 |
| [Maibokdaimhai/TokTickIT #62](https://github.com/Maibokdaimhai/TokTickIT/pull/62) | `docs/lab4-final-main-confirmation` | Approved on 2026-10-30; merged into `main` as `31f8151` on 2026-10-30 |

### Comments I made on my partner's PRs and how they responded

#### Partner PR #45 - Deferred Staff mobile-panel fix

- **Review:** [Approved](https://github.com/Maibokdaimhai/TokTickIT/pull/45#pullrequestreview-5484271302) after checking communication-panel bounds at 320, 390, 820, and 1440px, long text, 44px submit controls, 18 component tests, typecheck, and build.
- **Partner response and outcome:** [Acknowledged and allowed merge](https://github.com/Maibokdaimhai/TokTickIT/pull/45#issuecomment-6111865658). Merged into `lab4-staging` as `20581ae` on 2026-10-11.

#### Partner PR #46 - Specification and test plan

- **First review:** [Requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/46#pullrequestreview-5666239755) because completed Actions were immutable but outstanding follow-up could still block Ticket resolution, with no documented way to finish that follow-up.
- **Partner response:** [Added BR-23 and a follow-up completion operation](https://github.com/Maibokdaimhai/TokTickIT/pull/46#issuecomment-6440753257), retaining the original work and history while recording completion, actor, and timestamp. The test plan added the full blocked-resolution to completed-follow-up path.
- **Final review and outcome:** [Approved the revised contract](https://github.com/Maibokdaimhai/TokTickIT/pull/46#pullrequestreview-5666334547). Tests remained planned at this specification stage. Merged as `ecf4c47` on 2026-10-27.

#### Partner PR #54 - Actions Taken foundation and APIs

- **Review:** [Approved](https://github.com/Maibokdaimhai/TokTickIT/pull/54#pullrequestreview-5666781735) authorization, assignment, revision history, follow-up completion, concurrency, retries, migration, seed, and recovery. The review recorded 317 backend tests, including 48 Lab 4 tests, plus typecheck and build.
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/54#issuecomment-6441549109). Merged as `ce32e77` on 2026-10-27.

#### Partner PR #55 - Actions Taken interfaces and history

- **Review:** [Approved](https://github.com/Maibokdaimhai/TokTickIT/pull/55#pullrequestreview-5669275583) Staff workflows, read-only Requester access, history, draft preservation, and conflicts. The review recorded 138 client tests, typecheck/build, and eight controlled-API browser checks.
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/55#issuecomment-6445395593). Merged as `f8238e9` on 2026-10-27.

#### Partner PR #56 - Resolution gate and status history

- **Review:** [Approved](https://github.com/Maibokdaimhai/TokTickIT/pull/56#pullrequestreview-5677293341) the resolution gate, advisory Requester feedback, transition history, concurrency, and legacy Tickets. Recorded checks were 343 backend tests, 149 client tests, three database-backed browser tests, eight controlled-API checks, and typechecks/builds.
- **Partner response and outcome:** [Confirmed readiness to merge](https://github.com/Maibokdaimhai/TokTickIT/pull/56#issuecomment-6459623647). Merged as `90c4c01` on 2026-10-28.

#### Partner PR #57 - Dashboards and filtered drill-downs

- **First feedback:** [Asked for retained stale dashboard data and persistent list context after Detail reload](https://github.com/Maibokdaimhai/TokTickIT/pull/57#pullrequestreview-5682158682). I accidentally submitted that feedback as Approve and [immediately corrected the formal verdict to Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/57#pullrequestreview-5682196406).
- **Partner's first response:** [Added stale-data handling, reload persistence, and regressions](https://github.com/Maibokdaimhai/TokTickIT/pull/57#issuecomment-6468823452), preserving data on refresh errors while clearing it on 401/403.
- **Second review:** [Requested preserving history state when saving an Action](https://github.com/Maibokdaimhai/TokTickIT/pull/57#pullrequestreview-5682520441). `history.replaceState(null, ...)` still erased filtered page-two context before reload and Back.
- **Partner's second response:** [Preserved history state and added integration/browser regressions](https://github.com/Maibokdaimhai/TokTickIT/pull/57#issuecomment-6469045008).
- **Final review and outcome:** [Approved after verifying the fixes](https://github.com/Maibokdaimhai/TokTickIT/pull/57#pullrequestreview-5682875135), including five browser regressions, component/routing checks, typecheck, and build. Merged as `5d13a76` on 2026-10-28.

#### Partner PR #58 - Regression, accessibility, and cleanup guards

- **First review:** [Requested changes](https://github.com/Maibokdaimhai/TokTickIT/pull/58#pullrequestreview-5684111915) because substring matching allowed a database name such as `production_contest` to pass the disposable-target guard. I requested separated `test`, `e2e`, or `disposable` tokens and the same check for upload paths.
- **Follow-up review:** [Approved after verifying the guard correction](https://github.com/Maibokdaimhai/TokTickIT/pull/58#pullrequestreview-5685046992), negative-name and unsafe-cleanup tests, and server typecheck.
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/58#issuecomment-6472908724). Merged as `9d067ec` on 2026-10-28.

#### Partner PR #59 - Final documentation and review evidence

- **First review:** [Requested a README correction](https://github.com/Maibokdaimhai/TokTickIT/pull/59#pullrequestreview-5715507311) because it described a separate CSRF token while this partner implementation used a session cookie and Origin validation.
- **Follow-up review:** [Approved the corrected authentication description](https://github.com/Maibokdaimhai/TokTickIT/pull/59#pullrequestreview-5715578375).
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/59#issuecomment-6528186212). Merged as `b110377` into `lab4-staging` on 2026-10-30.

#### Partner PR #60 - Lab 4 release into main

- **Review:** [Approved the release integration](https://github.com/Maibokdaimhai/TokTickIT/pull/60#pullrequestreview-5715785065), recording 391 backend tests, 22 focused safety tests, 195 client tests, 14 controlled-API checks, and typechecks/builds on staging. I also asked for Issue #53 to be reopened while final-main verification and the submission PDF were pending.
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/60#issuecomment-6528545433). Merged into `main` as `51d0d7a` on 2026-10-30. Subsequent startup correction and final-main evidence are recorded separately below.

#### Partner PR #61 - Production startup correction

- **Review:** [Approved](https://github.com/Maibokdaimhai/TokTickIT/pull/61#pullrequestreview-5716068472) the production-startup correction and merged-main verification records against Issue #53. The PR recorded the earlier main startup failure separately from the fix branch verification.
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/61#issuecomment-6528986256). Merged into `main` as `351cfa7` on 2026-10-30.

#### Partner PR #62 - Confirmed final-main verification

- **Review:** [Approved the evidence-only update](https://github.com/Maibokdaimhai/TokTickIT/pull/62#pullrequestreview-5716249425) for main `351cfa7`. The review recorded 425 backend tests, 195 client tests, 52 browser tests, 65 rendered scenarios, and the 10,000-Ticket performance benchmark, with application source unchanged by this documentation PR.
- **Partner response and outcome:** [Acknowledged](https://github.com/Maibokdaimhai/TokTickIT/pull/62#issuecomment-6529333655). Merged into `main` as `31f8151` on 2026-10-30.

## Review workflow

Work follows `Backlog -> Specified -> Started -> PR Review -> Fixing -> Done`. Requested changes are addressed on the same feature branch before re-review. Feature PRs #52-#55 targeted `lab4-staging`; release PR #56 and the follow-up PR #57 target `main`. The PR author does not self-approve or self-merge. Pre-PR AI checks are separate from the formal peer reviews linked above.
