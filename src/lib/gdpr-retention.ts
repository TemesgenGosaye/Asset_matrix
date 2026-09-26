import prisma from "./prisma";
import { getGDPRSettings } from "./gdpr-settings";

/**
 * Purge audit logs older than the configured retention period.
 * Returns the number of deleted records.
 */
export async function purgeExpiredAuditLogs(): Promise<number> {
  const settings = getGDPRSettings();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - settings.auditLogRetentionDays);

  const result = await prisma.audit_logs.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  });

  return result.count;
}
