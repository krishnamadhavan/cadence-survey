import { compare } from "bcryptjs";

const DUMMY_HASH =
  "$2b$12$pjb4XxJS8c8roYWL/bxgTuEHZw0ISnsvXO7F6XNvEuij7yKyv5BI.";

export async function matchAdminPassword(
  password: string,
  passwordHash: string | undefined,
): Promise<boolean> {
  const ok = await compare(password || "x", passwordHash ?? DUMMY_HASH);
  return Boolean(passwordHash) && ok;
}
