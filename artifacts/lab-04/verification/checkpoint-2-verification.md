# Lab 4 Verification Record: Performance Baseline & Disaster Recovery Checkpoint 2

- **Base Commit:** `85d1c4f`
- **Branch:** `feature/lab4-final-verification`
- **Execution Date:** 2026-10-29
- **Working Directory:** `D:\CPE\Y3.1\CPE_334_SOFTWARE_ENGINEERING\WORK_1\toktickit`
- **Environment:**
  - OS: Windows 11 (win32 x64)
  - Runtime: Node.js v22.18.0
  - Database: PostgreSQL 15.19 (Debian 15.19-1.pgdg13+2) in Docker container `toktickit-db` (mapped port 5433)
  - Application: Express 4, Prisma 5.22, Supertest, Vitest 2.1.9

---

## 1. Dashboard Performance Baseline (`TEST-PERF-01`)

### 1.1 Objective & Target
Verify that authenticated requests to both `GET /api/staff/dashboard` and `GET /api/requester/dashboard` respond with a 95th-percentile (p95) response time strictly below **200 ms** against an isolated test dataset containing 500 Tickets with documented ownership distribution and representative Actions, Comments, and Notes.

### 1.2 Execution Command
```bash
npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests/lab-04/dashboard-performance.test.ts
```
- **Working Directory:** `server`
- **Test File:** `server/tests/lab-04/dashboard-performance.test.ts`
- **Isolation:** Dedicated temporary schema (`lab4_perf_*`) deployed via `prisma migrate deploy`.

### 1.3 Dataset Specification (500 Tickets)
- **Documented Ownership & Status Distribution:**
  - **Unassigned Active Tickets:** 120 tickets (`ownerId: null`, statuses `NEW`: 40, `OPEN`: 80)
  - **Staff A (`ethan.brooks`) Active Tickets:** 140 tickets (`ownerId: ethan.id`, statuses `OPEN`: 40, `IN_PROGRESS`: 70, `WAITING_FOR_REQUESTER`: 30)
  - **Staff B (`gavin.lee`) Active Tickets:** 120 tickets (`ownerId: gavin.id`, statuses `OPEN`: 40, `IN_PROGRESS`: 55, `WAITING_FOR_REQUESTER`: 25)
  - **Administrator (`harper.morgan`) Active Tickets:** 40 tickets (`ownerId: harper.id`, status `IN_PROGRESS`: 40)
  - **Terminal Tickets (Resolved, Closed, Cancelled):** 80 tickets (`RESOLVED`: 40, `CLOSED`: 30, `CANCELLED`: 10)
  - **Total Tickets:** $120 + 140 + 120 + 40 + 80 = 500$ tickets.
- **Requester Ownership Distribution:**
  - **Requester A (`amina.rahman`):** 75 owned tickets (40 active `OPEN`/`IN_PROGRESS`, 15 `WAITING_FOR_REQUESTER`, 20 `RESOLVED`/`CLOSED`), exercising activity ranking and candidate selection across tickets.
  - **Requester B (`ben.carter`):** 225 owned tickets.
  - **Requester C (`chalida.srisuk`):** 200 owned tickets.
  - **Total Requester Allocations:** $75 + 225 + 200 = 500$ tickets.
- **Representative Actions & Discussion Records:**
  - 25 pending actions assigned to Staff A on active tickets.
  - 15 actions completed today (UTC boundary $\ge 00:00:00.000\text{Z}$) by Staff A.
  - 10 actions completed yesterday (UTC boundary) by Staff A.
  - 25 pending actions assigned to Staff B on active tickets.
  - 15 actions completed today (UTC boundary) by Staff B.
  - 25 actions on Requester A's tickets (12 completed, 13 pending).
  - 30 public comments on Requester A's tickets (authored by both requester and staff).
  - 20 internal notes on Requester A's tickets (staff-only; privacy exclusion verified).

### 1.4 Functional Validation Prior to Measurement
- **Staff Dashboard Verification:**
  - `openTicketsCount`: 420 (expected 420)
  - `unassignedTicketsCount`: 120 (expected 120)
  - `pendingActionsCount`: 25 (expected 25)
  - `completedActionsTodayCount`: 15 (expected 15)
  - `myAssignedTicketsCount`: 140 (expected 140)
  - Preview lists: `myAssignedWork` $\le 5$ items, `unassignedQueue` $\le 5$ items.
