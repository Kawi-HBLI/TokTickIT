# Lab 2 - AI Use and Reflection

**LLM/agent used:** OpenAI Codex (GPT-5). An earlier first draft was also prepared with an AI assistant in Antigravity IDE.

I am recording only prompts that materially changed the engineering work. This list will grow gradually as later Issues introduce decisions worth keeping.

## Selected Key Prompts

| # | Selected Prompt | What I Did With the Result |
|---|---|---|
| 1 | "Read the Lab 2 labsheet and inspect the current repository. Review `specification.md`, `tests.md`, `ui-spec.md`, and `api-spec.md` as one engineering contract. Resolve ambiguities in Requester context, ownership, duplicate submission, pagination, Attachment behavior, errors, UI states, and test traceability before writing implementation code." | This turned the broad stakeholder request into a consistent contract with numbered FRs, BRs, and ACs. I accepted `x-requester-id` as the temporary Requester context, safe `404` ownership behavior, an `Idempotency-Key` for duplicate protection, explicit Attachment failure rules, and AC-to-test traceability. |

## Prompt Pattern I Learned

My prompts work better when they include:

```text
Context + exact files/scope + important constraints + expected result + stopping point
```

For example:

> Read the Lab 2 contract and edit only the relevant files under `docs/lab-02`. Keep all FR, BR, AC, API, UI, and test IDs consistent. Verify the result, commit on the current feature branch, but do not push or create a PR.

## My Reflection

I am still learning how to write good prompts, so my first messages were short and sometimes left the agent to guess the scope. This prompt worked better because it named the contract files, the decisions that needed attention, and the stopping point before implementation. I will add more prompts only when later work produces another important decision or correction.
