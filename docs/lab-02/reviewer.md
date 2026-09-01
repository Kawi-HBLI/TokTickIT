# Lab 2 — Peer Review Record

**Author:** Tanadet Nuchaikaew — 67070501081 — GitHub: @Kawi-HBLI
**Peer reviewer:** Songwit Rueangsawat — 67070501060 — GitHub: @R1NNE0, Sitthichai Phirompan — 67070501074 — GitHub: @Bank848
**Partner I reviewed:** Thanawat Suntarawattana — 67070501022 — GitHub: @Maibokdaimhai

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer | Verdict |
|----|--------|----------|---------|
| [#12](https://github.com/Kawi-HBLI/TokTickIT/pull/12) | feature/1-spec-and-test-plan | @R1NNE0 | Approved on 2026-08-30; merged by @R1NNE0 into lab2-staging as `21e20fd` |
|    | feature/2-database-schema-seed | | |
|    | feature/3-requester-context | | |
|    | feature/4-create-ticket | | |
|    | feature/5-my-tickets | | |
|    | feature/6-ticket-detail-attachments | | |
|    | feature/7-e2e-release-docs | | |
|    | lab2-staging ➔ main | | |

### Reviewer comments I received and how I responded
- **PR #12:** [Review by @R1NNE0](https://github.com/Kawi-HBLI/TokTickIT/pull/12#pullrequestreview-5060922044) approved the specification, test traceability, and UI/API contracts. The reviewer recommended creating the remaining Issues on the project board and recording this review after merge.
- **My response:** [Reply](https://github.com/Kawi-HBLI/TokTickIT/pull/12#issuecomment-5468970735) confirmed that all seven Lab 2 Issues had been created with their implementation order and dependencies documented, and stated that this review would be recorded after merge.
- **Outcome:** The reviewer merged PR #12 on 2026-08-30 at 22:46 ICT. This entry records the review after merge; later PR verdicts remain blank until their reviews occur.

## Pull Requests I reviewed for my partner

| PR | Branch / Title | Verdict |
|----|----------------|---------|
| [Maibokdaimhai/TokTickIT #16](https://github.com/Maibokdaimhai/TokTickIT/pull/16) | `feature/lab2-spec-and-tests` — docs: add Sprint 2 engineering specification and test plan | Requested changes twice, then approved by @Kawi-HBLI on 2026-08-30; merged into `lab2-staging` as `da77a6c` |

### Comments I made on my partner's PRs and how they responded

#### Partner PR #16 — Spec-DD review, 2026-08-30

- **First review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/16#pullrequestreview-5060765252):** I asked my partner to replace unsupported `Pass`/`100% Pass` claims with planned or pending statuses, resolve conflicting ticket-number rules, define initial attachment failure handling, complete the API schemas and ownership rules, and correct missing or incorrect AC/test mappings.
- **[Partner's first response](https://github.com/Maibokdaimhai/TokTickIT/pull/16#issuecomment-5468876320):** They reported changing the test statuses to `Planned`/`Pending (Not Run)`, choosing annual sequential `TKT-YYYY-XXXXXX` numbering, expanding the API contract, and adding sorting, empty/no-results, and accessibility coverage.
- **Second review — [Request changes](https://github.com/Maibokdaimhai/TokTickIT/pull/16#pullrequestreview-5060937088):** I acknowledged those updates but asked how BR-16's atomic creation requirement would work when ticket creation accepts JSON and attachments use separate multipart requests. I requested an explicit creation sequence, failure/rollback behavior, and a planned rollback test.
- **[Partner's second response](https://github.com/Maibokdaimhai/TokTickIT/pull/16#issuecomment-5469018310):** They documented a two-step flow: create the ticket, then upload initial attachments. Their proposed compensation uses `DELETE /api/tickets/:id?requesterId=X` to remove the draft ticket and saved files after an upload failure. They also added planned test `API-11`, mapped to `BR-16` and `AC-15`.
- **Final review — [Approve](https://github.com/Maibokdaimhai/TokTickIT/pull/16#pullrequestreview-5060969913):** I approved the revised Spec-DD documents at 20:43 ICT, noting the updated requirements, API/UI contracts, AC traceability, and planned rollback coverage. My partner [acknowledged the approval](https://github.com/Maibokdaimhai/TokTickIT/pull/16#issuecomment-5469049129). The PR was merged at 20:45 ICT.

This records a documentation review, not proof that the partner's implementation or tests passed. The partner's ticket-number and compensation choices above describe their repository; they do not replace this repository's approved contract.