- **Requester Dashboard Verification:**
  - `activeTicketsCount`: 55 (expected 55)
  - `awaitingRequesterCount`: 15 (expected 15)
  - `resolvedClosedCount`: 20 (expected 20)
  - `recentTickets`: 5 items (capped at preview limit).
  - Privacy enforcement: 100% absence of internal notes and audit records in requester response payload.

### 1.5 Measurement Methodology & p95 Calculation
- **Warmup:** 5 warmup requests per endpoint to stabilize Node.js JIT optimization, PostgreSQL connection pooling, and prepared statement query planning.
- **Sample Count:** $N = 35$ authenticated requests per endpoint measured using high-resolution timer `process.hrtime.bigint()`.
- **Percentile Formula:** Nearest-rank formula:
  $$\text{index} = \lceil 0.95 \times N \rceil - 1$$
  For $N = 35$: $\lceil 0.95 \times 35 \rceil - 1 = \lceil 33.25 \rceil - 1 = 34 - 1 = 33$ (0-indexed rank 33 of sorted ascending samples).

### 1.6 Measured Performance Results

| Endpoint / Role | Samples ($N$) | Min | Average | Max | p95 Measured | Documented Target | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `GET /api/staff/dashboard` (IT Staff) | 35 | 9.92 ms | 12.13 ms | 16.12 ms | **14.65 ms** | $< 200\text{ ms}$ | **PASSED** |
| `GET /api/requester/dashboard` (Requester) | 35 | 7.96 ms | 9.96 ms | 13.05 ms | **12.65 ms** | $< 200\text{ ms}$ | **PASSED** |

---

## 2. Genuine Disaster Recovery Rehearsal (`TEST-RECOV-01`)

### 2.1 Objective & Preconditions
Execute an end-to-end disaster recovery rehearsal using native custom-format PostgreSQL logical backup tools (`pg_dump -Fc` and `pg_restore`). Verify full data preservation, sequence state parity, collision-free allocations from sequence gaps, and trigger immutability enforcement strictly in a separate disposable target database.

### 2.2 Execution Command
```bash
npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests/lab-04/migration-recovery.test.ts
```
- **Working Directory:** `server`
- **Test File:** `server/tests/lab-04/migration-recovery.test.ts`
- **Tooling:** Docker-contained native `pg_dump (PostgreSQL) 15.19` and `pg_restore (PostgreSQL) 15.19`.

### 2.3 Step-by-Step Rehearsal Procedure & Evidence

1. **Disposable Source Database Creation:**
   - Database name: `toktickit_recov_src_[uuid]`
   - Created via: `docker exec toktickit-db psql -U toktickit -d postgres -c "CREATE DATABASE ..."`
2. **Prisma Forward Migration Deployment:**
   - Applied full migration chain (`20260815043555_init_category` through `20261027120000_lab4_actions_workflow`) via `prisma migrate deploy`.
3. **Representative Lab 4 Data Population:**
   - Executed `seedDatabase(srcPrisma, { seedActions: true })`.
   - Inserted additional representative Action Taken and Action History records under active triggers.
4. **Sequence Gap Induction:**
   - Induced intentional gaps to verify subsequent allocations advance from gaps:
     - `SELECT setval('"ActionTaken_id_seq"', 500, true);`
     - `SELECT setval('"ActionTakenHistory_id_seq"', 600, true);`
5. **Pre-Dump Invariant Recording:**
   - Captured row counts for all 9 database relations.
   - Recorded `last_value` and `is_called` across all 11 database sequences.
6. **Logical Custom-Format Backup:**
   - Command: `docker exec toktickit-db pg_dump -U toktickit -d toktickit_recov_src_* -Fc -f /tmp/toktickit_recov_*.dump`
7. **Disposable Target Database Creation:**
   - Database name: `toktickit_recov_dst_[uuid]` (separate target; never restoring into dev, staging, or source).
8. **Restoration into Target Database:**
   - Command: `docker exec toktickit-db pg_restore -U toktickit -d toktickit_recov_dst_* /tmp/toktickit_recov_*.dump`

### 2.4 Verification Results & Parity Matrix

#### A. Table Row Count Parity (100% Match)

