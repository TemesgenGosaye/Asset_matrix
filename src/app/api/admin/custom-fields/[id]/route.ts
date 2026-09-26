import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin, requireNotDemoMode } from "@/lib/api-auth";
import prisma from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    await requireApiAdmin();

    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.fieldType !== undefined) updateData.fieldType = body.fieldType;
    if (body.entityType !== undefined) updateData.entityType = body.entityType;
    if (body.isRequired !== undefined) updateData.isRequired = body.isRequired;
    if (body.options !== undefined) updateData.options = body.options;
    if (body.displayOrder !== undefined)
      updateData.displayOrder = body.displayOrder;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    updateData.updatedAt = new Date();

    const definition = await prisma.custom_field_definitions.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(definition);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update custom field definition" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    await requireApiAdmin();

    const { id } = await params;
    const body = await request.json();
    const { isActive } = body;

    const definition = await prisma.custom_field_definitions.update({
      where: { id },
      data: {
        isActive,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(definition);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to toggle custom field status" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demoBlock = requireNotDemoMode();
    if (demoBlock) return demoBlock;

    await requireApiAdmin();

    const { id } = await params;

    await prisma.custom_field_definitions.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to delete custom field definition" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
