import { type NextRequest, NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import {
  requireApiAuth,
  requirePermission,
  requireNotDemoMode,
} from "@/lib/api-auth";
import { hasPermission } from "@/lib/rbac";
import {
  getOrganizationContext,
  scopeToOrganization,
} from "@/lib/organization-context";
import { applyDepartmentScopeToUsers } from "@/lib/department-access";
import { updateUserSchema } from "@/lib/validation";
import { setUserPassword } from "@/lib/auth-utils";
import {
  parsePaginationParams,
  buildPrismaArgs,
  buildPaginatedResponse,
} from "@/lib/pagination";
import { logger } from "@/lib/logger";
import { triggerWebhook } from "@/lib/webhooks";
import { createAuditLog, AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-log";
import { invalidateCacheByPrefix } from "@/lib/cache";

const USER_SORT_FIELDS = ["firstname", "lastname", "email", "creation_date"];

const stripPassword = (user) => {
  if (!user) return user;
  const { password: _password, ...rest } = user;
  return rest;
};

// GET /api/user
// Optional query: ?id=<userid>
// Pagination: ?page=1&pageSize=25&sortBy=lastname&sortOrder=asc&search=keyword
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireApiAuth();
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (id) {
      // Users can view their own profile; others need user:view permission
      if (authUser.id !== id) {
        const canViewUsers =
          authUser.isAdmin ||
          (authUser.id ? await hasPermission(authUser.id, "user:view") : false);
        if (!canViewUsers) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // Scope to organization (except for own profile)
      let user;
      if (authUser.id === id) {
        user = await prisma.user.findUnique({ where: { userid: id } });
      } else {
        const orgContext = await getOrganizationContext();
        const orgId = orgContext?.organization?.id;
        user = await prisma.user.findFirst({
          where: scopeToOrganization({ userid: id }, orgId),
        });
      }

      if (!user) {
        return NextResponse.json(
          { error: `User with id ${id} not found` },
          { status: 404 },
        );
      }
      return NextResponse.json(stripPassword(user), { status: 200 });
    }

    // Listing all users requires user:view permission
    const canViewUsers =
      authUser.isAdmin ||
      (authUser.id ? await hasPermission(authUser.id, "user:view") : false);
    if (!canViewUsers) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id;

    // If no `page` param, return all results for backward compatibility
    if (!searchParams.has("page")) {
      const baseWhere = scopeToOrganization({}, orgId);
      const where = await applyDepartmentScopeToUsers(baseWhere, authUser);
      const users = await prisma.user.findMany({ where });
      return NextResponse.json(users.map(stripPassword), { status: 200 });
    }

    // Paginated path
    const params = parsePaginationParams(searchParams);
    const prismaArgs = buildPrismaArgs(params, USER_SORT_FIELDS);

    const baseWhere: Record<string, unknown> = scopeToOrganization({}, orgId);

    // Full-text search using tsvector GIN index (falls back to ILIKE if needed)
    if (params.search) {
      const tsQuery = params.search.trim().split(/\s+/).join(" & ");
      const matchingIds = await prisma
        .$queryRawUnsafe<
          Array<{ userid: string }>
        >(`SELECT "userid" FROM "user" WHERE "search_vector" @@ websearch_to_tsquery('english', $1)`, tsQuery)
        .catch(() => null);

      if (matchingIds && matchingIds.length > 0) {
        baseWhere.userid = { in: matchingIds.map((r) => r.userid) };
      } else if (matchingIds) {
        // tsvector returned no results — empty set
        baseWhere.userid = { in: [] };
      } else {
        // Fallback to ILIKE if tsvector query failed (e.g. migration not applied yet)
        baseWhere.OR = [
          { firstname: { contains: params.search, mode: "insensitive" } },
          { lastname: { contains: params.search, mode: "insensitive" } },
          { email: { contains: params.search, mode: "insensitive" } },
          { username: { contains: params.search, mode: "insensitive" } },
        ];
      }
    }

    const where = await applyDepartmentScopeToUsers(baseWhere, authUser);

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, ...prismaArgs }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json(
      buildPaginatedResponse(users.map(stripPassword), total, params),
      { status: 200 },
    );
  } catch (error) {
    logger.error("GET /api/user error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 },
    );
  }
}

