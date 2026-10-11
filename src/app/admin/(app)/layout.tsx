import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminSessionUser } from "@/lib/admin";
import { viewerMayOpen } from "@/lib/admin-role";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSessionUser();
  const pathname = (await headers()).get("x-pathname") ?? "/admin";
  if (!admin) {
    const next = pathname.startsWith("/admin") ? pathname : "/admin";
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }
  if (admin.role === "viewer" && !viewerMayOpen(pathname)) {
    redirect("/admin/dashboard");
  }

  const sidebarCollapsed =
    (await cookies()).get("cadence_sidebar")?.value === "1";

  return (
    <AdminShell
      email={admin.email}
      role={admin.role}
      sidebarCollapsed={sidebarCollapsed}
    >
      {children}
    </AdminShell>
  );
}
