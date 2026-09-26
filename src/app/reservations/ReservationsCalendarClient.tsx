"use client";

import BookingCalendar, {
  type BookingCalendarProps,
} from "@/components/BookingCalendar";

export default function ReservationsCalendarClient({
  reservations,
}: {
  reservations: BookingCalendarProps["reservations"];
}) {
  return <BookingCalendar reservations={reservations} />;
}
