-- Lab 3 authentication foundation. This migration preserves existing Lab 2
-- User/Requester IDs, Ticket ownership, and Attachment foreign keys.

CREATE TYPE "UserRole" AS ENUM ('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR');

ALTER TABLE "RequesterUser" RENAME TO "User";
ALTER INDEX "RequesterUser_pkey" RENAME TO "User_pkey";
ALTER INDEX "RequesterUser_email_key" RENAME TO "User_email_key";

ALTER TABLE "User"
  ALTER COLUMN "department" DROP NOT NULL,
  ADD COLUMN "normalizedEmail" TEXT,
  ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT 'scrypt$16384$8$1$dG9rdGlja2l0LWxhYjMtc2FsdC0yMDI2$HFQWJzg_uHLZMKq_9Ud9p8c_-BdNcQPmGLSVM6lTj_ibvxG4g38IkF96BDjFoegMSS6zjXoB7m_W7QBFMoq-xQ',
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'REQUESTER',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

UPDATE "User"
SET "normalizedEmail" = lower(trim("email"));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY "normalizedEmail"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Lab 3 migration blocked: legacy email values collide after normalization; resolve duplicates before retrying';
  END IF;
END $$;

ALTER TABLE "User"
  ALTER COLUMN "normalizedEmail" SET NOT NULL,
  ALTER COLUMN "passwordHash" DROP DEFAULT;

CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

ALTER TABLE "Ticket"
  ADD COLUMN "ownerId" INTEGER;

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");

CREATE TABLE "Session" (
  "id" SERIAL NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "csrfToken" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
