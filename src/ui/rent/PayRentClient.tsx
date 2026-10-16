"use client";

/**
 * Client shell for the Pay Rent page.
 *
 * Owns exactly one piece of state - the Gregorian / Ethiopian calendar display
 * preference - and shares it with both the toggle and the register table.
 *
 * The toggle is DISPLAY ONLY: dates are always stored as Gregorian/UTC in
 * PostgreSQL, and switching the toggle changes how a date is rendered, never
 * which date it is.
 */

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RentCapabilities } from "@/lib/rent/access";
import type { RentSummary } from "@/lib/rent/types";
import RentersTable from "./RentersTable";

interface PayRentClientProps {
  capabilities: RentCapabilities;
  initialSummary: RentSummary;
}

export default function PayRentClient({
  capabilities,
  initialSummary,
}: PayRentClientProps) {
  const [ethiopianCalendar, setEthiopianCalendar] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={ethiopianCalendar}
          onClick={() => setEthiopianCalendar((prev) => !prev)}
          title="Switch between Gregorian and Ethiopian calendar display. Stored dates are always Gregorian."
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {ethiopianCalendar ? "ዓ.ም (Ethiopian)" : "Gregorian"}
        </Button>
      </div>

      <RentersTable
        capabilities={capabilities}
        initialSummary={initialSummary}
        ethiopianCalendar={ethiopianCalendar}
      />
    </div>
  );
}
