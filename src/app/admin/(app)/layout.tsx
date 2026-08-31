import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSessionUser } from "@/lib/admin";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSessionUser();
  if (!admin) {
    const pathname = (await headers()).get("x-pathname") ?? "/admin";
    const next = pathname.startsWith("/admin") ? pathname : "/admin";
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }

  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
