# Lab 2 - AI Use and Reflection

**LLM/agent used:** OpenAI Codex (GPT-5). An earlier first draft was also prepared with an AI assistant in Antigravity IDE.

The prompts below are only the ones that materially changed the specification or implementation. I translated the Thai prompts into English and lightly edited them for clarity while keeping the original intent. I will add more later only when they lead to another meaningful technical decision.

## Selected Key Prompts

| # | Selected Prompt | What I Did With the Result |
|---|---|---|
| 1 | "Read the Lab 2 labsheet and inspect the current repository. Explain in simple language what we actually have to build before changing any files." | I used the explanation to understand that Lab 2 is a complete Requester ticket workflow, not just one Create Ticket form. |
| 2 | "Does Lab 2 expect us to create our own Issues and feature branches from the stakeholder request? Explain where the Issue decomposition, dependencies, and reasons should be documented." | I learned that the stakeholder request must be converted into an engineering contract and that the decomposition rationale belongs in `specification.md` and the individual GitHub Issue bodies. |
| 3 | "Review and revise only `specification.md`, `tests.md`, and `ui-spec.md`. Make the Functional Requirements, Business Rules, Acceptance Criteria, UI states, and planned tests internally consistent and traceable. Do not commit yet." | The documents were expanded into numbered FRs, BRs, and ACs, with complete screen states and an AC-to-test matrix covering unit, API, UI, accessibility, E2E, responsive, and visual evidence. |
| 4 | "Align `api-spec.md` with the approved specification. Resolve Requester context, ownership errors, duplicate submission, pagination, Attachment upload/preview/download/removal, safe failures, and exact HTTP status codes." | I accepted a single `x-requester-id` context for owned resources, consistent `404` ownership behavior, an `Idempotency-Key` for duplicate protection, and explicit Attachment/storage failure rules. |
| 5 | "Continue on `feature/2-database-schema-seed`. Implement the Prisma schema, migration, repeatable seed data, and tests from the approved contract. Preserve the Lab 1 Category behavior, update setup instructions, and keep everything local without pushing." | I used this to turn the approved data contract into models, foreign keys, indexes, an idempotency constraint, and a PostgreSQL sequence-backed Ticket Number. I also kept the existing four Category records stable and added tests for schema and repeatable seed behavior. |

## Prompt Pattern I Learned

My prompts work better when they include:

```text
Context + exact files/scope + important constraints + expected result + stopping point
```

For example:

> Read the Lab 2 contract and edit only the relevant files under `docs/lab-02`. Keep all FR, BR, AC, API, UI, and test IDs consistent. Verify the result, commit on the current feature branch, but do not push or create a PR.

## My Reflection

I am still learning how to write good prompts, so my first messages were short and sometimes left the agent to guess the scope. The most useful improvement was to state exactly which files could change, what had to stay consistent, and whether the agent should stop before committing or opening a PR. I am also keeping this list intentionally short for now instead of filling it with routine requests. I will add later prompts only when they capture an important decision or a useful correction.
