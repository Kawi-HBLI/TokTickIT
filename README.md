# TokTickIT 

This is the project repository for TokTickIT (Lab 1).

## Project Structure
- `client/`: React + Vite frontend application
- `server/`: Express + Prisma backend application
- `docs/`: Documentation for Lab 1 (`ai_use.md`, `reviewer.md`, `tests.md`)
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
4. Push the Prisma schema to the database: `npx prisma db push`
5. Run the development server: `npm run dev`

### 3. Frontend Setup (`client/`)
1. Navigate to the `client` directory: `cd client`
2. Install dependencies: `npm install`
3. Copy the environment file: `cp .env.example .env` (This points to the backend API at port 8000).
4. Run the development server: `npm run dev`

### Testing
- **Client**: Run `npm test` in the `client` folder.
- **Server**: Run `npm test` in the `server` folder (Note: Server tests for Health Check will fail until Issue 2 is completed).