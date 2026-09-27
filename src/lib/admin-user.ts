export type SessionUser = {
  id: string;
  email: string;
};

export async function resolveSessionUser(
  adminId: string,
  lookup: () => Promise<SessionUser | undefined>,
): Promise<SessionUser | null> {
  try {
    const admin = await lookup();
    return admin ?? null;
  } catch {
    return { id: adminId, email: "Admin" };
  }
}
