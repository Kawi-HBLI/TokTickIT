# TokTickIT

This is the project repository for the TokTickIT software engineering labs.

## Project Structure
- `client/`: React + Vite frontend application
- `server/`: Express + Prisma backend application
- `docs/`: Engineering specifications, test plans, and review evidence for each lab
- `docker-compose.yml`: Docker configuration for the PostgreSQL database

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- Docker and Docker Compose (or Docker Desktop)
- Git

### 1. Database Setup
We use Docker to run the PostgreSQL database locally to ensure a consistent environment.
1. Make sure Docker is running.
2. In the root directory, run:
   ```bash
   docker compose up -d
   ```
   This will spin up a PostgreSQL instance on port `5433` (to avoid conflicts with local pgAdmin).

### 2. Backend Setup (`server/`)
1. Navigate to the `server` directory: `cd server`
2. Install dependencies: `npm install`
3. Copy the environment file: `cp .env.example .env` (This contains the Docker database URL on port 5433).
4. Apply all committed migrations without wiping data:
   ```bash
   npx prisma migrate deploy
   ```
5. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```
6. Load the repeatable reference data:
   ```bash
   npm run prisma:seed
   ```
7. Run the development server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup (`client/`)
1. Navigate to the `client` directory: `cd client`
2. Install dependencies: `npm install`
3. Copy the environment file: `cp .env.example .env` (Points to backend API at `http://localhost:8000`).
4. Run the development server:
   ```bash
   npm run dev
   ```

### 4. End-to-End Test Setup (repository root)
1. Return to the repository root.
2. Install the root test dependencies:
   ```bash
   npm install
   ```
3. Install the Chromium browser used by the Playwright suite:
   ```bash
   npx playwright install chromium
   ```

### Private Attachment Storage

Uploaded files are stored privately in `server/uploads/` by default. The directory is
gitignored and is not exposed as a static public directory; preview and download requests
must pass through the Requester-scoped API. Set `UPLOAD_DIR` to an absolute directory when
a different storage location is required. Automated tests use temporary or dedicated upload
directories and clean them after the run.

---

## Testing & Quality Verification

Run all test suites and production builds from the repository root:

```powershell
# 1. Start database container
docker compose up -d

# 2. Server unit & integration tests (147/147 tests)
npm --prefix server test

# 3. Client React component tests (51/51 tests)
npm --prefix client test

# 4. End-to-End Playwright test suite (36/36 tests across Desktop, Tablet, Mobile)
npx playwright test

# 5. Production builds
npm --prefix server run build
npm --prefix client run build
```

---

## Database Migrations & P2022 Schema Drift Resolution

### Safe, Non-Destructive Migrations
Always use `npx prisma migrate deploy` in `server/` rather than destructive commands like `prisma db push --force-reset` or resetting the database. All migrations in `server/prisma/migrations` are designed to be forward-compatible, preserving existing development tickets, sequence counters, and seed entities.

### Resolving the P2022 Observed During PR #24
The `P2022` error observed during the local verification of PR #24 was caused by a
development database that had not received the latest committed migrations. In that
specific case, deploying the pending migrations resolved the schema drift without a code
change. A `P2022` reported in another environment should still be investigated by comparing
the failing column, the Prisma schema, and the applied migration history rather than assuming
that every occurrence has the same cause.

To apply pending committed migrations without resetting the database, run:
```bash
cd server
npx prisma migrate deploy
```
This safely applies any pending migration files to the database schema in place, preserving all existing records and sequence states.
