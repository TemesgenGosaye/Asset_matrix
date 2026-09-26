import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";

export function createTicketTools(organizationId: string, userId: string) {
  return {
    searchTickets: tool({
      description:
        "Search active maintenance and support tickets by status, priority, or keyword.",
      parameters: z.object({
        status: z
          .enum(["new", "in_progress", "resolved", "closed"])
          .optional()
          .describe("Ticket status"),
        priority: z
          .enum(["low", "medium", "high", "critical"])
          .optional()
          .describe("Priority level"),
        query: z.string().optional().describe("Keyword search in ticket title"),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe("Max tickets to return"),
      }),
      execute: async ({ status, priority, query, limit }) => {
        // `tickets` carries no organizationId column, so tenancy is reached
        // through the creating user. Without this filter the tool would return
        // every tenant's tickets to any authenticated assistant user.
        const whereClause: Record<string, unknown> = {
          createdBy: { user: { organizationId } },
        };

        if (status) whereClause.status = status;
        if (priority) whereClause.priority = priority;
        if (query) {
          whereClause.title = { contains: query, mode: "insensitive" };
        }

        const ticketsList = await prisma.tickets.findMany({
          where: whereClause,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user_tickets_assignedToTouser: {
              select: { firstname: true, lastname: true, email: true },
            },
            user_tickets_createdByTouser: {
              select: { firstname: true, lastname: true },
            },
          },
        });

        return {
          total: ticketsList.length,
          tickets: ticketsList.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            createdAt: t.createdAt.toISOString().split("T")[0],
            assignedTo: t.user_tickets_assignedToTouser
              ? `${t.user_tickets_assignedToTouser.firstname || ""} ${t.user_tickets_assignedToTouser.lastname || ""}`.trim()
              : "Unassigned",
            createdBy: t.user_tickets_createdByTouser
              ? `${t.user_tickets_createdByTouser.firstname || ""} ${t.user_tickets_createdByTouser.lastname || ""}`.trim()
              : "System",
          })),
        };
      },
    }),

    draftMaintenanceTicket: tool({
      description:
        "Draft a new maintenance or repair ticket for an asset or house. Returns a formatted preview for human confirmation before submission.",
      parameters: z.object({
        title: z.string().describe("Clear summary title for the ticket"),
        description: z
          .string()
          .describe("Detailed description of the issue or maintenance required"),
        priority: z
          .enum(["low", "medium", "high", "critical"])
          .default("medium")
          .describe("Urgency level"),
        referenceType: z
          .enum(["asset", "house", "general"])
          .default("general")
          .describe("Type of entity affected"),
        referenceId: z
          .string()
          .optional()
          .describe("Asset Tag or House Number"),
      }),
      execute: async ({
        title,
        description,
        priority,
        referenceType,
        referenceId,
      }) => {
        return {
          draftStatus: "ready_for_confirmation",
          action: "create_ticket",
          payload: {
            title,
            description: referenceId
              ? `[Ref: ${referenceType.toUpperCase()} ${referenceId}]\n\n${description}`
              : description,
            priority,
            targetEntity: referenceId || "General",
            draftCreatedForUser: userId,
          },
          confirmationMessage: `Ticket draft prepared: "${title}" (Priority: ${priority.toUpperCase()}). Please review and click 'Submit Ticket' in the tickets portal to confirm.`,
        };
      },
    }),
  };
}
