import { NextRequest, NextResponse } from "next/server";
import { requireNotDemoMode, requirePermission } from "@/lib/api-auth";
import { handleRouteError, requireOrgId } from "@/lib/api-route";
import { getStorage } from "@/lib/storage";
import prisma from "@/lib/prisma";
import { basename, extname } from "path";
import crypto from "crypto";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Image magic bytes (extension-spoofing guard). Only photos are allowed.
const MAGIC_BYTES: Record<string, number[][]> = {
  ".png": [[0x89, 0x50, 0x4e, 0x47]],
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".gif": [[0x47, 0x49, 0x46, 0x38]],
  ".webp": [[0x52, 0x49, 0x46, 0x46]],
};

const ALLOWED_EXTENSIONS = new Set(Object.keys(MAGIC_BYTES));

// POST /api/house-queue/inspections/[id]/photos
// Multipart: { file } — appends a photo to the open handback inspection.
// Requires house_queue:manage.
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    await requirePermission("house_queue:manage");
    const orgId = await requireOrgId();
    const { id } = await context.params;

    const inspection = await prisma.houseInspection.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, resolvedTo: true, photoUrls: true },
    });
    if (!inspection) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }
    if (inspection.resolvedTo) {
      return NextResponse.json(
        { error: "This inspection is already completed." },
        { status: 409 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10 MB limit" },
        { status: 400 },
      );
    }

    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type '${ext}' is not allowed. Only images may be uploaded.` },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const signatures = MAGIC_BYTES[ext];
    const ok = signatures.some((sig) =>
      sig.every((byte, i) => buffer[i] === byte),
    );
    if (!ok) {
      return NextResponse.json(
        { error: "File content does not match its extension" },
        { status: 400 },
      );
    }

    const key = `hq-insp-${crypto.randomUUID()}${ext}`;
    const storage = await getStorage();
    await storage.upload(key, buffer, file.type);

    const photoUrl = `/api/house-queue/inspections/photos/${key}`;
    await prisma.houseInspection.update({
      where: { id },
      data: { photoUrls: [...inspection.photoUrls, photoUrl] },
    });

    return NextResponse.json(
      { success: true, photoUrl, originalName: basename(file.name) },
      { status: 201 },
    );
  } catch (e) {
    return handleRouteError(e, {
      label: "POST /api/house-queue/inspections/[id]/photos",
      message: "Failed to upload the inspection photo",
    });
  }
}

export const dynamic = "force-dynamic";