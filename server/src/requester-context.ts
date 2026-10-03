import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { requireAuth, requireCsrf } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      requester?: User;
    }
  }
}

function roleError(res: Response) {
  return res.status(403).json({
    error: {
      code: "FORBIDDEN",
      message: "This operation is available to Requester accounts only.",
      retryable: false,
    },
  });
}

export async function requireRequester(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.auth?.user.role !== "REQUESTER") {
      roleError(res);
      return;
    }

    // The only source of Requester identity is the verified server-side
    // session. Keep the request property temporarily as a migration seam for
    // the Lab 2 handlers; no client-controlled header/body value is read.
    req.requester = req.auth.user;
    next();
  });
}

/** Requester-owned writes require both the authenticated role and CSRF. */
export function requireRequesterWrite(req: Request, res: Response, next: NextFunction) {
  requireRequester(req, res, () => requireCsrf(req, res, next));
}
