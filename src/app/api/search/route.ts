import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import {
  getOrganizationContext,
  scopeToOrganization,
} from "@/lib/organization-context";
import { logger } from "@/lib/logger";

interface SearchResult {
  type: "asset" | "user" | "consumable" | "house" | "employee";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export async function GET(req: Request) {
  try {
    await requireApiAuth();
    const orgContext = await getOrganizationContext();
    const orgId = orgContext?.organization?.id;

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results: SearchResult[] = [];

    // Search assets (max 3)
    const assets = await prisma.asset.findMany({
      where: scopeToOrganization(
        {
          OR: [
            { assetname: { contains: query, mode: "insensitive" } },
            { assettag: { contains: query, mode: "insensitive" } },
          ],
        },
        orgId,
      ),
      select: { assetid: true, assetname: true, assettag: true },
      take: 3,
    });

    assets.forEach((asset) => {
      results.push({
        type: "asset",
        id: asset.assetid,
        label: asset.assetname,
        sublabel: asset.assettag,
        href: `/assets/${asset.assetid}`,
      });
    });

    // Search users (max 3)
    const users = await prisma.user.findMany({
      where: scopeToOrganization(
        {
          OR: [
            { firstname: { contains: query, mode: "insensitive" } },
            { lastname: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        },
        orgId,
      ),
      select: { userid: true, firstname: true, lastname: true, email: true },
      take: 3,
    });

    users.forEach((user) => {
      results.push({
        type: "user",
        id: user.userid,
        label: `${user.firstname} ${user.lastname}`,
        sublabel: user.email || undefined,
        href: `/user/${user.userid}`,
      });
    });

    // Search consumables (max 2)
    const consumables = await prisma.consumable.findMany({
      where: scopeToOrganization(
        {
          consumablename: { contains: query, mode: "insensitive" },
        },
        orgId,
      ),
      select: { consumableid: true, consumablename: true, quantity: true },
      take: 2,
    });

    consumables.forEach((con) => {
      results.push({
        type: "consumable",
        id: con.consumableid,
        label: con.consumablename,
        sublabel: `Qty: ${con.quantity}`,
        href: `/consumables/${con.consumableid}`,
      });
    });

    // Search houses (max 3)
    const houses = await prisma.household.findMany({
      where: scopeToOrganization(
        {
          OR: [
            { houseNumber: { contains: query, mode: "insensitive" } },
            { hid: { contains: query, mode: "insensitive" } },
          ],
        },
        orgId,
      ),
      select: {
        id: true,
        houseNumber: true,
        hid: true,
        houseType: true,
        status: true,
        occupancyStatus: true,
      },
      take: 3,
    });

    houses.forEach((house) => {
      results.push({
        type: "house",
        id: house.id,
        label: house.houseNumber || house.hid || "Unknown",
        sublabel: `${house.houseType} - ${house.occupancyStatus}`,
        href: `/household/register?search=${encodeURIComponent(house.houseNumber || house.hid || "")}`,
      });
    });

    // Search employees (max 2)
    const employees = await prisma.employee.findMany({
      where: scopeToOrganization(
        {
          OR: [
            { firstname: { contains: query, mode: "insensitive" } },
            { lastname: { contains: query, mode: "insensitive" } },
            { employeeNumber: { contains: query, mode: "insensitive" } },
          ],
        },
        orgId,
      ),
      select: {
        id: true,
        firstname: true,
        lastname: true,
        employeeNumber: true,
        department: { select: { name: true } },
      },
      take: 2,
    });

    employees.forEach((emp) => {
      if (emp.id) {
        results.push({
          type: "employee",
          id: emp.id,
          label: `${emp.firstname} ${emp.lastname}`,
          sublabel: `${emp.employeeNumber} - ${emp.department?.name || "No Dept"}`,
          href: `/employees/${emp.id}`,
        });
      }
    });

    // Ensure max 10 results total (increased from 8 to accommodate houses)
    return NextResponse.json({ results: results.slice(0, 10) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("GET /api/search error", { error });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