// PUT /api/user
// Body must include userid; any provided fields will be updated
export async function PUT(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const authUser = await requireApiAuth();
    const body = await req.json();
    const { userid, password, _expectedVersion, ...data } = body || {};

    if (!userid) {
      return NextResponse.json(
        { error: "userid is required to update a user" },
        { status: 400 },
      );
    }

    // Optimistic concurrency check
    if (_expectedVersion) {
      const current = await prisma.user.findUnique({
        where: { userid },
        select: { change_date: true },
      });
      if (
        current?.change_date &&
        new Date(_expectedVersion).getTime() !==
          new Date(current.change_date).getTime()
      ) {
        return NextResponse.json(
          {
            error:
              "This user was modified by another admin. Please refresh and try again.",
          },
          { status: 409 },
        );
      }
    }

    if (!authUser.isAdmin && authUser.id !== userid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify target user belongs to requester's org (skip for own profile)
    if (authUser.id !== userid) {
      const orgContext = await getOrganizationContext();
      const orgId = orgContext?.organization?.id;
      const targetUser = await prisma.user.findFirst({
        where: scopeToOrganization({ userid }, orgId),
        select: { userid: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
    }

    const schema = authUser.isAdmin
      ? updateUserSchema
      : updateUserSchema.omit({
          isadmin: true,
          canrequest: true,
          departmentId: true,
          accessExpiresAt: true,
        });

    // Convert empty strings to undefined so optional fields pass validation
    const cleanedData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      cleanedData[key] = value === "" ? undefined : value;
    }

    const validationResult = schema.strict().safeParse({
      ...cleanedData,
      ...(typeof password === "string" && password.length > 0
        ? { password }
        : {}),
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validationResult.error.issues },
        { status: 400 },
      );
    }

    const updateData = { ...validationResult.data } as Record<string, unknown>;
    // Normalize email — BetterAuth sign-in lowercases the lookup email, so storing
    // mixed-case emails makes those accounts impossible to log into.
    if (typeof updateData.email === "string") {
      updateData.email = updateData.email.trim().toLowerCase();
    }
    // Strip password from profile update — it goes to accounts.password via setUserPassword.
    const newPassword = updateData.password as string | undefined;
    delete updateData.password;

    // Convert accessExpiresAt string to Date or null
    if ("accessExpiresAt" in updateData) {
      updateData.accessExpiresAt = updateData.accessExpiresAt
        ? new Date(updateData.accessExpiresAt as string)
        : null;
    }

    const updated = await prisma.user.update({
      where: { userid },
      data: {
        ...updateData,
        change_date: new Date(),
      },
    });

    if (newPassword) {
      await setUserPassword(userid, newPassword);
    }

    // Invalidate the cached user list so the /user page shows fresh data.
    await invalidateCacheByPrefix("users:");

    triggerWebhook("user.updated", {
      userId: userid,
      changes: [
        ...Object.keys(updateData),
        ...(newPassword ? ["password"] : []),
      ],
    }).catch(() => {});

    return NextResponse.json(stripPassword(updated), { status: 200 });
  } catch (error) {
    logger.error("PUT /api/user error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 },
    );
  }
}

// DELETE /api/user
// Body: { userid }
export async function DELETE(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const authUser = await requirePermission("user:delete");

    const body = await req.json().catch(() => ({}));
    const userid: unknown = (body as Record<string, unknown>)?.userid;
    if (typeof userid !== "string" || !userid.trim()) {
      return NextResponse.json(
        { error: "userid is required to delete a user" },
        { status: 400 },
      );
    }

    // Admins must never delete their own account.
    if (authUser.id === userid) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 },
      );
    }

    // The target user must exist and belong to the requester's organization.
    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id;
    const target = await prisma.user.findFirst({
      where: scopeToOrganization({ userid }, orgId),
      select: {
        userid: true,
        firstname: true,
        lastname: true,
        email: true,
        username: true,
      },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Rows that hard-reference the user with NO ACTION/RESTRICT FKs must be
        // cleaned up before the user row can be removed:
        //  - userAssets / userAccessoires / userHistory are the user's item
        //    assignment records (all other FKs cascade or SET NULL).
        await tx.userHistory.deleteMany({ where: { userid } });
        await tx.userAssets.deleteMany({ where: { userid } });
        await tx.userAccessoires.deleteMany({ where: { userid } });

        // Licence seats are nullable — detach the user instead of blocking.
        await tx.licence.updateMany({
          where: { licenceduserid: userid },
          data: { licenceduserid: null },
        });

        // Everything else cascades (sessions, accounts, tickets, requests…)
        // or is SET NULL automatically.
        await tx.user.delete({ where: { userid } });
      });
    } catch (dbError) {
      if (
        dbError instanceof Object &&
        "code" in dbError &&
        dbError.code === "P2003"
      ) {
        logger.warn("User deletion blocked by foreign key constraint", {
          userid,
          error: dbError,
        });
        return NextResponse.json(
          {
            error:
              "This user cannot be deleted because they were involved in other records (e.g. audit campaigns, consumable/component checkouts). Reassign those records or deactivate the user instead.",
          },
          { status: 409 },
        );
      }
      throw dbError;
    }

    // Invalidate the cached user list so the /user page stops showing them.
    await invalidateCacheByPrefix("users:");

    await createAuditLog({
      userId: authUser.id,
      action: AUDIT_ACTIONS.DELETE,
      entity: AUDIT_ENTITIES.USER,
      entityId: userid,
      details: {
        username: target.username,
        email: target.email,
      },
    });

    triggerWebhook("user.deleted", {
      userId: userid,
      email: target.email,
      organizationId: orgId,
    }).catch(() => {});

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("DELETE /api/user error", { error });
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
