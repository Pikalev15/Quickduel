import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminScreen } from "@/components/admin/admin-screen";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("is_admin", {
      requested_roles: ["admin", "moderator", "analyst"],
    });
    if (error || data !== true) notFound();
  } catch {
    notFound();
  }
  return <AdminScreen />;
}
