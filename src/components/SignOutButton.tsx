"use client";

import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function SignOutButton() {
  const router = useRouter();

  return (
    <DropdownMenuItem
      className="text-destructive cursor-pointer"
      onSelect={async (e) => {
        e.preventDefault();
        await signOut();
        router.push("/login");
      }}
    >
      Log Out
    </DropdownMenuItem>
  );
}
