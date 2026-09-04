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
3. Copy the environment file: `cp .env.example .env` (This contains the Docker database URL).
4. Apply all committed migrations: `npx prisma migrate deploy`
5. Generate the Prisma client: `npx prisma generate`
6. Load the repeatable reference data: `npm run prisma:seed`
7. Run the development server: `npm run dev`

For schema development, create a migration with
`npm run prisma:migrate -- --name <migration-name>` instead of using
`prisma db push`. Lab 2's committed migration adds the Requester, Related
System, Ticket, and Attachment data foundation while preserving the Lab 1
Category table.

### 3. Frontend Setup (`client/`)
1. Navigate to the `client` directory: `cd client`
2. Install dependencies: `npm install`
3. Copy the environment file: `cp .env.example .env` (This points to the backend API at port 8000).
4. Run the development server: `npm run dev`

### Testing
- **Client**: Run `npm test` in the `client` folder.
- **Server**: Run `npm test` in the `server` folder. Database-backed tests require
  PostgreSQL to be running with migrations and seed data applied.
- **Lab 2 server checks**: Run
  `npx vitest run tests/lab-02`
  in the `server` folder. The integration suite applies all migrations to a
  uniquely named temporary schema in the database from `server/.env`, seeds it
  twice, and tests persisted ticket numbers and constraints. The database user
  needs permission to create/drop schemas. The suite removes only its own
  temporary schema; it does not reset the application's schema or sequence.

Existing Lab 2 databases also need `npx prisma migrate deploy` to apply the
ticket-number formatting correction. It preserves existing records and the
sequence position while allowing numbers longer than five digits.

### Lab 2 Create Ticket increment

Select a seeded Development Requester, then open **Create Ticket** (`/tickets/new`).
Categories and Related Systems come from active database records. The server
generates the Ticket Number, date, and `NEW` status. My Tickets and complete
Ticket Detail/attachment management belong to the next feature increments;
their navigation currently shows a scope placeholder.

Apply `20260904073000_ticket_creation_receipt` with `prisma migrate deploy`
before running this increment. It adds nullable internal fingerprint/response
columns without replacing existing records. They preserve the original creation
response (including attachment warnings) for same-key retries. Old rows without
a saved receipt cannot be replayed and return a safe key conflict instead.

Uploads are private files in `server/uploads/` (gitignored), or an absolute
directory set with `UPLOAD_DIR`. They are not served statically. Validation checks
extension, declared MIME type, count (five), and size (5 MiB each); it is not
antivirus or file-content verification. Multipart files are staged in memory
(up to 25 MiB of file bytes per request). Handled failures clean up generated
files; crash-time orphan reconciliation is not implemented in this increment.

The Create Ticket API tests apply all migrations to their own temporary schema
and write attachments only to their own temporary directory. They do not reset
the development database. Run both test suites and builds from the root:

```powershell
docker compose up -d
npm --prefix server test
npm --prefix client test
npm --prefix server run build
npm --prefix client run build
```
