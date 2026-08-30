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
5. Load the repeatable reference data: `npm run prisma:seed`
6. Run the development server: `npm run dev`

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
- **Lab 2 database checks only**: Run
  `npx vitest run tests/lab-02/database-schema.test.ts tests/lab-02/seed.test.ts`
  in the `server` folder.
