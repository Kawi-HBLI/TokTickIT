# Lab 1 — AI Use and Reflection

**LLM/agent used:** Gemini 3.1 Pro (High) via Antigravity IDE

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | "I have added the Kanban board, please check if there are any mistakes. Also, I have Docker installed on my machine. If using Docker is more convenient, we can use it." (Issue 1) | AI suggested creating a `docker-compose.yml` to spin up PostgreSQL instead of relying on local pgAdmin. I approved the plan because it creates a more isolated and reproducible environment for the database, preventing local user/password conflicts. |
| 2 |  |  |
| 3 |  |  |
| 4 |  |  |

## Reflection
By providing specific context about my environment (having Docker installed), the AI was able to propose a much better architectural decision (`docker-compose.yml`) than my original approach (using pgAdmin locally). This made the setup process cleaner. I realized that giving the AI more options leads to better technical solutions. I didn't have to reject anything yet, but I made sure to review the `docker-compose` settings before approving.
