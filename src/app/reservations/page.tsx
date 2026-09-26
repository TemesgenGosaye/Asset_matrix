import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Breadcrumb from "@/components/Breadcrumb";
import prisma from "@/lib/prisma";
import ReservationsCalendarClient from "./ReservationsCalendarClient";
import MyItemRequestsClient from "./MyItemRequestsClient";

export const metadata = {
  title: "Asset Tracker - Reservations",
  description: "View asset reservation calendar",
};

export default async function ReservationsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Self-service restriction: non-admins only see their own reservations
  const isAdmin = session.user.isadmin;
  const baseWhere = isAdmin ? {} : { userId: session.user.id };

  const reservations = await prisma.assetReservation.findMany({
    where: {
      ...baseWhere,
      status: { notIn: ["cancelled", "rejected"] },
    },
    include: {
      asset: {
        select: { assetid: true, assetname: true, assettag: true },
      },
      user: {
        select: { userid: true, firstname: true, lastname: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  // Serialize dates for the client component
  const serialized = reservations.map((r) => ({
    id: r.id,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    status: r.status,
    user: { firstname: r.user.firstname, lastname: r.user.lastname },
    asset: { assetname: r.asset.assetname, assettag: r.asset.assettag },
  }));

  return (
    <div className="space-y-6 p-6">
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Reservations", href: "/reservations" },
        ]}
      />
      <h1 className="text-2xl font-bold">Reservations</h1>
      <ReservationsCalendarClient reservations={serialized} />
      {!isAdmin && <MyItemRequestsClient />}
    </div>
  );
}
