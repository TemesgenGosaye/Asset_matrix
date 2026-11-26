import { Prisma } from "@prisma/client";

type StatusLookupClient = Pick<Prisma.TransactionClient, "statusType">;

const ASSIGNED_STATUS_NAMES = ["Assigned", "Active"];
const AVAILABLE_STATUS_NAMES = ["Available", "In Stock", "Ready"];

function normalizeStatusName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function createStatusType(
  client: StatusLookupClient,
  name: string,
  organizationId?: string | null,
): Promise<string> {
  const created = await client.statusType.create({
    data: {
      statustypename: name,
      normalizedName: normalizeStatusName(name),
      isActive: true,
      organizationId: organizationId ?? null,
    },
    select: { statustypeid: true },
  });
  return created.statustypeid;
}

async function resolveStatusId(
  client: StatusLookupClient,
  names: string[],
  organizationId: string | null | undefined,
  fallbackName: string,
): Promise<string> {
  const scopes = organizationId
    ? [{ organizationId }, { organizationId: null }]
    : [{}];

  for (const scope of scopes) {
    for (const name of names) {
      const status = await client.statusType.findFirst({
        where: {
          ...scope,
          AND: [
            {
              OR: [
                { statustypename: { equals: name, mode: "insensitive" } },
                {
                  normalizedName: {
                    equals: normalizeStatusName(name),
                    mode: "insensitive",
                  },
                },
              ],
            },
            { OR: [{ isActive: true }, { isActive: null }] },
          ],
        },
        orderBy: { isActive: "desc" },
        select: { statustypeid: true },
      });
      if (status) return status.statustypeid;
    }
  }

  return createStatusType(client, fallbackName, organizationId);
}

export async function resolveAssignedStatusId(
  client: StatusLookupClient,
  organizationId?: string | null,
): Promise<string> {
  return resolveStatusId(
    client,
    ASSIGNED_STATUS_NAMES,
    organizationId,
    ASSIGNED_STATUS_NAMES[0],
  );
}

export async function resolveAvailableStatusId(
  client: StatusLookupClient,
  organizationId?: string | null,
): Promise<string> {
  return resolveStatusId(
    client,
    AVAILABLE_STATUS_NAMES,
    organizationId,
    AVAILABLE_STATUS_NAMES[0],
  );
}
