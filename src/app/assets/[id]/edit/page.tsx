import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Asset Tracker - Edit Asset",
};

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/assets/${encodeURIComponent(id)}?edit=1`);
}
