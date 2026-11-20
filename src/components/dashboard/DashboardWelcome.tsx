import DashboardWelcomeClient from "./DashboardWelcomeClient";

interface DashboardWelcomeProps {
  fullName: string;
  headingLevel?: 1 | 2;
  className?: string;
}

const TIME_ZONE = "Africa/Addis_Ababa";

export default function DashboardWelcome({
  fullName,
  headingLevel = 2,
  className,
}: DashboardWelcomeProps) {
  const displayName = fullName.trim() || "Colleague";
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
      fullName={displayName}
      initialHour={hour}
      initialDateLabel={dateLabel}
      headingLevel={headingLevel}
      className={className}
    />
  );
}
