import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireApiAuth,
  requireNotDemoMode,
  requirePermission,
  type AuthUser,
} from "@/lib/api-auth";
import { hasAnyPermission } from "@/lib/rbac";
import {
  WIDGET_DEFINITIONS,
  defaultWidgetsFor,
} from "@/components/dashboard/WidgetRegistry";
import { logger } from "@/lib/logger";

/**
 * Whether `user` may see a given widget definition at all.
 *
 * Admin-only widgets short-circuit on `isAdmin` because an admin holds every
 * permission in `PERMISSIONS` by construction — see `getOrganizationContext` — but
 * going through `hasAnyPermission` anyway means a widget whose `permission` was
 * later renamed cannot be reached by an admin who somehow lacks it.
 *
 * `adminOnly` is treated as a permission in its own right, because that is what it
 * always meant: nobody but an admin. Previously it was checked only in the client
 * dialog, so `POST` accepted it from anyone.
 */
async function canUseWidget(
  user: AuthUser,
  widgetType: string,
): Promise<boolean> {
  const definition = WIDGET_DEFINITIONS.find((w) => w.type === widgetType);

  // An unknown type can never be rendered, so it is never available.
  if (!definition) return false;

  if (definition.adminOnly && !user.isAdmin) return false;
  if (!definition.permission) return true;
  if (!user.id) return false;

  return hasAnyPermission(user.id, [definition.permission]);
}

/**
 * Drop any persisted widget the caller is no longer entitled to.
 *
 * Defence in depth for the read path: a row saved while the user held the
 * permission (or added directly against the API before this was enforced) would
 * otherwise render forever, because the grid only ever filtered on `visible`.
 */
async function permittedWidgets(
  user: AuthUser,
  widgets: Array<{ widgetType: string }>,
) {
  const verdicts = await Promise.all(
    widgets.map((w) => canUseWidget(user, w.widgetType)),
  );
  return widgets.filter((_, i) => verdicts[i]);
}

