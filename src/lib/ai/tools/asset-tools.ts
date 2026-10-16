import { tool } from "ai";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { CACHE_TTL, cached, orgScope } from "../cache";

export function createAssetTools(organizationId: string) {
  return {
    searchAssets: tool({
      description:
        "Search assets by name, asset tag, serial number, or model name.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Search keyword (asset name, tag, serial number, or model)",
          ),
        limit: z
          .number()
          .optional()
          .default(8)
          .describe("Maximum number of results to return (default 8)"),
      }),
      execute: async ({ query, limit }) => {
        const cleanQuery = query.trim();
        const assets = await prisma.asset.findMany({
          where: {
            organizationId,
            OR: [
              { assetname: { contains: cleanQuery, mode: "insensitive" } },
              { assettag: { contains: cleanQuery, mode: "insensitive" } },
              { serialnumber: { contains: cleanQuery, mode: "insensitive" } },
              {
                model: {
                  modelname: { contains: cleanQuery, mode: "insensitive" },
                },
              },
            ],
          },
          take: limit,
          select: {
            assetid: true,
            assetname: true,
            assettag: true,
            serialnumber: true,
            purchaseprice: true,
            purchasedate: true,
            warrantyExpires: true,
            model: { select: { modelname: true } },
            manufacturer: { select: { manufacturername: true } },
            department: { select: { name: true, code: true } },
            statusType: { select: { statustypename: true } },
            location: { select: { locationname: true } },
          },
          orderBy: { creation_date: "desc" },
        });

        return {
          totalFound: assets.length,
          assets: assets.map((a) => ({
            id: a.assetid,
            name: a.assetname,
            tag: a.assettag,
            serial: a.serialnumber,
            model: a.model?.modelname || "Unknown",
            manufacturer: a.manufacturer?.manufacturername || "Unknown",
            department: a.department?.name || "Unassigned",
            status: a.statusType?.statustypename || "Active",
            location: a.location?.locationname || "Not assigned",
            warrantyExpires: a.warrantyExpires
              ? a.warrantyExpires.toISOString().split("T")[0]
              : null,
            purchasePrice: a.purchaseprice ? Number(a.purchaseprice) : null,
          })),
        };
      },
    }),

    getExpiringWarranties: tool({
      description:
        "List physical or IT assets whose manufacturer warranties expire within the specified number of days.",
      inputSchema: z.object({
        daysAhead: z
          .number()
          .optional()
          .default(60)
          .describe("Number of days into the future to check (default 60)"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum results to return"),
      }),
      execute: async ({ daysAhead, limit }) => {
        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(now.getDate() + daysAhead);

        const assets = await prisma.asset.findMany({
          where: {
            organizationId,
            warrantyExpires: {
              gte: now,
              lte: futureDate,
            },
          },
          take: limit,
          select: {
            assetid: true,
            assetname: true,
            assettag: true,
            serialnumber: true,
            warrantyExpires: true,
            model: { select: { modelname: true } },
            manufacturer: { select: { manufacturername: true } },
            department: { select: { name: true } },
          },
          orderBy: { warrantyExpires: "asc" },
        });

        return {
          daysChecked: daysAhead,
          count: assets.length,
          assets: assets.map((a) => ({
            id: a.assetid,
            name: a.assetname,
            tag: a.assettag,
            serial: a.serialnumber,
            model: a.model?.modelname || "Unknown",
            manufacturer: a.manufacturer?.manufacturername || "Unknown",
            department: a.department?.name || "Unassigned",
            warrantyExpires: a.warrantyExpires
              ? a.warrantyExpires.toISOString().split("T")[0]
              : "Unknown",
          })),
        };
      },
    }),

    getAssetCount: tool({
      description:
        "Fast aggregate: total registered assets, total purchase value, warranty count expiring within 60 days, and the per-category asset count. Use this instead of searchAssets when the user only needs a count or the estate value.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const data = await cached(
            `${orgScope(organizationId)}:assets:overview`,
            CACHE_TTL.aggregates,
            async () => {
              const [total, value, warrantySoon, byCategory] =
                await Promise.all([
                  prisma.asset.count({ where: { organizationId } }),
                  prisma.asset.aggregate({
                    where: { organizationId },
                    _sum: { purchaseprice: true },
                  }),
                  prisma.asset.count({
                    where: {
                      organizationId,
                      warrantyExpires: {
                        gte: new Date(),
                        lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                      },
                    },
                  }),
                  prisma.asset.groupBy({
                    by: ["assetcategorytypeid"],
                    where: { organizationId },
                    _count: { assetid: true },
                  }),
                ]);

              const categories = await prisma.assetCategoryType.findMany({
                where: {
                  assetcategorytypeid: {
                    in: byCategory
                      .map((r) => r.assetcategorytypeid)
                      .filter(Boolean) as string[],
                  },
                },
                select: {
                  assetcategorytypeid: true,
                  assetcategorytypename: true,
                },
              });
              const nameById = new Map(
                categories.map((c) => [
                  c.assetcategorytypeid,
                  c.assetcategorytypename,
                ]),
              );

              return {
                total,
                totalValue: Number(value._sum.purchaseprice ?? 0),
                warrantySoon,
                byCategory: byCategory
                  .map((r) => ({
                    category:
                      (r.assetcategorytypeid &&
                        nameById.get(r.assetcategorytypeid)) ||
                      "Uncategorised",
                    count: r._count.assetid,
                  }))
                  .sort((a, b) => b.count - a.count),
              };
            },
          );

          return data;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to count assets: ${message}` };
        }
      },
    }),

    getStockAlerts: tool({
      description:
        "Retrieve low-stock inventory alerts for consumables (quantity at or below the reorder minimum) and licence seats that are nearly exhausted (10% or fewer seats free).",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of items to return"),
      }),
      execute: async ({ limit }) => {
        try {
          // Read every consumable rather than a `take` slice: the low-stock set
          // is defined by a comparison, so a LIMIT applied before the filter
          // would silently miss items.
          const [consumables, licences] = await Promise.all([
            prisma.consumable.findMany({
              where: { organizationId },
              orderBy: { quantity: "asc" },
              take: 500,
              select: {
                consumableid: true,
                consumablename: true,
                quantity: true,
                minQuantity: true,
                consumableCategoryType: {
                  select: { consumablecategorytypename: true },
                },
                manufacturer: { select: { manufacturername: true } },
              },
            }),
            prisma.licence.findMany({
              where: { organizationId },
              take: 200,
              select: {
                licenceid: true,
                licenceCategoryType: {
                  select: { licencecategorytypename: true },
                },
                seatCount: true,
                expirationdate: true,
                seatAssignments: {
                  where: { unassignedAt: null },
                  select: { id: true },
                },
              },
            }),
          ]);

          const lowStockConsumables = consumables
            .filter((c) => c.quantity <= c.minQuantity)
            .slice(0, limit)
            .map((c) => ({
              id: c.consumableid,
              name: c.consumablename,
              currentQuantity: c.quantity,
              minThreshold: c.minQuantity,
              category:
                c.consumableCategoryType?.consumablecategorytypename ||
                "Uncategorised",
              manufacturer: c.manufacturer?.manufacturername || "Unknown",
            }));

          const strainedLicences = licences
            .map((l) => {
              const used = l.seatAssignments.length;
              return {
                id: l.licenceid,
                software:
                  l.licenceCategoryType?.licencecategorytypename ||
                  "Uncategorised licence",
                totalSeats: l.seatCount,
                seatsUsed: used,
                seatsAvailable: Math.max(0, l.seatCount - used),
                expires: l.expirationdate
                  ? l.expirationdate.toISOString().split("T")[0]
                  : "Perpetual",
              };
            })
            .filter(
              (l) =>
                l.seatsAvailable <= Math.max(1, Math.floor(l.totalSeats * 0.1)),
            )
            .slice(0, limit);

          return {
            lowStockConsumables,
            strainedLicences,
            note: "A consumable is low when on-hand quantity is at or below its minimum. A licence is strained at 10% or fewer free seats.",
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { error: `Failed to read stock alerts: ${message}` };
        }
      },
    }),

    getAssetDetails: tool({
      description:
        "Fetch full details, specs, location, and maintenance notes for a specific asset by its tag or ID.",
      inputSchema: z.object({
        identifier: z
          .string()
          .describe("The asset tag (e.g. AST-0012) or UUID of the asset"),
      }),
      execute: async ({ identifier }) => {
        const clean = identifier.trim();
        const asset = await prisma.asset.findFirst({
          where: {
            organizationId,
            OR: [{ assettag: clean }, { assetid: clean }],
          },
          include: {
            model: true,
            manufacturer: true,
            department: true,
            location: true,
            statusType: true,
            // Ordered by the due date, which is the field that actually exists
            // on the schedule. `title` is the human label; `isActive` separates
            // a live schedule from a retired one.
            maintenance_schedules: {
              take: 3,
              orderBy: { nextDueDate: "desc" },
            },
          },
        });

        if (!asset) {
          return { error: `Asset with identifier '${identifier}' not found.` };
        }

        return {
          id: asset.assetid,
          name: asset.assetname,
          tag: asset.assettag,
          serial: asset.serialnumber,
          specs: asset.specs,
          notes: asset.notes,
          status: asset.statusType?.statustypename || "Active",
          department: asset.department?.name || "Unassigned",
          location: asset.location?.locationname || "Unassigned",
          model: asset.model?.modelname || "Unknown",
          manufacturer: asset.manufacturer?.manufacturername || "Unknown",
          purchaseDate: asset.purchasedate
            ? asset.purchasedate.toISOString().split("T")[0]
            : null,
          purchasePrice: asset.purchaseprice
            ? Number(asset.purchaseprice)
            : null,
          warrantyExpires: asset.warrantyExpires
            ? asset.warrantyExpires.toISOString().split("T")[0]
            : null,
          recentMaintenance: asset.maintenance_schedules.map((m) => ({
            title: m.title,
            frequency: m.frequency,
            active: m.isActive,
            nextDue: m.nextDueDate?.toISOString().split("T")[0] ?? null,
            lastCompleted: m.lastCompletedAt
              ? m.lastCompletedAt.toISOString().split("T")[0]
              : null,
          })),
        };
      },
    }),
  };
}
