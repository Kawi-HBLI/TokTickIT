import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
import { createTicketRouter } from "./create-ticket.js";
import { attachmentsRouter } from "./attachments-router.js";


// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors({ exposedHeaders: ["Idempotency-Replayed"] }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json({ data: categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: { code: "REFERENCE_DATA_UNAVAILABLE", message: "Categories are temporarily unavailable.", retryable: true } });
  }
});

app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, department: true, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    res.status(200).json({ data: requesters });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "REFERENCE_DATA_UNAVAILABLE",
        message: "Development Requesters are temporarily unavailable.",
        retryable: true,
      },
    });
  }
});

app.get("/api/related-systems", async (_req, res) => {
  try {
    const data = await getPrisma().relatedSystem.findMany({ where: { isActive: true },
      select: { id: true, name: true, description: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { code: "REFERENCE_DATA_UNAVAILABLE", message: "Related Systems are temporarily unavailable.", retryable: true } });
  }
});
app.use("/api/tickets", createTicketRouter);
app.use("/api/attachments", attachmentsRouter);
export default app;