// GET /api/dashboard/widgets — return user's widgets ordered by position
export async function GET() {
  try {
    const user = await requireApiAuth();

    const widgets = await prisma.dashboardWidget.findMany({
      where: { userId: user.id },
      orderBy: { position: "asc" },
    });

    if (widgets.length === 0) {
      // Return role-appropriate defaults when user has none saved
      const allowedDefaults = await permittedWidgets(
        user,
        defaultWidgetsFor(!!user.isAdmin),
      );
      const defaults = allowedDefaults.map((w, i) => ({
        id: `default-${i}`,
        userId: user.id,
        widgetType: w.widgetType,
        position: i,
        visible: true,
        config: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      return NextResponse.json(defaults);
    }

    const allowed = await permittedWidgets(user, widgets);
    return NextResponse.json(allowed);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/dashboard/widgets error", { error });
    return NextResponse.json(
      { error: "Failed to fetch dashboard widgets" },
      { status: 500 },
    );
  }
}

// PUT /api/dashboard/widgets — update widget order/visibility
export async function PUT(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requireApiAuth();
    const body = await req.json();
    const { widgets } = body as {
      widgets: Array<{ id: string; position: number; visible: boolean }>;
    };

    if (!Array.isArray(widgets)) {
      return NextResponse.json(
        { error: "Invalid body: widgets array required" },
        { status: 400 },
      );
    }

    // If widgets have default- IDs, we need to persist them first
    const hasDefaults = widgets.some((w) => w.id.startsWith("default-"));

    if (hasDefaults) {
      // Create real records for default widgets.
      //
      // The map is built from the ROLE-APPROPRIATE set, because these synthetic
      // ids were minted by GET against that set. Using `DEFAULT_WIDGETS` here
      // unconditionally meant a non-admin's first drag rewrote their persisted
      // rows with the admin widget types — `default-0` (their "My Assets") became
      // the admin "stats" widget.
      const defaultWidgetMap = new Map(
        defaultWidgetsFor(!!user.isAdmin).map((dw, i) => [`default-${i}`, dw]),
      );

      const createPromises = widgets
        .filter((w) => w.id.startsWith("default-"))
        .map((w) => {
          const def = defaultWidgetMap.get(w.id);
          if (!def) return null;
          return prisma.dashboardWidget.create({
            data: {
              userId: user.id!,
              widgetType: def.widgetType,
              position: w.position,
              visible: w.visible,
            },
          });
        })
        .filter(Boolean);

      await Promise.all(createPromises);

      // Also update any real widgets
      const updatePromises = widgets
        .filter((w) => !w.id.startsWith("default-"))
        .map((w) =>
          prisma.dashboardWidget.update({
            where: { id: w.id },
            data: { position: w.position, visible: w.visible },
          }),
        );

      await Promise.all(updatePromises);
    } else {
      // Update existing widgets
      const updatePromises = widgets.map((w) =>
        prisma.dashboardWidget.update({
          where: { id: w.id },
          data: { position: w.position, visible: w.visible },
        }),
      );

      await Promise.all(updatePromises);
    }

    // Return the updated list
    const updated = await prisma.dashboardWidget.findMany({
      where: { userId: user.id },
      orderBy: { position: "asc" },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("PUT /api/dashboard/widgets error", { error });
    return NextResponse.json(
      { error: "Failed to update dashboard widgets" },
      { status: 500 },
    );
  }
}

// POST /api/dashboard/widgets — add a new widget
export async function POST(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requireApiAuth();
    const body = await req.json();
    const { widgetType } = body as { widgetType: string };

    if (!widgetType) {
      return NextResponse.json(
        { error: "widgetType is required" },
        { status: 400 },
      );
    }

    // Validate widgetType
    const validTypes = WIDGET_DEFINITIONS.map((w) => w.type);
    if (!validTypes.includes(widgetType)) {
      return NextResponse.json(
        {
          error: `Invalid widgetType. Must be one of: ${validTypes.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Enforce the widget's permission BEFORE anything is written.
    //
    // This is the check that was missing. `adminOnly` used to be a client-only
    // filter on the Add Widget dialog, so any authenticated user could POST
    // `{ widgetType: "fleetValue" }` and then read org-wide fleet valuation off
    // the render. Same class of leak for the housing widgets, which expose
    // vacancy, grade cohorts and employee housing history.
    if (!(await canUseWidget(user, widgetType))) {
      return NextResponse.json(
        { error: "You do not have permission to add this widget" },
        { status: 403 },
      );
    }

    // Ensure default widgets are persisted before adding a new one
    const existingWidgets = await prisma.dashboardWidget.findMany({
      where: { userId: user.id },
    });

    if (existingWidgets.length === 0) {
      // Persist the ROLE-APPROPRIATE defaults first, not always the admin set.
      const defaults = await permittedWidgets(
        user,
        defaultWidgetsFor(!!user.isAdmin),
      );
      await Promise.all(
        defaults.map((dw, i) =>
          prisma.dashboardWidget.create({
            data: {
              userId: user.id!,
              widgetType: dw.widgetType,
              position: i,
              visible: true,
            },
          }),
        ),
      );
    }

    // Find max position
    const maxPositionResult = await prisma.dashboardWidget.findFirst({
      where: { userId: user.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const newPosition = (maxPositionResult?.position ?? -1) + 1;

    const definition = WIDGET_DEFINITIONS.find((w) => w.type === widgetType);

    const widget = await prisma.dashboardWidget.create({
      data: {
        userId: user.id!,
        widgetType,
        position: newPosition,
        visible: true,
        config: definition?.defaultConfig
          ? JSON.parse(JSON.stringify(definition.defaultConfig))
          : undefined,
      },
    });

    return NextResponse.json(widget, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("POST /api/dashboard/widgets error", { error });
    return NextResponse.json(
      { error: "Failed to add dashboard widget" },
      { status: 500 },
    );
  }
}

// DELETE /api/dashboard/widgets?id=xxx — remove a widget
export async function DELETE(req: NextRequest) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    const user = await requireApiAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Widget id is required" },
        { status: 400 },
      );
    }

    // If it's a default widget that hasn't been persisted, just return success
    if (id.startsWith("default-")) {
      return NextResponse.json({ success: true });
    }

    // Verify the widget belongs to the user
    const widget = await prisma.dashboardWidget.findFirst({
      where: { id, userId: user.id },
    });

    if (!widget) {
      return NextResponse.json({ error: "Widget not found" }, { status: 404 });
    }

    await prisma.dashboardWidget.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("DELETE /api/dashboard/widgets error", { error });
    return NextResponse.json(
      { error: "Failed to delete dashboard widget" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
