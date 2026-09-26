import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { getStorage } from "@/lib/storage";
import prisma from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ key: string }>;
}

// GET /api/house-queue/inspections/photos/[key]
// Serves an inspection photo. The key must belong to an inspection in the
// requester's organization (falls through to 404 otherwise). Cloud providers
// redirect to a pre-signed URL; local storage streams the bytes.
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    await requirePermission("house_queue:view");
    const orgId = await requireOrgId();
    const { key } = await context.params;

    const inspection = await prisma.houseInspection.findFirst({
      where: { organizationId: orgId, photoUrls: { has: key } },
      select: { id: true },
    });
    if (!inspection) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const storage = await getStorage();
    const url = await storage.getUrl(key);
    if (url) {
      return NextResponse.redirect(url);
    }

    const { buffer, contentType } = await storage.download(key);
    const isImage = /^image\/(png|jpe?g|gif|webp)$/.test(contentType);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": isImage
          ? "inline"
          : `attachment; filename="${encodeURIComponent(key)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (e) {
    return handleRouteError(e, {
      label: "GET /api/house-queue/inspections/photos/[key]",
      message: "Failed to serve the inspection photo",
    });
  }
}

export const dynamic = "force-dynamic";