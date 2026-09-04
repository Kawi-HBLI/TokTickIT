# Lab 2 - AI Use and Reflection

**LLM/agent used:** OpenAI Codex (GPT-5). An earlier first draft was also prepared with an AI assistant in Antigravity IDE.

## Selected Key Prompts

| # | Selected Prompt | What I Did With the Result |
|---|---|---|
| 1 | "Read the Lab 2 labsheet and inspect the current repository. Review `specification.md`, `tests.md`, `ui-spec.md`, and `api-spec.md` as one engineering contract. Resolve ambiguities in Requester context, ownership, duplicate submission, pagination, Attachment behavior, errors, UI states, and test traceability before writing implementation code." | This turned the broad stakeholder request into a consistent contract with numbered FRs, BRs, and ACs. I accepted `x-requester-id` as the temporary Requester context, safe `404` ownership behavior, an `Idempotency-Key` for duplicate protection, explicit Attachment failure rules, and AC-to-test traceability. |
| 2 | "Review the Lab 2 specification and test plan before implementation. Check for conflicting business rules, missing API behavior, and acceptance criteria without test coverage. Trace what happens if ticket creation succeeds but an attachment upload fails. Separate planned tests from verified results and suggest concrete review comments." | The review identified unsupported test-pass claims, conflicting ticket-number rules, missing API details, and incorrect AC/test mappings. I requested corrections and a clear attachment failure/rollback flow with a planned test before approving the revised documents. [Review discussion](https://github.com/Maibokdaimhai/TokTickIT/pull/16) |
| 3 | "Implement the Development Requester context from the approved API and UI specs. Keep it clearly separate from authentication, validate the stored ID against active Requesters from the server, reject unsafe `x-requester-id` values at a reusable server boundary, and preserve the Lab 1 system-check behavior. Add focused tests for loading, selection, switching, stale storage, empty data, API failure, and safe server errors." | I used this to keep one identity contract across the client and server. The implementation stores only the selected ID, refreshes the Requester record from the API, distinguishes malformed from unknown context, and keeps the previous Lab 1 tests passing. |
| 4 | "Build the Create Ticket flow using the selected Requester. Let the server set the ticket number, date, and NEW status. Check the form and attachments, prevent double submissions, and warn me before switching Requesters with an unfinished form. Test it against PostgreSQL in Docker before calling it done." | I used this to implement the full Create Ticket workflow across the client and server. The server authoritative validation covers form boundaries and attachment limits while generating immutable ticket numbers. The UI provides inline error messages, disables duplicate submissions via `Idempotency-Key`, and confirms before discarding dirty form data when switching Requesters. |

## My Reflection

The useful part was checking what happens when a response is lost or only one
attachment fails. Reusing the same submission key lets the server return the
original ticket. A file-storage failure should identify the failed file without
losing the valid ticket. These cases needed tests, not just a working submit button.

AI was most useful when checking how the documents fit together. A requirement can look clear on its own but still conflict with an API response or have no test that proves it. Comparing the specification, API, UI, and test plan helped catch those gaps before coding.

The peer review also showed why failure cases matter. Creating a ticket and uploading a file are separate steps, so the contract needs to explain what happens if only one succeeds. I also learned that a test plan is not evidence of passing tests: results must stay pending until the tests actually run.
