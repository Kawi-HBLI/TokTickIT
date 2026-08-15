# Lab 1 — Peer Review Record

**Author:** Tanadet Nuchaikaew — 67070501060 — GitHub: @Kawi-HBLI
**Peer reviewer:** Songwit Rueangsawat — 67070501081 — GitHub: @R1NNE0 (main reviewer), Bank848 — GitHub: @Bank848 (Issue 2 review)
**Partner I reviewed:** Thanawat Suntarawattana — 67070501022 — GitHub: @Maibokdaimhai

## Pull Requests I authored (reviewed by my partner)
| PR | Branch | Reviewer | Verdict |
|----|--------|----------|---------|
| #5 | feature/1-project-foundation | R1NNE0 | ✅ Approved — project structure, env templates, gitignore, vitest config all verified. |
| #6 | feature/2-health-check | Bank848 | ✅ Approved — initially flagged missing frontend integration. Pushed fix, re-reviewed and approved. |
| #7 | feature/3-category-seed | R1NNE0 | ✅ Approved — Prisma model, migration, and idempotent seed script verified. |
| #8 | feature/4-category-list | R1NNE0 | ✅ Approved — GET /api/categories endpoint and React UI verified. |

### Reviewer comments I received and how I responded

**Issue 2 (Bank848):**
- Comment: "The `checkSystem()` function still throws `new Error('checkSystem not implemented yet')` and `App.tsx` has no API call or Offline state display."
- My response: "Good catch! I completely forgot to implement the frontend part of Issue 2. Just pushed a new commit that updates `api.ts` and `App.tsx` to fetch the API and display Online/Offline states. Please check again!"

**Issue 1 (R1NNE0):**
- Comment: "Everything is well-structured and satisfies all Issue 1 requirements. Approved."
- My response: "Thank you for the review! The foundation is solid, ready to move forward."

## Pull Requests I reviewed for my partner
My comment: (Partner's repo was reviewed separately — no cross-repo PRs in Lab 1.)
Partner's response: N/A
