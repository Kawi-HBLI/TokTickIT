import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { getPrisma } from "./prisma.js";

declare global {
  namespace Express {
    interface Request {
      requester?: User;
    }
  }
}

function contextError(
  res: Response,
  code: "REQUESTER_CONTEXT_REQUIRED" | "INVALID_REQUESTER_CONTEXT",
  message: string,
) {
  return res.status(400).json({
    error: { code, message, retryable: false },
  });
}

export async function requireRequester(req: Request, res: Response, next: NextFunction) {
  const raw = req.header("x-requester-id");
  if (!raw || !/^[1-9]\d*$/.test(raw)) {
    contextError(
      res,
      "REQUESTER_CONTEXT_REQUIRED",
      "A valid Development Requester header is required.",
    );
    return;
  }

  const requesterId = Number(raw);
  if (!Number.isSafeInteger(requesterId) || requesterId > 2_147_483_647) {
    contextError(
      res,
      "REQUESTER_CONTEXT_REQUIRED",
      "A valid Development Requester header is required.",
    );
    return;
  }

  try {
    const requester = await getPrisma().user.findFirst({
      where: { id: requesterId, isActive: true, role: "REQUESTER" },
    });
    if (!requester) {
      contextError(
        res,
        "INVALID_REQUESTER_CONTEXT",
        "The Development Requester is unknown or inactive.",
      );
      return;
    }
    req.requester = requester;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: {
        code: "REQUESTER_CONTEXT_UNAVAILABLE",
        message: "The Requester context could not be verified.",
        retryable: true,
      },
    });
  }
}
