import DashboardWelcomeClient from "./DashboardWelcomeClient";
import { getOrganizationContext } from "@/lib/organization-context";

interface DashboardWelcomeProps {
  headingLevel?: 1 | 2;
  className?: string;
}

const TIME_ZONE = "Africa/Addis_Ababa";

export default async function DashboardWelcome({
  headingLevel = 2,
  className,
}: DashboardWelcomeProps) {
  const ctx = await getOrganizationContext();
  if (!ctx?.userId) return null;

  const fullName = ctx.fullName?.trim() || ctx.name?.trim() || "Colleague";
  const now = new Date();
  const hour =
    Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: TIME_ZONE,
      }).format(now),
    ) % 24;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(now);

  return (
    <DashboardWelcomeClient
      fullName={fullName}
      initialHour={hour}
      initialDateLabel={dateLabel}
      headingLevel={headingLevel}
      className={className}
    />
  );
}
