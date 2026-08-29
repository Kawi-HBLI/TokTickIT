# Lab 2 - AI Use and Reflection

**LLM/agent used:** OpenAI Codex (GPT-5). An earlier first draft was also prepared with an AI assistant in Antigravity IDE.

The prompts below are selected from the useful parts of my actual conversation. I translated the Thai prompts into English and lightly edited them for clarity while keeping the original intent.

## Selected Key Prompts

| # | Selected Prompt | What I Did With the Result |
|---|---|---|
| 1 | "Read the Lab 2 labsheet and inspect the current repository. Explain in simple language what we actually have to build before changing any files." | I used the explanation to understand that Lab 2 is a complete Requester ticket workflow, not just one Create Ticket form. |
| 2 | "Check whether `lab2-staging` exists and inspect the new files under `docs/lab-02`. Compare them with the labsheet and tell me what is incomplete or inconsistent. Do not edit anything yet." | This exposed conflicts in Requester identity, Ticket status, API errors, Attachment behavior, and test coverage before the documents were committed. |
| 3 | "Can we reuse the GitHub Project board from Lab 1, or does the labsheet require a separate board? Base the answer on the Lab 2 workflow rules." | I corrected the initial plan and kept the existing Individual Sprints board, preserving the Lab 1 Done cards and adding Lab 2 work to the same workflow. |
| 4 | "Does Lab 2 expect us to create our own Issues and feature branches from the stakeholder request? Explain where the Issue decomposition, dependencies, and reasons should be documented." | I learned that the stakeholder request must be converted into an engineering contract and that the decomposition rationale belongs in `specification.md` and the individual GitHub Issue bodies. |
| 5 | "Review and revise only `specification.md`, `tests.md`, and `ui-spec.md`. Make the Functional Requirements, Business Rules, Acceptance Criteria, UI states, and planned tests internally consistent and traceable. Do not commit yet." | The documents were expanded into numbered FRs, BRs, and ACs, with complete screen states and an AC-to-test matrix covering unit, API, UI, accessibility, E2E, responsive, and visual evidence. |
| 6 | "Align `api-spec.md` with the approved specification. Resolve Requester context, ownership errors, duplicate submission, pagination, Attachment upload/preview/download/removal, safe failures, and exact HTTP status codes." | I accepted a single `x-requester-id` context for owned resources, consistent `404` ownership behavior, an `Idempotency-Key` for duplicate protection, and explicit Attachment/storage failure rules. |
| 7 | "Finish the Lab 2 documentation and commit it on the current feature branch, but do not push or create the PR. In `ai-use.md`, keep only meaningful prompts, write them in natural English, and point out how I could improve my prompts while we work." | This kept the final action boundary clear and produced a concise record of the decisions that actually changed the engineering contract. |

## Prompt Pattern I Learned

My prompts work better when they include:

```text
Context + exact files/scope + important constraints + expected result + stopping point
```

For example:

> Read the Lab 2 contract and edit only the relevant files under `docs/lab-02`. Keep all FR, BR, AC, API, UI, and test IDs consistent. Verify the result, commit on the current feature branch, but do not push or create a PR.

## My Reflection

I am still learning how to write good prompts, so my first messages were short and sometimes left the agent to guess the scope. The most useful improvement was to state exactly which files could change, what had to stay consistent, and whether the agent should stop before committing or opening a PR. I also learned not to accept the first answer automatically: I corrected the suggestion to create a new Kanban board after checking the existing board, and I asked for the API contract to be revised when the first draft allowed conflicting Requester identities.
