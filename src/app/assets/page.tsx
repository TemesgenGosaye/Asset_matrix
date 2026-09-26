import React from "react";
import Breadcrumb from "@/components/Breadcrumb";
import AssetsTableClient from "./ui/AssetsTableClient";
import {
  getAssets,
  getLocation,
  getUsers,
  getStatus,
  getManufacturers,
  getModel,
  getCategories,
  getUserAssets,
  getDepartments,
  getSuppliers,
} from "@/lib/data";
import { getOrganizationContext } from "@/lib/organization-context";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Asset Tracker - Assets",
  description: "Asset management tool",
};

export default async function Page() {
  let ctx;
  try {
    ctx = await getOrganizationContext();
  } catch {}
  if (!ctx?.userId) {
    redirect("/login");
  }
  const isAdmin = ctx?.isAdmin ?? false;
  const columns = [
    { name: "Sr. No.", uid: "srno" },
    { name: "Asset Name", uid: "assetname", sortable: true },
    { name: "Asset Type", uid: "assetcategorytypeid", sortable: true },
    { name: "PID (Asset ID)", uid: "serialnumber" },
    { name: "Condition", uid: "statustypeid", sortable: true },
    { name: "Location", uid: "locationid", sortable: true },
    { name: "Brand", uid: "manufacturerid", sortable: true },
    { name: "Review Date", uid: "reviewsDate" },
    { name: "Remark", uid: "remark" },
    { name: "Tag", uid: "assettag", sortable: true },
    { name: "Asset ID", uid: "assetid" },
    { name: "Model", uid: "modelid", sortable: true },
    { name: "Belongs To", uid: "belongsto", sortable: true },
    { name: "Department", uid: "departmentid", sortable: true },
    { name: "Price", uid: "purchaseprice", sortable: true },
    { name: "Supplier", uid: "supplierid", sortable: true },
    { name: "Purchase Date", uid: "purchasedate" },
    { name: "Requestable", uid: "requestable", sortable: true },
    { name: "Mobile", uid: "mobile", sortable: true },
    { name: "Specs", uid: "specs" },
    { name: "Notes", uid: "notes" },
    { name: "Actions", uid: "actions" },
  ];

  const selectOptions = [
    { value: "20", label: "20" }, //startvalue
    { value: "25", label: "25" },
    { value: "50", label: "50" },
    { value: "75", label: "75" },
    { value: "100", label: "100" },
    { value: "all", label: "All" },
  ];

  const [
    databaseAssetsRaw,
    location,
    user,
    status,
    manufacturer,
    model,
    categories,
    userAssets,
    departments,
    suppliers,
  ] = await Promise.all([
    getAssets(),
    getLocation(),
    getUsers(),
    getStatus(),
    getManufacturers(),
    getModel(),
    getCategories(),
    getUserAssets(),
    getDepartments().catch(() => []),
    getSuppliers().catch(() => []),
  ]);

  // Sanitize Prisma Decimals (purchaseprice) for client component props
  const databaseAssets = databaseAssetsRaw.map((a) => ({
    ...a,
    purchaseprice:
      a.purchaseprice !== null && a.purchaseprice !== undefined
        ? Number(a.purchaseprice)
        : null,
  }));

  // Self-service: non-admins see their assigned assets + all available assets
  let displayAssets = databaseAssets;
  if (!isAdmin && ctx?.userId) {
    const assignedAssetIds = new Set(
      userAssets
        .filter((ua) => ua.userid === ctx.userId)
        .map((ua) => ua.assetid),
    );
    const availableStatusIds = new Set(
      status
        .filter((s) => s.statustypename.toLowerCase().includes("available"))
        .map((s) => s.statustypeid),
    );
    // Also include assets the user has pending/approved requests for
    const requestedAssetIds = new Set(
      (
        await prisma.itemRequest.findMany({
          where: {
            userId: ctx.userId,
            entityType: "asset",
            status: { in: ["pending", "approved", "return_pending"] },
          },
          select: { entityId: true },
        })
      ).map((r) => r.entityId),
    );
    displayAssets = databaseAssets.filter(
      (a) =>
        assignedAssetIds.has(a.assetid) ||
        requestedAssetIds.has(a.assetid) ||
        (a.statustypeid && availableStatusIds.has(a.statustypeid)),
    );
  }

  return (
    <div>
      <Breadcrumb
        options={[
          { label: "Home", href: "/" },
          { label: "Assets", href: "/assets" },
        ]}
      />
      <AssetsTableClient
        data={displayAssets}
        locations={location}
        departments={departments}
        user={user}
        status={status}
        manufacturers={manufacturer}
        models={model}
        categories={categories}
        suppliers={suppliers}
        columns={columns}
        selectOptions={selectOptions}
        userAssets={userAssets}
        isAdmin={isAdmin}
        currentUserId={ctx?.userId ?? null}
      ></AssetsTableClient>
    </div>
  );
}
