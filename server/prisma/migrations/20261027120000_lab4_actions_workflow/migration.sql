-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ActionStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ActionEventType" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "ActionTaken" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "completedById" INTEGER,
    "status" "ActionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "result" TEXT,
    "cancellationReason" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "followUpNote" TEXT,
    "attachmentNotes" TEXT,
    "idempotencyKey" TEXT,
    "creationFingerprint" TEXT,
    "creationResponse" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ActionTaken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionTakenHistory" (
    "id" SERIAL NOT NULL,
    "actionId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "actorId" INTEGER NOT NULL,
    "eventType" "ActionEventType" NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionTakenHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionTaken_ticketId_status_idx" ON "ActionTaken"("ticketId", "status");

-- CreateIndex
CREATE INDEX "ActionTaken_assigneeId_status_idx" ON "ActionTaken"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "ActionTaken_completedById_status_completedAt_idx" ON "ActionTaken"("completedById", "status", "completedAt");

-- CreateIndex
CREATE INDEX "ActionTaken_idempotencyKey_idx" ON "ActionTaken"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ActionTakenHistory_actionId_createdAt_idx" ON "ActionTakenHistory"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionTakenHistory_ticketId_createdAt_idx" ON "ActionTakenHistory"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionTakenHistory_actorId_createdAt_idx" ON "ActionTakenHistory"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTaken" ADD CONSTRAINT "ActionTaken_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenHistory" ADD CONSTRAINT "ActionTakenHistory_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionTaken"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenHistory" ADD CONSTRAINT "ActionTakenHistory_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionTakenHistory" ADD CONSTRAINT "ActionTakenHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only enforcement trigger on ActionTakenHistory
CREATE OR REPLACE FUNCTION fn_prevent_action_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ActionTakenHistory records are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_action_history_append_only
BEFORE UPDATE OR DELETE ON "ActionTakenHistory"
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_action_history_mutation();
