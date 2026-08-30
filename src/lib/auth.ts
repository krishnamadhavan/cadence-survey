import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { admins } from "@/db/schema";
import { normalizeEmail } from "@/lib/email";

const DUMMY_HASH =
  "$2b$12$pjb4XxJS8c8roYWL/bxgTuEHZw0ISnsvXO7F6XNvEuij7yKyv5BI.";

export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !password) {
    await compare(password || "x", DUMMY_HASH);
    return null;
  }

  const [admin] = await db
    .select({
      id: admins.id,
      email: admins.email,
      passwordHash: admins.passwordHash,
    })
    .from(admins)
    .where(eq(admins.email, normalized))
    .limit(1);

  const ok = await compare(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) {
    return null;
  }

  return { id: admin.id, email: admin.email };
}
