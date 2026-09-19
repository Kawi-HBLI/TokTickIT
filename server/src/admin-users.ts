import { Router, type Request, type Response, type NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireAuth, requireCsrf } from "./auth.js";
import { hashPassword, normalizeEmail, INITIAL_PASSWORD } from "./auth-crypto.js";

const VALID_ROLES: readonly UserRole[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

export function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function safeAdminUser(user: {
  id: number;
  name: string;
  email: string;
  department: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    department: user.department,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
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
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const roleParam = typeof req.query.role === "string" ? req.query.role.trim().toUpperCase() : "";

    const whereConditions: Array<Record<string, unknown>> = [];

    if (q.length > 0) {
      whereConditions.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (roleParam && VALID_ROLES.includes(roleParam as UserRole)) {
      whereConditions.push({ role: roleParam as UserRole });
    }

    const users = await getPrisma().user.findMany({
      where: whereConditions.length > 0 ? { AND: whereConditions } : undefined,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
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
    const fields: Record<string, string> = {};

    const rawName = typeof body.name === "string" ? body.name.trim() : "";
    if (!rawName) {
      fields.name = "Name is required.";
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

    if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
      fields.isActive = "Active status must be true or false.";
    }

    if (body.department !== undefined && body.department !== null && typeof body.department !== "string") {
      fields.department = "Department must be a string.";
    }

    if (Object.keys(fields).length > 0) {
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.", fields);
      return;
    }

    const normalized = normalizeEmail(rawEmail);
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

    const department =
      typeof body.department === "string" && body.department.trim().length > 0
        ? body.department.trim()
        : null;

    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
    const passwordHash = await hashPassword(INITIAL_PASSWORD);

    const newUser = await getPrisma().user.create({
      data: {
        name: rawName,
        email: rawEmail,
        normalizedEmail: normalized,
        department,
        role: rawRole as UserRole,
        isActive,
        passwordHash,
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({ data: safeAdminUser(newUser) });
  } catch (error) {
    console.error("Failed to create user:", error);
    errorResponse(res, 500, "CREATE_USER_FAILED", "Failed to create user.");
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

  try {
    const currentAdmin = req.auth!.user;
    const targetUser = await getPrisma().user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!targetUser) {
      errorResponse(res, 404, "USER_NOT_FOUND", "The requested user does not exist.");
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    const updateData: {
      name?: string;
      email?: string;
      normalizedEmail?: string;
      department?: string | null;
      role?: UserRole;
      isActive?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        fields.name = "Name is required.";
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
        const normalized = normalizeEmail(body.email);
        if (normalized !== normalizeEmail(targetUser.email)) {
          const existing = await getPrisma().user.findFirst({
            where: { normalizedEmail: normalized, id: { not: targetId } },
            select: { id: true },
          });
          if (existing) {
            fields.email = "This email address is already in use.";
          } else {
            updateData.email = body.email.trim();
            updateData.normalizedEmail = normalized;
          }
        }
      }
    }

    if (body.department !== undefined) {
      updateData.department =
        typeof body.department === "string" && body.department.trim().length > 0
          ? body.department.trim()
          : null;
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

    if (Object.keys(fields).length > 0) {
      if (fields.email === "This email address is already in use.") {
        errorResponse(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email address already exists.", fields);
        return;
      }
      errorResponse(res, 400, "VALIDATION_ERROR", "Check the highlighted fields and try again.", fields);
      return;
    }

    // Safety Invariant 1: Self-deactivation prevention
    if (targetUser.id === currentAdmin.id && updateData.isActive === false) {
      errorResponse(
        res,
        400,
        "CANNOT_DEACTIVATE_SELF",
        "Administrators cannot deactivate their own account."
      );
      return;
    }

    // Safety Invariant 2: Self-demotion prevention
    if (targetUser.id === currentAdmin.id && updateData.role && updateData.role !== "ADMINISTRATOR") {
      errorResponse(
        res,
        400,
        "CANNOT_DEMOTE_SELF",
        "Administrators cannot change their own role."
      );
      return;
    }

    const updatedUser = await getPrisma().$transaction(
      async (tx) => {
        // Serializes concurrent administrator modifications to eliminate race conditions
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin_user_management'))`;

        // Re-read target user under the lock to prevent stale state
        const currentTarget = await tx.user.findUnique({
          where: { id: targetId },
          select: { id: true, role: true, isActive: true },
        });

        if (!currentTarget) {
          const err = new Error("User not found.");
          (err as unknown as { code: string; statusCode: number }).statusCode = 404;
          (err as unknown as { code: string; statusCode: number }).code = "USER_NOT_FOUND";
          throw err;
        }

        // Safety Invariant 3: Last active Administrator protection (evaluated inside the lock)
        const isTargetActiveAdmin = currentTarget.role === "ADMINISTRATOR" && currentTarget.isActive;
        const willBeInactiveOrNonAdmin =
          updateData.isActive === false || (updateData.role && updateData.role !== "ADMINISTRATOR");

        if (isTargetActiveAdmin && willBeInactiveOrNonAdmin) {
          const activeAdminCount = await tx.user.count({
            where: { role: "ADMINISTRATOR", isActive: true },
          });
          if (activeAdminCount <= 1) {
            const err = new Error("Cannot deactivate or change the role of the last active Administrator.");
            (err as unknown as { code: string; statusCode: number }).statusCode = 400;
            (err as unknown as { code: string; statusCode: number }).code = "LAST_ACTIVE_ADMINISTRATOR";
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
            department: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        // If user was deactivated, revoke all active sessions immediately
        if (updateData.isActive === false) {
          await tx.session.deleteMany({ where: { userId: targetId } });
        }

        return updated;
      },
      { isolationLevel: "Serializable" }
    );

    res.status(200).json({ data: safeAdminUser(updatedUser) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const customErr = error as { code: string; statusCode?: number; message: string };
      if (customErr.code === "LAST_ACTIVE_ADMINISTRATOR") {
        errorResponse(res, 400, "LAST_ACTIVE_ADMINISTRATOR", customErr.message);
        return;
      }
      if (customErr.code === "USER_NOT_FOUND") {
        errorResponse(res, 404, "USER_NOT_FOUND", customErr.message);
        return;
      }
    }
    console.error("Failed to update user:", error);
    errorResponse(res, 500, "UPDATE_USER_FAILED", "Failed to update user.");
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/reset-password - Reset user password to initial password
// ---------------------------------------------------------------------------
adminUsersRouter.post("/:id/reset-password", requireCsrf, async (req: Request, res: Response) => {
  const targetId = parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    errorResponse(res, 400, "INVALID_USER_ID", "A valid user ID is required.");
    return;
  }

  try {
    const targetUser = await getPrisma().user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true },
    });

    if (!targetUser) {
      errorResponse(res, 404, "USER_NOT_FOUND", "The requested user does not exist.");
      return;
    }

    const passwordHash = await hashPassword(INITIAL_PASSWORD);

    await getPrisma().$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: {
          passwordHash,
          mustChangePassword: true,
          passwordChangedAt: null,
        },
      });

      // Terminate all sessions for the target user so they must sign in with initial password
      await tx.session.deleteMany({ where: { userId: targetId } });
    });

    res.status(200).json({
      data: {
        message: `Password for ${targetUser.name} has been reset to the initial password.`,
      },
    });
  } catch (error) {
    console.error("Failed to reset password:", error);
    errorResponse(res, 500, "RESET_PASSWORD_FAILED", "Failed to reset user password.");
  }
});
