import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";
import { matchAdminPassword } from "@/lib/password";

export { matchAdminPassword } from "@/lib/password";

export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string; totpEnabled: boolean } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    await matchAdminPassword(password, undefined);
    return null;
  }

  const [admin] = await db
    .select({
      id: admins.id,
      email: admins.email,
      passwordHash: admins.passwordHash,
      totpEnabled: admins.totpEnabled,
    })
    .from(admins)
    .where(eq(admins.email, normalized))
    .limit(1);

  const ok = await matchAdminPassword(password, admin?.passwordHash);
  if (!admin || !ok) {
    return null;
  }

  return { id: admin.id, email: admin.email, totpEnabled: admin.totpEnabled };
}