| Relation / Table | Source DB Row Count | Restored Target Row Count | Match Status |
| :--- | :---: | :---: | :---: |
| `User` | 9 | 9 | **MATCH** |
| `Category` | 6 | 6 | **MATCH** |
| `RelatedSystem` | 5 | 5 | **MATCH** |
| `Ticket` | 10 | 10 | **MATCH** |
| `Attachment` | 10 | 10 | **MATCH** |
| `PublicComment` | 9 | 9 | **MATCH** |
| `InternalNote` | 7 | 7 | **MATCH** |
| `ActionTaken` | 6 | 6 | **MATCH** |
| `ActionTakenHistory` | 6 | 6 | **MATCH** |

#### B. Restored Relational Integrity & Data Preservation
- Verified sample Ticket: summary, description, requester relationship, owner relationship, and related Actions Taken remained intact with identical foreign keys.
- Verified sample Action Taken: description, ticketId, createdById, and history entries remained intact with identical IDs and snapshots.

#### C. Sequence State Parity (Source vs Restored Target before New Inserts)

| Sequence Name | Source `last_value` | Target `last_value` | Source `is_called` | Target `is_called` | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ActionTaken_id_seq` | 500 | 500 | true | true | **MATCH** |
| `ActionTakenHistory_id_seq` | 600 | 600 | true | true | **MATCH** |
| `Ticket_id_seq` | 10 | 10 | true | true | **MATCH** |
| `Attachment_id_seq` | 10 | 10 | true | true | **MATCH** |
| `Category_id_seq` | 6 | 6 | true | true | **MATCH** |
| `InternalNote_id_seq` | 7 | 7 | true | true | **MATCH** |
| `PublicComment_id_seq` | 9 | 9 | true | true | **MATCH** |
| `RelatedSystem_id_seq` | 5 | 5 | true | true | **MATCH** |
| `RequesterUser_id_seq` | 9 | 9 | true | true | **MATCH** |
| `Session_id_seq` | 1 | 1 | false | false | **MATCH** |
| `ticket_number_seq` | 10 | 10 | true | true | **MATCH** |

#### D. Collision-Free Subsequent Allocations
- Post-restore insert into `ActionTaken`: generated ID = **501** (strictly advancing from gap 500 without collision).
- Post-restore insert into `ActionTakenHistory`: generated ID = **601** (strictly advancing from gap 600 without collision).

#### E. Restored Trigger Immutability Enforcement
- Direct raw SQL `UPDATE "ActionTakenHistory" SET version = 999 WHERE id = 601`: rejected by restored trigger `trg_action_history_append_only` with PostgreSQL exception `ActionTakenHistory records are immutable and cannot be updated or deleted`.
- Direct raw SQL `DELETE FROM "ActionTakenHistory" WHERE id = 601`: rejected by restored trigger `trg_action_history_append_only` with PostgreSQL exception `ActionTakenHistory records are immutable and cannot be updated or deleted`.

#### F. Cleanup Verification
- Disposable database `toktickit_recov_src_*`: dropped.
- Disposable database `toktickit_recov_dst_*`: dropped.
- Custom dump file `/tmp/toktickit_recov_*.dump`: removed from container filesystem.
- Zero credentials, dumps, or tokens added to Git tracking.

---

## 3. Integrated Regression Test Suite Status

| Suite / Build | Command | Passed | Failed | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Server Lab 4 Suite** | `npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests/lab-04` | 65 (7 files) | 0 | **PASSED** |
| **Server Full Suite (Labs 1–4)** | `npx dotenv-cli -e server/.env -- npx --prefix server vitest run --root server tests` | 316 (38 files) | 0 | **PASSED** |
| **Client Component Suite** | `npm --prefix client test` | 132 (24 files) | 0 | **PASSED** |
| **Server Production Build** | `npm --prefix server run build` | 1 | 0 | **PASSED** |
| **Client Production Build** | `npm --prefix client run build` | 1 | 0 | **PASSED** |
| **Lab 2 Regression E2E** | `npx playwright test -c playwright.lab2-regression.config.ts` | 10 | 0 | **PASSED** |
| **Lab 3 E2E Suite** | `npx playwright test -c playwright.lab3.config.ts` | 21 | 0 | **PASSED** |
| **Lab 4 E2E Suite** | `npx playwright test -c playwright.lab4.config.ts` | 12 | 0 | **PASSED** |
