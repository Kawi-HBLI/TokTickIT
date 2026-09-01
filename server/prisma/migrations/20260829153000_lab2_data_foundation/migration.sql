-- Lab 2 requester workflow data foundation.
-- A PostgreSQL sequence generates ticket numbers safely under concurrent
-- inserts without relying on the number of existing rows.

CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "TicketStatus" AS ENUM ('NEW');

CREATE SEQUENCE "ticket_number_seq" START 1;

CREATE FUNCTION next_ticket_number()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
AS $$
  SELECT 'TKT-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    lpad(nextval('"ticket_number_seq"')::TEXT, 5, '0')
$$;

ALTER TABLE "Category"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Category" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "RequesterUser" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RequesterUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RelatedSystem" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RelatedSystem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
  "id" SERIAL NOT NULL,
  "ticketNumber" TEXT NOT NULL DEFAULT next_ticket_number(),
  "requesterId" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "categoryId" INTEGER NOT NULL,
  "relatedSystemId" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "requestedPriority" "TicketPriority" NOT NULL,
  "itPriority" "TicketPriority",
  "currentStatus" "TicketStatus" NOT NULL DEFAULT 'NEW',
  "ticketOwner" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attachment" (
  "id" SERIAL NOT NULL,
  "ticketId" INTEGER NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "isRemoved" BOOLEAN NOT NULL DEFAULT false,
  "removalReason" TEXT,
  "removedAt" TIMESTAMP(3),
  "removedByRequesterId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RequesterUser_email_key" ON "RequesterUser"("email");
CREATE UNIQUE INDEX "RelatedSystem_name_key" ON "RelatedSystem"("name");
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE UNIQUE INDEX "Ticket_requesterId_idempotencyKey_key"
  ON "Ticket"("requesterId", "idempotencyKey");
CREATE INDEX "Ticket_requesterId_updatedAt_idx"
  ON "Ticket"("requesterId", "updatedAt");
CREATE INDEX "Ticket_requesterId_categoryId_idx"
  ON "Ticket"("requesterId", "categoryId");
CREATE INDEX "Ticket_requesterId_requestedPriority_idx"
  ON "Ticket"("requesterId", "requestedPriority");
CREATE UNIQUE INDEX "Attachment_storedName_key" ON "Attachment"("storedName");
CREATE INDEX "Attachment_ticketId_isRemoved_idx"
  ON "Attachment"("ticketId", "isRemoved");

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "RequesterUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_relatedSystemId_fkey"
  FOREIGN KEY ("relatedSystemId") REFERENCES "RelatedSystem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_removedByRequesterId_fkey"
  FOREIGN KEY ("removedByRequesterId") REFERENCES "RequesterUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
