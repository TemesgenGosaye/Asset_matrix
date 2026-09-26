import prisma from "@/lib/prisma";

/**
 * Generate a unique PO number with format PO-YYYYMM-XXXX.
 * Sequential per organization per month.
 */
export async function generatePONumber(
  organizationId: string,
): Promise<string> {
  const now = new Date();
  const prefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      organizationId,
      poNumber: { startsWith: prefix },
    },
    orderBy: { poNumber: "desc" },
    select: { poNumber: true },
  });

  let nextSeq = 1;
  if (lastPO) {
    const parts = lastPO.poNumber.split("-");
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
}
