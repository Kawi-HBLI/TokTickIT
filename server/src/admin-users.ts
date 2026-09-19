import { Router, type Request, type Response, type NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireCsrf } from "./auth.js";
import { hashPassword, normalizeEmail, validatePassword } from "./auth-crypto.js";

const VALID_ROLES: readonly UserRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

export function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export function safeAdminUser(user: {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: typeof user.createdAt === "string" ? user.createdAt : user.createdAt.toISOString(),
    updatedAt: typeof user.updatedAt === "string" ? user.updatedAt : user.updatedAt.toISOString(),
  };
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function errorResponse(
  res: Response,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>
) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
      retryable: false,
    },
  });
}

export function requireAdministrator(req: Request, res: Response, next: NextFunction): void {
  const user = req.auth?.user;
  if (!user) {
    errorResponse(res, 401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    return;
  }
  if (user.role !== "ADMINISTRATOR") {
    errorResponse(res, 403, "FORBIDDEN", "You do not have permission to access administrator resources.");
    return;
  }
  next();
}

export const adminUsersRouter = Router();

// Apply authentication and role check to all admin user endpoints
adminUsersRouter.use(requireAuth, requireAdministrator);

// ---------------------------------------------------------------------------
// GET /api/admin/users - List users with search and role filter
// ---------------------------------------------------------------------------
adminUsersRouter.get("/", async (req: Request, res: Response) => {
  try {
    const queryKeys = Object.keys(req.query);
    const allowedQueryKeys = ["q", "role"];
    if (!queryKeys.every((key) => allowedQueryKeys.includes(key))) {
      errorResponse(res, 400, "INVALID_QUERY", "Unknown query parameters.");
      return;
    }

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const roleParam = typeof req.query.role === "string" ? req.query.role.trim().toUpperCase() : "";

    if (roleParam && !VALID_ROLES.includes(roleParam as UserRole)) {
      errorResponse(res, 400, "INVALID_QUERY", "Invalid role query parameter.");
      return;
    }

    const whereConditions: Array<Record<string, unknown>> = [];

    if (q.length > 0) {
      whereConditions.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (roleParam) {
      whereConditions.push({ role: roleParam as UserRole });
    }

    const users = await getPrisma().user.findMany({
      where: whereConditions.length > 0 ? { AND: whereConditions } : undefined,
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ data: users.map(safeAdminUser) });
  } catch (error) {
    console.error("Failed to list users:", error);
    errorResponse(res, 500, "ADMIN_USERS_UNAVAILABLE", "Failed to retrieve user list.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users - Create new user with initial password
// ---------------------------------------------------------------------------
adminUsersRouter.post("/", requireCsrf, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const allowedKeys = ["name", "email", "role", "isActive", "initialPassword"];
    if (!hasOnlyKeys(body, allowedKeys)) {
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.");
      return;
    }

    const fields: Record<string, string> = {};

    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    if (!rawName || rawName.length < 2) {
      fields.name = "Name must contain at least 2 characters.";
    } else if (rawName.length > 100) {
      fields.name = "Name must not exceed 100 characters.";
    }

    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    if (!rawEmail) {
      fields.email = "Email is required.";
    } else if (!isValidEmail(rawEmail)) {
      fields.email = "Enter a valid email address.";
    }

    const rawRole = typeof body.role === "string" ? body.role.trim().toUpperCase() : "";
    if (!rawRole) {
      fields.role = "Role is required.";
    } else if (!VALID_ROLES.includes(rawRole as UserRole)) {
      fields.role = "Role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.";
    }

    if (typeof body.isActive !== "boolean") {
      fields.isActive = "Active status must be true or false.";
    }

    const normalized = rawEmail ? normalizeEmail(rawEmail) : "";
    const passwordError = validatePassword(body.initialPassword, normalized);
    if (passwordError) {
      fields.initialPassword = passwordError;
    }

    if (Object.keys(fields).length > 0) {
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.", fields);
      return;
    }

    const existing = await getPrisma().user.findUnique({
      where: { normalizedEmail: normalized },
      select: { id: true },
    });

    if (existing) {
      errorResponse(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email address already exists.", {
        email: "This email address is already in use.",
      });
      return;
    }

    const passwordHash = await hashPassword(body.initialPassword as string);

    const newUser = await getPrisma().user.create({
      data: {
        name: rawName,
        email: rawEmail,
        normalizedEmail: normalized,
        role: rawRole as UserRole,
        isActive: body.isActive as boolean,
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.setHeader("Location", `/api/admin/users/${newUser.id}`);
    res.status(201).json({ data: safeAdminUser(newUser) });
  } catch (error) {
    console.error("Failed to create user:", error);
    errorResponse(res, 500, "USER_CREATE_FAILED", "Failed to create user.");
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id - Edit user
// ---------------------------------------------------------------------------
adminUsersRouter.patch("/:id", requireCsrf, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    errorResponse(res, 400, "INVALID_USER_ID", "A valid user ID is required.");
    return;
  }

  const currentAdmin = req.auth!.user;

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const allowedKeys = ["name", "email", "role", "isActive", "expectedUpdatedAt"];
    if (!hasOnlyKeys(body, allowedKeys)) {
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.");
      return;
    }

    const updateFields = Object.keys(body).filter((k) =>
      ["name", "email", "role", "isActive"].includes(k)
    );
    if (updateFields.length === 0) {
      errorResponse(res, 400, "VALIDATION_ERROR", "At least one field to update is required.");
      return;
    }

    const fields: Record<string, string> = {};
    const updateData: {
      name?: string;
      email?: string;
      normalizedEmail?: string;
      role?: UserRole;
      isActive?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length < 2) {
        fields.name = "Name must contain at least 2 characters.";
      } else if (body.name.trim().length > 100) {
        fields.name = "Name must not exceed 100 characters.";
      } else {
        updateData.name = body.name.trim();
      }
    }

    if (body.email !== undefined) {
      if (typeof body.email !== "string" || !body.email.trim()) {
        fields.email = "Email is required.";
      } else if (!isValidEmail(body.email)) {
        fields.email = "Enter a valid email address.";
      } else {
        updateData.email = body.email.trim();
        updateData.normalizedEmail = normalizeEmail(body.email);
      }
    }

    if (body.role !== undefined) {
      if (typeof body.role !== "string" || !VALID_ROLES.includes(body.role.trim().toUpperCase() as UserRole)) {
        fields.role = "Role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.";
      } else {
        updateData.role = body.role.trim().toUpperCase() as UserRole;
      }
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        fields.isActive = "Active status must be true or false.";
      } else {
        updateData.isActive = body.isActive;
      }
    }

    if (body.expectedUpdatedAt !== undefined && typeof body.expectedUpdatedAt !== "string") {
      fields.expectedUpdatedAt = "expectedUpdatedAt must be a valid ISO date string.";
    }

    if (Object.keys(fields).length > 0) {
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.", fields);
      return;
    }

    const result = await getPrisma().$transaction(
      async (tx) => {
        // Serializes concurrent administrator modifications to eliminate race conditions
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin_user_management'))`;

        // Re-read target user under the lock
        const currentTarget = await tx.user.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            updatedAt: true,
          },
        });

        if (!currentTarget) {
          const err = new Error("User not found.");
          (err as unknown as { code: string; statusCode: number }).statusCode = 404;
          (err as unknown as { code: string; statusCode: number }).code = "USER_NOT_FOUND";
          throw err;
        }

        // Optimistic locking check if expectedUpdatedAt was supplied
        if (body.expectedUpdatedAt !== undefined) {
          const expectedDate = new Date(body.expectedUpdatedAt as string);
          if (
            Number.isNaN(expectedDate.getTime()) ||
            currentTarget.updatedAt.toISOString() !== expectedDate.toISOString()
          ) {
            const err = new Error("The user was modified concurrently. Refresh and try again.");
            (err as unknown as { code: string; statusCode: number }).statusCode = 409;
            (err as unknown as { code: string; statusCode: number }).code = "USER_VERSION_CONFLICT";
            throw err;
          }
        }

        // Duplicate email check
        if (updateData.normalizedEmail && updateData.normalizedEmail !== normalizeEmail(currentTarget.email)) {
          const emailConflict = await tx.user.findFirst({
            where: { normalizedEmail: updateData.normalizedEmail, id: { not: targetId } },
            select: { id: true },
          });
          if (emailConflict) {
            const err = new Error("This email address is already in use.");
            (err as unknown as { code: string; statusCode: number; field: string }).statusCode = 409;
            (err as unknown as { code: string; statusCode: number; field: string }).code = "EMAIL_ALREADY_EXISTS";
            (err as unknown as { code: string; statusCode: number; field: string }).field = "email";
            throw err;
          }
        }

        // Safety Invariant 1: Self-deactivation forbidden (409)
        if (targetId === currentAdmin.id && updateData.isActive === false) {
          const err = new Error("Administrators cannot deactivate their own account.");
          (err as unknown as { code: string; statusCode: number }).statusCode = 409;
          (err as unknown as { code: string; statusCode: number }).code = "SELF_DEACTIVATION_FORBIDDEN";
          throw err;
        }

        // Safety Invariant 2: Last active Administrator protection (409)
        const isTargetActiveAdmin = currentTarget.role === "ADMINISTRATOR" && currentTarget.isActive;
        const willBeInactiveOrNonAdmin =
          updateData.isActive === false || (updateData.role !== undefined && updateData.role !== "ADMINISTRATOR");

        if (isTargetActiveAdmin && willBeInactiveOrNonAdmin) {
          const activeAdminCount = await tx.user.count({
            where: { role: "ADMINISTRATOR", isActive: true },
          });
          if (activeAdminCount <= 1) {
            const err = new Error("Cannot deactivate or change the role of the last active Administrator.");
            (err as unknown as { code: string; statusCode: number }).statusCode = 409;
            (err as unknown as { code: string; statusCode: number }).code = "LAST_ACTIVE_ADMIN_REQUIRED";
            throw err;
          }
        }

        const updated = await tx.user.update({
          where: { id: targetId },
          data: updateData,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // Revoke active sessions if role or activation state changed
        const roleChanged = updateData.role !== undefined && updateData.role !== currentTarget.role;
        const activeChanged = updateData.isActive !== undefined && updateData.isActive !== currentTarget.isActive;
        if (roleChanged || activeChanged) {
          await tx.session.deleteMany({ where: { userId: targetId } });
        }

        // Ticket unassignment: deactivation or downgrade to REQUESTER atomically unassigns owned tickets
        let unassignedTicketCount: number | undefined;
        const downgradedToRequester = updateData.role === "REQUESTER" && currentTarget.role !== "REQUESTER";
        const deactivated = updateData.isActive === false && currentTarget.isActive;
        if (downgradedToRequester || deactivated) {
          const unassigned = await tx.ticket.updateMany({
            where: { ownerId: targetId },
            data: { ownerId: null },
          });
          unassignedTicketCount = unassigned.count;
        }

        return { updated, unassignedTicketCount };
      },
      { isolationLevel: "Serializable" }
    );

    const safeUserResult = safeAdminUser(result.updated);
    const responsePayload: { data: SafeUser & { unassignedTicketCount?: number }; unassignedTicketCount?: number } = {
      data: safeUserResult,
    };
    if (result.unassignedTicketCount !== undefined) {
      responsePayload.unassignedTicketCount = result.unassignedTicketCount;
      responsePayload.data.unassignedTicketCount = result.unassignedTicketCount;
    }

    res.status(200).json(responsePayload);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const customErr = error as { code: string; statusCode?: number; message: string; field?: string };
      if (customErr.code === "EMAIL_ALREADY_EXISTS") {
        errorResponse(res, 409, "EMAIL_ALREADY_EXISTS", customErr.message, { email: customErr.message });
        return;
      }
      if (customErr.code === "SELF_DEACTIVATION_FORBIDDEN") {
        errorResponse(res, 409, "SELF_DEACTIVATION_FORBIDDEN", customErr.message);
        return;
      }
      if (customErr.code === "LAST_ACTIVE_ADMIN_REQUIRED") {
        errorResponse(res, 409, "LAST_ACTIVE_ADMIN_REQUIRED", customErr.message);
        return;
      }
      if (customErr.code === "USER_VERSION_CONFLICT") {
        errorResponse(res, 409, "USER_VERSION_CONFLICT", customErr.message);
        return;
      }
      if (customErr.code === "USER_NOT_FOUND") {
        errorResponse(res, 404, "USER_NOT_FOUND", customErr.message);
        return;
      }
    }
    console.error("Failed to update user:", error);
    errorResponse(res, 500, "USER_UPDATE_FAILED", "Failed to update user.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/initial-password - Set initial password for user
// ---------------------------------------------------------------------------
adminUsersRouter.post("/:id/initial-password", requireCsrf, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    errorResponse(res, 400, "INVALID_USER_ID", "A valid user ID is required.");
    return;
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!hasOnlyKeys(body, ["initialPassword"])) {
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.");
      return;
    }

    const targetUser = await getPrisma().user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        name: true,
        email: true,
        normalizedEmail: true,
      },
    });

    if (!targetUser) {
      errorResponse(res, 404, "USER_NOT_FOUND", "User not found.");
      return;
    }

    const passwordError = validatePassword(body.initialPassword, targetUser.normalizedEmail);
    if (passwordError) {
      errorResponse(res, 400, "VALIDATION_ERROR", passwordError, { initialPassword: passwordError });
      return;
    }

    const passwordHash = await hashPassword(body.initialPassword as string);

    const updatedUser = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetId },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Revoke all active sessions immediately
      await tx.session.deleteMany({ where: { userId: targetId } });

      return updated;
    });

    res.status(200).json({ data: safeAdminUser(updatedUser) });
  } catch (error) {
    console.error("Failed to set initial password:", error);
    errorResponse(res, 500, "INITIAL_PASSWORD_UPDATE_FAILED", "Failed to set initial password.");
  }
});
