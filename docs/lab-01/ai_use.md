# Lab 1 — AI Use and Reflection

**LLM/agent used:** Gemini 3.1 Pro (High) via Antigravity IDE

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | "I have added the Kanban board, please check if there are any mistakes. Also, I have Docker installed on my machine. If using Docker is more convenient, we can use it." (Issue 1) | AI suggested creating a `docker-compose.yml` to spin up PostgreSQL instead of relying on local pgAdmin. I approved the plan because it creates a more isolated and reproducible environment for the database, preventing local user/password conflicts. |
| 2 | "We are starting Issue 2. The goal is to create the GET /api/health route in server/src/app.ts so it returns a 200 JSON status. Please write this code and run vitest to check if health.test.ts passes." | Being specific about the target file and the test command helped the AI implement the exact logic needed. Running tests immediately after generating code gave me a quick feedback loop to ensure correctness. |
| 3 | "For Issue 3, we need to add a Category model to schema.prisma with id (Int, PK), name (String, Unique), and createdAt (DateTime). Please create this schema and run the migration to update the database." | I learned that using an ORM with AI requires clear communication about data types and constraints (like @unique). The AI successfully created the migration and an idempotent seed script using upsert, which prevented duplicate data issues. |
| 4 |  |  |

## Reflection
By providing specific context about my environment (having Docker installed), the AI was able to propose a much better architectural decision (`docker-compose.yml`) than my original approach (using pgAdmin locally). This made the setup process cleaner. I realized that giving the AI more options leads to better technical solutions. I didn't have to reject anything yet, but I made sure to review the `docker-compose` settings before approving.
