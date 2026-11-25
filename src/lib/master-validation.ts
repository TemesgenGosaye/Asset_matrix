import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export interface MasterRefInput {
  locationid?: string | null;
  location1Id?: string | null;
  statustypeid?: string | null;
  condition1StatusId?: string | null;
  assetcategorytypeid?: string | null;
  manufacturerid?: string | null;
  modelid?: string | null;
  supplierid?: string | null;
}

/**
 * Validate submitted master foreign-key IDs against the organization's master tables.
 * Returns `null` if all provided IDs are valid, or a 400 NextResponse with a clear error message.
 */
export async function validateMasterReferences(
  input: MasterRefInput,
  orgId: string | null | undefined,
  existing?: Partial<MasterRefInput>,
): Promise<NextResponse | null> {
  const orgScope = orgId
    ? { OR: [{ organizationId: orgId }, { organizationId: null }] }
    : {};

  if (input.locationid) {
    const loc = await prisma.location.findFirst({
      where: {
        locationid: input.locationid,
        ...orgScope,
      },
      select: { locationid: true, isActive: true },
    });
    if (!loc) {
      return NextResponse.json(
        { error: "Location (2nd) not found in master list" },
        { status: 400 },
      );
    }
    if (!loc.isActive && input.locationid !== existing?.locationid) {
      return NextResponse.json(
        { error: "Selected Location (2nd) is inactive" },
        { status: 400 },
      );
    }
  }

  if (input.location1Id) {
    const loc1 = await prisma.location.findFirst({
      where: {
        locationid: input.location1Id,
        ...orgScope,
      },
      select: { locationid: true, isActive: true },
    });
    if (!loc1) {
      return NextResponse.json(
        { error: "Location (1st) not found in master list" },
        { status: 400 },
      );
    }
    if (!loc1.isActive && input.location1Id !== existing?.location1Id) {
      return NextResponse.json(
        { error: "Selected Location (1st) is inactive" },
        { status: 400 },
      );
    }
  }

  if (input.statustypeid) {
    const st = await prisma.statusType.findFirst({
      where: { statustypeid: input.statustypeid, ...orgScope },
      select: { statustypeid: true, isActive: true },
    });
    if (!st) {
      return NextResponse.json(
        { error: "Condition (2nd) / Status not found in master list" },
        { status: 400 },
      );
    }
    if (!st.isActive && input.statustypeid !== existing?.statustypeid) {
      return NextResponse.json(
        { error: "Selected Condition (2nd) / Status is inactive" },
        { status: 400 },
      );
    }
  }

  if (input.condition1StatusId) {
    const st1 = await prisma.statusType.findFirst({
      where: { statustypeid: input.condition1StatusId, ...orgScope },
      select: { statustypeid: true, isActive: true },
    });
    if (!st1) {
      return NextResponse.json(
        { error: "Condition (1st) not found in master list" },
        { status: 400 },
      );
    }
    if (
      !st1.isActive &&
      input.condition1StatusId !== existing?.condition1StatusId
    ) {
      return NextResponse.json(
        { error: "Selected Condition (1st) is inactive" },
        { status: 400 },
      );
    }
  }

  if (input.assetcategorytypeid) {
    const cat = await prisma.assetCategoryType.findFirst({
      where: { assetcategorytypeid: input.assetcategorytypeid, ...orgScope },
      select: { assetcategorytypeid: true, isActive: true },
    });
    if (!cat) {
      return NextResponse.json(
        { error: "Category not found in master list" },
        { status: 400 },
      );
    }
    if (
      !cat.isActive &&
      input.assetcategorytypeid !== existing?.assetcategorytypeid
    ) {
      return NextResponse.json(
        { error: "Selected Category is inactive" },
        { status: 400 },
      );
    }
  }

  if (input.manufacturerid) {
    const mfg = await prisma.manufacturer.findFirst({
      where: { manufacturerid: input.manufacturerid, ...orgScope },
      select: { manufacturerid: true },
    });
    if (!mfg) {
      return NextResponse.json(
        { error: "Manufacturer not found in master list" },
        { status: 400 },
      );
    }
  }

  if (input.modelid) {
    const mdl = await prisma.model.findFirst({
      where: { modelid: input.modelid, ...orgScope },
      select: { modelid: true },
    });
    if (!mdl) {
      return NextResponse.json(
        { error: "Model not found in master list" },
        { status: 400 },
      );
    }
  }

  if (input.supplierid) {
    const sup = await prisma.supplier.findFirst({
      where: { supplierid: input.supplierid, ...orgScope },
      select: { supplierid: true },
    });
    if (!sup) {
      return NextResponse.json(
        { error: "Supplier not found in master list" },
        { status: 400 },
      );
    }
  }

  return null;
}
