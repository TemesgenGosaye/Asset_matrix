import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getOrganizationContext } from "@/lib/organization-context";
import {
  notifyTicketAssigned,
  notifyTicketStatusChanged,
} from "@/lib/notifications";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH /api/tickets/[id]
// Update a local ticket (status, priority, assignedTo)
// Only admins can update tickets
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requireApiAdmin();
    const { id } = await params;
    const body = await req.json();

    const { status, priority, assignedTo } = body || {};

    // Fetch the existing ticket and verify it belongs to admin's org
    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id;

    const existingTicket = await prisma.tickets.findFirst({
      where: {
        id,
        ...(orgId
          ? { user_tickets_createdByTouser: { organizationId: orgId } }
          : {}),
      },
      select: { status: true, assignedTo: true, title: true },
    });

    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;

    const rawTicket = await prisma.tickets.update({
      where: { id },
      data: updateData,
      include: {
        user_tickets_createdByTouser: {
          select: {
            userid: true,
            username: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
        user_tickets_assignedToTouser: {
          select: {
            userid: true,
            username: true,
            firstname: true,
            lastname: true,
            email: true,
          },
        },
      },
    });

    // Map Prisma relation names to expected interface names
    const ticket = {
      ...rawTicket,
      creator: rawTicket.user_tickets_createdByTouser,
      assignee: rawTicket.user_tickets_assignedToTouser,
      comments: [],
    };

    // Fire-and-forget: notify assignee if assignedTo changed
    if (
      assignedTo &&
      assignedTo !== existingTicket.assignedTo &&
      ticket.assignee?.email
    ) {
      const assigneeName = `${ticket.assignee.firstname} ${ticket.assignee.lastname}`;
      notifyTicketAssigned(
        existingTicket.title,
        id,
        ticket.assignee.email,
        ticket.assignee.userid,
        assigneeName,
      ).catch((e) =>
        logger.error("Failed to send ticket assignment notification", {
          error: e,
        }),
      );
    }

    // Fire-and-forget: notify creator if status changed
    if (status && status !== existingTicket.status && ticket.creator?.email) {
      const creatorName = `${ticket.creator.firstname} ${ticket.creator.lastname}`;
      notifyTicketStatusChanged(
        existingTicket.title,
        id,
        ticket.creator.email,
        ticket.creator.userid,
        creatorName,
        existingTicket.status,
        status,
      ).catch((e) =>
        logger.error("Failed to send ticket status change notification", {
          error: e,
        }),
      );
    }

    return NextResponse.json(ticket, { status: 200 });
  } catch (error) {
    logger.error("PATCH /api/tickets/[id] error", { error });
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json(
          { error: "Forbidden: Admin access required" },
          { status: 403 },
        );
      }
    }
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
