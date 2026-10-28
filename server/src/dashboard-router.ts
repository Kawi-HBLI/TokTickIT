import { Router, type Request, type Response, type NextFunction } from "express";
import { type TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { requireStaff } from "./staff-queue.js";
import { requireRequester } from "./requester-context.js";

const ACTIVE_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "REOPENED",
];

const RESOLVED_CLOSED_STATUSES: TicketStatus[] = [
  "RESOLVED",
  "CLOSED",
];

export async function getStaffDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const currentUserId = req.auth!.user.id;

    const now = new Date();
    const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const startOfTomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));

    const [
      openTicketsCount,
      unassignedTicketsCount,
      pendingActionsCount,
      completedTodayCount,
      myAssignedTicketsCount,
      myWorkTickets,
      unassignedTickets,
      recentActionsRaw,
    ] = await Promise.all([
      // 1. openTicketsCount: active tickets across team
      prisma.ticket.count({
        where: {
          currentStatus: { in: ACTIVE_STATUSES },
        },
      }),

      // 2. unassignedTicketsCount: active unassigned tickets
      prisma.ticket.count({
        where: {
          ownerId: null,
          currentStatus: { in: ACTIVE_STATUSES },
        },
      }),

      // 3. pendingActionsCount: pending actions assigned to current user on active tickets
      prisma.actionTaken.count({
        where: {
          status: "PENDING",
          assigneeId: currentUserId,
          ticket: {
            currentStatus: { in: ACTIVE_STATUSES },
          },
        },
      }),

      // 4. completedTodayCount: actions completed by current user today (UTC)
      prisma.actionTaken.count({
        where: {
          status: "COMPLETED",
          completedById: currentUserId,
          completedAt: {
            gte: startOfTodayUtc,
            lt: startOfTomorrowUtc,
          },
        },
      }),

      // 5. myAssignedTicketsCount: active tickets owned by current user
      prisma.ticket.count({
        where: {
          ownerId: currentUserId,
          currentStatus: { in: ACTIVE_STATUSES },
        },
      }),

      // 6. myWork: up to 5 active tickets owned by current user
      prisma.ticket.findMany({
        where: {
          ownerId: currentUserId,
          currentStatus: { in: ACTIVE_STATUSES },
        },
        take: 5,
        orderBy: [
          { itPriority: "desc" },
          { updatedAt: "desc" },
          { ticketNumber: "desc" },
        ],
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          requestedPriority: true,
          itPriority: true,
          currentStatus: true,
          updatedAt: true,
          createdAt: true,
          _count: {
            select: {
              actionsTaken: {
                where: { status: "PENDING" },
              },
            },
          },
        },
      }),

      // 7. unassignedQueue: up to 5 active unassigned tickets
      prisma.ticket.findMany({
        where: {
          ownerId: null,
          currentStatus: { in: ACTIVE_STATUSES },
        },
        take: 5,
        orderBy: [
          { itPriority: "desc" },
          { updatedAt: "desc" },
          { ticketNumber: "desc" },
        ],
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          requestedPriority: true,
          itPriority: true,
          currentStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // 8. recentActions: up to 10 latest actions
      prisma.actionTaken.findMany({
        take: 10,
        orderBy: [
          { updatedAt: "desc" },
          { id: "desc" },
        ],
        include: {
          ticket: {
            select: {
              ticketNumber: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const myWorkItems = myWorkTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      pendingActionsCount: t._count.actionsTaken,
      updatedAt: t.updatedAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }));

    const unassignedItems = unassignedTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    const recentActions = recentActionsRaw.map((a) => {
      const performerName = a.completedBy?.name ?? a.assignee?.name ?? a.createdBy.name;
      return {
        id: a.id,
        ticketId: a.ticketId,
        ticketNumber: a.ticket.ticketNumber,
        description: a.description,
        status: a.status,
        performerName,
        completedBy: a.completedBy
          ? { id: a.completedBy.id, name: a.completedBy.name, email: a.completedBy.email }
          : null,
        completedAt: a.completedAt?.toISOString() ?? null,
        result: a.result,
        updatedAt: a.updatedAt.toISOString(),
      };
    });

    res.status(200).json({
      data: {
        metrics: {
          openTicketsCount,
          pendingActionsCount,
          completedActionsTodayCount: completedTodayCount,
          completedTodayCount,
          unassignedTicketsCount,
          myAssignedTicketsCount,
        },
        myWork: {
          assignedTicketsCount: myAssignedTicketsCount,
          items: myWorkItems,
        },
        myAssignedWork: myWorkItems,
        unassignedQueue: {
          total: unassignedTicketsCount,
          items: unassignedItems,
        },
        recentActions,
        recentActionActivity: recentActions,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getRequesterDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const prisma = getPrisma();
    const currentUserId = req.auth!.user.id;

    const [
      activeTicketsCount,
      awaitingRequesterCount,
      resolvedClosedCount,
      recentTicketsRaw,
    ] = await Promise.all([
      // 1. activeTicketsCount: requester-owned active tickets
      prisma.ticket.count({
        where: {
          requesterId: currentUserId,
          currentStatus: { in: ACTIVE_STATUSES },
        },
      }),

      // 2. awaitingRequesterCount: requester-owned tickets in WAITING_FOR_REQUESTER
      prisma.ticket.count({
        where: {
          requesterId: currentUserId,
          currentStatus: "WAITING_FOR_REQUESTER",
        },
      }),

      // 3. resolvedClosedCount: requester-owned tickets in RESOLVED or CLOSED
      prisma.ticket.count({
        where: {
          requesterId: currentUserId,
          currentStatus: { in: RESOLVED_CLOSED_STATUSES },
        },
      }),

      // 4. recentTickets: up to 5 tickets owned by requester
      prisma.ticket.findMany({
        where: {
          requesterId: currentUserId,
        },
        take: 5,
        orderBy: [
          { updatedAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          ticketNumber: true,
          summary: true,
          currentStatus: true,
          updatedAt: true,
          createdAt: true,
          publicComments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              content: true,
              createdAt: true,
              author: {
                select: {
                  name: true,
                  role: true,
                },
              },
            },
          },
          actionsTaken: {
            take: 1,
            orderBy: { updatedAt: "desc" },
            select: {
              description: true,
              result: true,
              status: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    const recentTickets = recentTicketsRaw.map((t) => {
      let latestPublicUpdate = `Ticket status is ${t.currentStatus.toLowerCase().replace(/_/g, " ")}.`;

      const latestComment = t.publicComments[0];
      const latestAction = t.actionsTaken[0];

      if (latestComment && latestAction) {
        if (latestComment.createdAt >= latestAction.updatedAt) {
          const prefix = latestComment.author.role === "REQUESTER" ? "You commented" : "Staff commented";
          latestPublicUpdate = `${prefix}: ${latestComment.content}`;
        } else {
          if (latestAction.status === "COMPLETED") {
            latestPublicUpdate = `Action completed: ${latestAction.result || latestAction.description}`;
          } else {
            latestPublicUpdate = `Action ${latestAction.status.toLowerCase()}: ${latestAction.description}`;
          }
        }
      } else if (latestComment) {
        const prefix = latestComment.author.role === "REQUESTER" ? "You commented" : "Staff commented";
        latestPublicUpdate = `${prefix}: ${latestComment.content}`;
      } else if (latestAction) {
        if (latestAction.status === "COMPLETED") {
          latestPublicUpdate = `Action completed: ${latestAction.result || latestAction.description}`;
        } else {
          latestPublicUpdate = `Action ${latestAction.status.toLowerCase()}: ${latestAction.description}`;
        }
      }

      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        currentStatus: t.currentStatus,
        latestPublicUpdate,
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    res.status(200).json({
      data: {
        metrics: {
          activeTicketsCount,
          openTicketsCount: activeTicketsCount,
          awaitingRequesterCount,
          awaitingInputTicketsCount: awaitingRequesterCount,
          resolvedClosedCount,
          resolvedTicketsCount: resolvedClosedCount,
        },
        recentTickets,
        recentActivity: recentTickets,
      },
    });
  } catch (err) {
    next(err);
  }
}

export const dashboardRouter = Router();

dashboardRouter.get("/staff/dashboard", requireStaff, getStaffDashboard);
dashboardRouter.get("/requester/dashboard", requireRequester, getRequesterDashboard);
