import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getManagerSessionUser } from "@/lib/manager";
import { safeManagerNext } from "@/lib/manager-path";

export default async function ManagerAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const manager = await getManagerSessionUser();
  if (!manager) {
    const pathname = (await headers()).get("x-pathname") ?? "/manage";
    redirect(`/manage/login?next=${encodeURIComponent(safeManagerNext(pathname))}`);
  }

  return children;
}
