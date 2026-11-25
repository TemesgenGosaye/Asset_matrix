import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "../../../../lib/prisma";
import { requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, createAuditLog } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const actingUser = await requireApiAdmin();
    const { assetId, userId } = await req.json();

    if (!assetId || !userId) {
      return new Response(
        JSON.stringify({ error: "Asset ID and User ID are required" }),
        {
          status: 400,
        },
      );
    }

    const [asset, directUser] = await Promise.all([
      prisma.asset.findUnique({
        where: { assetid: assetId },
        select: { assetid: true, organizationId: true },
      }),
      prisma.user.findUnique({
        where: { userid: userId },
        select: {
          userid: true,
          organizationId: true,
          isActive: true,
        },
      }),
    ]);

    if (!asset) {
      return new Response(JSON.stringify({ error: "Asset not found" }), {
        status: 404,
      });
    }

    let targetUser = directUser;
    let employeeToLink: {
      id: string;
      organizationId: string;
      departmentId: string | null;
      firstname: string;
      lastname: string;
      employeeNumber: string;
    } | null = null;

    if (!targetUser) {
      const employee = await prisma.employee.findFirst({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          userid: true,
          organizationId: true,
          departmentId: true,
          firstname: true,
          lastname: true,
          employeeNumber: true,
        },
      });
      if (!employee) {
        return new Response(
          JSON.stringify({ error: "Employee user not found" }),
          { status: 404 },
        );
      }
      if (
        actingUser.organizationId &&
        employee.organizationId !== actingUser.organizationId
      ) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }
      if (employee.userid) {
        targetUser = await prisma.user.findUnique({
          where: { userid: employee.userid },
          select: { userid: true, organizationId: true, isActive: true },
        });
      } else {
        employeeToLink = employee;
      }
    }

    if (!targetUser && !employeeToLink) {
      return new Response(
        JSON.stringify({ error: "Employee user not found" }),
        { status: 404 },
      );
    }
    if (actingUser.organizationId && asset.organizationId) {
      if (asset.organizationId !== actingUser.organizationId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }
    }
    if (targetUser && actingUser.organizationId && targetUser.organizationId) {
      if (targetUser.organizationId !== actingUser.organizationId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
        });
      }
    }
    if (targetUser && !targetUser.isActive) {
      return new Response(
        JSON.stringify({ error: "The selected employee is inactive" }),
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      let resolvedUserId = targetUser?.userid;
      if (!resolvedUserId && employeeToLink) {
        const createdUser = await tx.user.create({
          data: {
            firstname: employeeToLink.firstname,
            lastname: employeeToLink.lastname,
            email: `emp-${employeeToLink.id}@employee.local`,
            isadmin: false,
            canrequest: true,
            isActive: true,
            authProvider: "employee",
            organizationId: employeeToLink.organizationId,
            departmentId: employeeToLink.departmentId,
            creation_date: new Date(),
          },
          select: { userid: true },
        });
        await tx.employee.update({
          where: { id: employeeToLink.id },
          data: { userid: createdUser.userid },
        });
        resolvedUserId = createdUser.userid;
      }
      if (!resolvedUserId) {
        throw new Error("Employee user not found");
      }

      // Resolve the "Assigned" status first (preferred when assigning),
      // then fall back to "Active", then the first available status type.
      let activeStatus =
        (await tx.statusType.findFirst({
          where: {
            statustypename: { equals: "Assigned", mode: "insensitive" },
          },
        })) ??
        (await tx.statusType.findFirst({
          where: {
            statustypename: { equals: "Active", mode: "insensitive" },
          },
        })) ??
        (await tx.statusType.findFirst({
          orderBy: { statustypename: "asc" },
        }));
      if (!activeStatus) {
        throw new Error("No status type configured");
      }

      // Check for existing assignment inside the transaction to prevent TOCTOU race
      const existingAssignment = await tx.userAssets.findFirst({
        where: { assetid: assetId },
      });

      let assignment;

      if (existingAssignment) {
        // Idempotent: if already assigned to the same user, no-op
        if (existingAssignment.userid === resolvedUserId) {
          return {
            assignment: existingAssignment,
            idempotent: true,
            wasReassigned: false,
            resolvedUserId,
          };
        }
        // Reassign to the new user within the transaction
        assignment = await tx.userAssets.update({
          where: { userassetsid: existingAssignment.userassetsid },
          data: { userid: resolvedUserId, change_date: new Date() },
        });
      } else {
        assignment = await tx.userAssets.create({
          data: {
            assetid: assetId,
            userid: resolvedUserId,
            creation_date: new Date(),
          } as Prisma.userAssetsUncheckedCreateInput,
        });
      }

      await tx.asset.update({
        where: { assetid: assetId },
        data: { statustypeid: activeStatus.statustypeid },
      });

      return {
        assignment,
        idempotent: false,
        wasReassigned: Boolean(existingAssignment),
        resolvedUserId,
      };
    });

    await createAuditLog({
      userId: actingUser.id ?? null,
      action: result.wasReassigned
        ? AUDIT_ACTIONS.REASSIGN
        : AUDIT_ACTIONS.ASSIGN,
      entity: AUDIT_ENTITIES.ASSET,
      entityId: assetId,
      details: {
        userId: result.resolvedUserId,
        idempotent: result.idempotent,
      },
    });

    return new Response(
      JSON.stringify({
        message: result.idempotent
          ? "Asset already assigned to this user"
          : "Asset assigned successfully",
        userAsset: result.assignment,
      }),
      {
        status: 200,
      },
    );
  } catch (error) {
    logger.error("Error assigning asset", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403,
      });
    }
    if (
      error instanceof Error &&
      error.message === "No status type configured"
    ) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }
    return new Response(JSON.stringify({ error: "Error assigning asset" }), {
      status: 500,
    });
  }
}
